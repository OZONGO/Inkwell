use rusqlite::{params, Connection, Row};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

// 剪贴板最大保留条数（兜底默认值，实际运行时从 settings 表读取）
#[allow(dead_code)]
const MAX_CLIPBOARD_ITEMS: i64 = 50;

/// 剪贴板条目 / 常用语 DTO，序列化格式匹配前端 ClipItem TS 接口
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClipItemDto {
    pub id: String, // SQLite rowid (i64) → .to_string()
    #[serde(rename = "type")]
    pub kind: String, // "text" | "image"
    pub text: Option<String>,
    pub image_thumb: Option<String>, // 图片：data URL（jpeg base64）；文本：None
    pub image_path: Option<String>,  // 图片：原图绝对路径（粘贴用）；文本：None
    pub source: Option<String>,      // 恒为 None（无按应用追踪）
    pub time: i64,                   // created_at，epoch ms
}

/// 初始化数据库 schema（剪贴板表 + 常用语表 + 索引）
pub fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS clipboard_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            text TEXT,
            content_hash TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_clip_created ON clipboard_items(created_at DESC);

        CREATE TABLE IF NOT EXISTS phrases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            sort_order INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_phrases_sort ON phrases(sort_order);

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )
    .map_err(|e| e.to_string())?;

    // Task 8 迁移：为旧库补充图片列（SQLite 对重复列返回 SQLITE_ERROR，靠消息字符串识别）
    for sql in [
        "ALTER TABLE clipboard_items ADD COLUMN original_path TEXT",
        "ALTER TABLE clipboard_items ADD COLUMN thumb_path TEXT",
        "ALTER TABLE clipboard_items ADD COLUMN file_path TEXT",
    ] {
        conn.execute(sql, [])
            .or_else(|e| match e {
                rusqlite::Error::SqliteFailure(_, Some(msg))
                    if msg.contains("duplicate column") =>
                {
                    Ok(0)
                }
                _ => Err(e),
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 读取全部设置为 HashMap
pub fn get_settings(conn: &Connection) -> Result<HashMap<String, String>, String> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<HashMap<_, _>>>().map_err(|e| e.to_string())
}

/// 写入单个设置键（UPSERT）
pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// 初始化默认设置（仅在键不存在时写入，不覆盖用户已设置的值）
pub fn init_default_settings(conn: &Connection) -> Result<(), String> {
    let defaults = [
        ("max_items", "50"),
        ("hotkey_panel", "alt+v"),
        ("hotkey_search", "alt+c"),
        ("theme", "follow"),
        ("accent", "blue"),
        ("autostart", "off"),
    ];
    for (key, value) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
            params![key, value],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 读取 max_items 设置（解析失败或缺失时返回默认 50）
pub fn get_max_items(conn: &Connection) -> Result<i64, String> {
    let value: Option<String> = conn.query_row(
        "SELECT value FROM settings WHERE key = 'max_items'",
        [],
        |row| row.get(0),
    ).or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        _ => Err(e),
    }).map_err(|e| e.to_string())?;
    Ok(value.and_then(|v| v.parse::<i64>().ok()).unwrap_or(50))
}

/// 插入文本条目：若已存在相同文本则置顶（更新 created_at），否则插入新行；随后执行淘汰
pub fn insert_clipboard_text(conn: &Connection, text: &str) -> Result<(), String> {
    let existing: rusqlite::Result<i64> = conn.query_row(
        "SELECT id FROM clipboard_items WHERE kind = 'text' AND text = ?",
        params![text],
        |row| row.get(0),
    );
    match existing {
        Ok(id) => {
            // 已存在：更新 created_at 到当前时间（置顶）
            conn.execute(
                "UPDATE clipboard_items SET created_at = ? WHERE id = ?",
                params![now_ms(), id],
            )
            .map_err(|e| e.to_string())?;
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // 不存在：插入新行，计算 sha256 内容哈希
            let hash = hex::encode(Sha256::digest(text.as_bytes()));
            conn.execute(
                "INSERT INTO clipboard_items (kind, text, content_hash, created_at) VALUES ('text', ?, ?, ?)",
                params![text, hash, now_ms()],
            )
            .map_err(|e| e.to_string())?;
        }
        Err(e) => return Err(e.to_string()),
    }
    enforce_max_items(conn, get_max_items(conn)?)?;
    Ok(())
}

/// 插入图片条目：按 content_hash 去重，已存在则置顶；file_path 为 Some 表示来自 CF_HDROP 文件复制
pub fn insert_clipboard_image(
    conn: &Connection,
    hash: &str,
    original_path: &str,
    thumb_path: &str,
    file_path: Option<&str>,
) -> Result<(), String> {
    let existing: rusqlite::Result<i64> = conn.query_row(
        "SELECT id FROM clipboard_items WHERE kind = 'image' AND content_hash = ?",
        params![hash],
        |row| row.get(0),
    );
    match existing {
        Ok(id) => {
            conn.execute(
                "UPDATE clipboard_items SET created_at = ? WHERE id = ?",
                params![now_ms(), id],
            )
            .map_err(|e| e.to_string())?;
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            conn.execute(
                "INSERT INTO clipboard_items (kind, content_hash, original_path, thumb_path, file_path, created_at) VALUES ('image', ?, ?, ?, ?, ?)",
                params![hash, original_path, thumb_path, file_path, now_ms()],
            )
            .map_err(|e| e.to_string())?;
        }
        Err(e) => return Err(e.to_string()),
    }
    enforce_max_items(conn, get_max_items(conn)?)?;
    Ok(())
}

/// 按 id 获取图片条目的 (original_path, file_path)，用于粘贴。无则返回 (None, None)
pub fn get_clipboard_image_path(
    conn: &Connection,
    id: i64,
) -> Result<(Option<String>, Option<String>), String> {
    conn.query_row(
        "SELECT original_path, file_path FROM clipboard_items WHERE id = ? AND kind = 'image'",
        params![id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok((None, None)),
        _ => Err(e),
    })
    .map_err(|e| e.to_string())
}

/// 列出最近 limit 条剪贴板条目（按 created_at 降序）；图片条目读取缩略图生成 data URL
pub fn list_clipboard(conn: &Connection, limit: i64) -> Result<Vec<ClipItemDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, kind, text, content_hash, original_path, thumb_path, file_path, created_at FROM clipboard_items ORDER BY created_at DESC LIMIT ?",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![limit], row_to_clip_dto)
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

/// 列出全部常用语（按 sort_order 升序）
pub fn list_phrases(conn: &Connection) -> Result<Vec<ClipItemDto>, String> {
    let mut stmt = conn
        .prepare("SELECT id, text, created_at, sort_order FROM phrases ORDER BY sort_order ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_phrase_dto)
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

/// 按 id 获取剪贴板文本（用于粘贴）
pub fn get_clipboard_text(conn: &Connection, id: i64) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT text FROM clipboard_items WHERE id = ?",
        params![id],
        |row| row.get::<_, Option<String>>(0),
    )
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        _ => Err(e),
    })
    .map_err(|e| e.to_string())
}

/// 将指定剪贴板条目置顶（更新 created_at 为当前时间）
pub fn move_clipboard_to_first(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute(
        "UPDATE clipboard_items SET created_at = ? WHERE id = ?",
        params![now_ms(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 删除指定剪贴板条目；若为图片，同时删除磁盘上的原图与缩略图（缺失文件忽略）
pub fn delete_clipboard_item(conn: &Connection, id: i64) -> Result<(), String> {
    let (original_path, thumb_path): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT original_path, thumb_path FROM clipboard_items WHERE id = ?",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok((None, None)),
            _ => Err(e),
        })
        .map_err(|e| e.to_string())?;
    if let Some(p) = original_path {
        let _ = std::fs::remove_file(Path::new(&p));
    }
    if let Some(p) = thumb_path {
        let _ = std::fs::remove_file(Path::new(&p));
    }
    conn.execute("DELETE FROM clipboard_items WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 将剪贴板条目移入常用语；图片条目不允许移入。
/// 移入 = 复制到常用语，原剪贴板条目保留（用户可在剪贴板里继续使用或手动删除）
pub fn move_clipboard_to_phrases(conn: &Connection, id: i64) -> Result<(), String> {
    let (kind, text): (String, Option<String>) = conn
        .query_row(
            "SELECT kind, text FROM clipboard_items WHERE id = ?",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    if kind != "text" {
        return Err("images cannot be moved to phrases".to_string());
    }
    let text = text.ok_or_else(|| "clipboard item has no text".to_string())?;
    new_phrase(conn, &text)?;
    Ok(())
}

/// 搜索剪贴板文本（子串、不区分大小写）
pub fn search_clipboard(conn: &Connection, query: &str) -> Result<Vec<ClipItemDto>, String> {
    let pattern = format!("%{}%", query);
    let mut stmt = conn
        .prepare(
            "SELECT id, kind, text, content_hash, original_path, thumb_path, file_path, created_at FROM clipboard_items WHERE kind = 'text' AND lower(text) LIKE lower(?) ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![pattern], row_to_clip_dto)
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

/// 新增常用语，返回新行 DTO
pub fn new_phrase(conn: &Connection, text: &str) -> Result<ClipItemDto, String> {
    conn.execute(
        "INSERT INTO phrases (text, created_at, sort_order) VALUES (?, ?, COALESCE((SELECT MAX(sort_order) FROM phrases), 0) + 1)",
        params![text, now_ms()],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, text, created_at, sort_order FROM phrases WHERE id = ?",
        params![id],
        row_to_phrase_dto,
    )
    .map_err(|e| e.to_string())
}

/// 编辑常用语文本
pub fn edit_phrase(conn: &Connection, id: i64, text: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE phrases SET text = ? WHERE id = ?",
        params![text, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 删除常用语
pub fn delete_phrase(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM phrases WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 将常用语移到最前（sort_order 设为最小值 - 1）
pub fn move_phrase_to_first(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute(
        "UPDATE phrases SET sort_order = (SELECT COALESCE(MIN(sort_order), 0) - 1 FROM phrases) WHERE id = ?",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 按 ids 数组顺序重写全部常用语 sort_order（事务）
pub fn reorder_phrases(conn: &Connection, ids: &[i64]) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE phrases SET sort_order = ? WHERE id = ?",
            params![i as i64, id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ---- 辅助函数 ----

/// 将 clipboard_items 行映射为 DTO；图片条目从 thumb_path 读取缩略图生成 data URL
fn row_to_clip_dto(row: &Row) -> rusqlite::Result<ClipItemDto> {
    let id: i64 = row.get("id")?;
    let kind: String = row.get("kind")?;
    let text: Option<String> = row.get("text")?;
    let original_path: Option<String> = row.get("original_path")?;
    let thumb_path: Option<String> = row.get("thumb_path")?;
    let time: i64 = row.get("created_at")?;

    let image_thumb = if kind == "image" {
        thumb_path
            .as_deref()
            .and_then(|p| crate::image_store::thumb_to_data_url(Path::new(p)))
    } else {
        None
    };

    Ok(ClipItemDto {
        id: id.to_string(),
        kind,
        text,
        image_thumb,
        image_path: original_path,
        source: None,
        time,
    })
}

/// 将 phrases 行映射为 DTO（kind 固定为 "text"）
fn row_to_phrase_dto(row: &Row) -> rusqlite::Result<ClipItemDto> {
    let id: i64 = row.get("id")?;
    let text: Option<String> = row.get("text")?;
    let time: i64 = row.get("created_at")?;
    Ok(ClipItemDto {
        id: id.to_string(),
        kind: "text".to_string(),
        text,
        image_thumb: None,
        image_path: None,
        source: None,
        time,
    })
}

/// 当前 epoch 毫秒
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

/// 淘汰超出上限的旧剪贴板条目
fn enforce_max_items(conn: &Connection, limit: i64) -> Result<(), String> {
    conn.execute(
        "DELETE FROM clipboard_items WHERE id NOT IN (SELECT id FROM clipboard_items ORDER BY created_at DESC LIMIT ?)",
        params![limit],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        init_default_settings(&conn).unwrap();
        conn
    }

    #[test]
    fn dedup_lifts_existing_to_top() {
        // 插入 "a"、"b"（a 更旧）；再次插入 "a"；应剩 2 条且 "a" 在最前
        let conn = open_test_db();
        insert_clipboard_text(&conn, "a").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        insert_clipboard_text(&conn, "b").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        insert_clipboard_text(&conn, "a").unwrap();

        let items = list_clipboard(&conn, 50).unwrap();
        assert_eq!(items.len(), 2, "dedup 后应只剩 2 条");
        assert_eq!(items[0].text.as_deref(), Some("a"), "a 应被置顶到最前");
        assert_eq!(items[1].text.as_deref(), Some("b"));
    }

    #[test]
    fn max_items_eviction() {
        // 插入 51 条不同文本；应保留最新 50 条
        let conn = open_test_db();
        for i in 0..51 {
            insert_clipboard_text(&conn, &format!("item_{}", i)).unwrap();
        }
        let items = list_clipboard(&conn, 100).unwrap();
        assert_eq!(items.len(), 50, "插入 51 条后应保留最新 50 条");
    }

    #[test]
    fn phrase_append_order() {
        // 依次新增 3 条常用语；应按插入顺序返回
        let conn = open_test_db();
        new_phrase(&conn, "p1").unwrap();
        new_phrase(&conn, "p2").unwrap();
        new_phrase(&conn, "p3").unwrap();

        let items = list_phrases(&conn).unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].text.as_deref(), Some("p1"));
        assert_eq!(items[1].text.as_deref(), Some("p2"));
        assert_eq!(items[2].text.as_deref(), Some("p3"));
    }

    #[test]
    fn phrase_move_to_first() {
        // 新增 3 条；将最后一条移到最前；应位于 index 0
        let conn = open_test_db();
        let _a = new_phrase(&conn, "a").unwrap();
        let _b = new_phrase(&conn, "b").unwrap();
        let c = new_phrase(&conn, "c").unwrap();
        let c_id: i64 = c.id.parse().unwrap();

        move_phrase_to_first(&conn, c_id).unwrap();

        let items = list_phrases(&conn).unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].text.as_deref(), Some("c"), "c 应被移到最前");
    }

    #[test]
    fn max_items_respects_setting() {
        let conn = open_test_db();
        set_setting(&conn, "max_items", "3").unwrap();
        for i in 0..5 {
            insert_clipboard_text(&conn, &format!("item_{}", i)).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        let items = list_clipboard(&conn, 100).unwrap();
        assert_eq!(items.len(), 3, "max_items=3 应只保留 3 条");
        // 最新 3 条：item_4, item_3, item_2
        assert_eq!(items[0].text.as_deref(), Some("item_4"));
        assert_eq!(items[2].text.as_deref(), Some("item_2"));
    }

    #[test]
    fn image_insert_and_dedup() {
        // 同 hash 插入两次应去重为 1 条；不同 hash 则并存
        let conn = open_test_db();
        insert_clipboard_image(&conn, "h1", "/tmp/a.png", "/tmp/a_thumb.jpg", None).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        insert_clipboard_image(&conn, "h2", "/tmp/b.png", "/tmp/b_thumb.jpg", Some("/tmp/source.png")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        // 再次插入 h1：应置顶（不新增行）
        insert_clipboard_image(&conn, "h1", "/tmp/a.png", "/tmp/a_thumb.jpg", None).unwrap();

        let items = list_clipboard(&conn, 50).unwrap();
        assert_eq!(items.len(), 2, "同 hash 应去重");
        assert_eq!(items[0].kind, "image");
        // h1 在最前（最近一次置顶）
        assert_eq!(items[0].image_path.as_deref(), Some("/tmp/a.png"));
        assert_eq!(items[1].image_path.as_deref(), Some("/tmp/b.png"));
        // 缩略图文件不存在时 image_thumb 为 None（不报错）
        assert_eq!(items[0].image_thumb, None);
    }

    #[test]
    fn image_get_path_returns_options() {
        let conn = open_test_db();
        insert_clipboard_image(&conn, "h1", "/tmp/a.png", "/tmp/a_thumb.jpg", Some("/tmp/src.png")).unwrap();
        let id: i64 = conn
            .query_row("SELECT id FROM clipboard_items WHERE content_hash = 'h1'", [], |r| r.get(0))
            .unwrap();
        let (orig, file) = get_clipboard_image_path(&conn, id).unwrap();
        assert_eq!(orig.as_deref(), Some("/tmp/a.png"));
        assert_eq!(file.as_deref(), Some("/tmp/src.png"));
        // 不存在的 id 返回 (None, None)
        let (o, f) = get_clipboard_image_path(&conn, 99999).unwrap();
        assert!(o.is_none() && f.is_none());
    }
}
