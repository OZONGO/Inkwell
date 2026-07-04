use tauri::{Emitter, Manager, PhysicalPosition, State};

use crate::db::{self, ClipItemDto};
use crate::state::AppState;

// 所有命令返回 Result<T, String>，错误会被 Tauri 序列化为前端 rejected promise。
// id 在前端为 string（与 ClipItemDto.id 一致），这里 parse 回 i64 供 DB 层使用。

#[tauri::command]
pub fn list_clipboard(state: State<AppState>) -> Result<Vec<ClipItemDto>, String> {
    let conn = state.db.lock();
    let limit = db::get_max_items(&conn)?;
    db::list_clipboard(&conn, limit)
}

#[tauri::command]
pub fn list_phrases(state: State<AppState>) -> Result<Vec<ClipItemDto>, String> {
    let conn = state.db.lock();
    db::list_phrases(&conn)
}

#[tauri::command]
pub fn paste_item(
    state: State<AppState>,
    app: tauri::AppHandle,
    id: String,
    from_phrases: bool,
) -> Result<(), String> {
    let id = id.parse::<i64>().map_err(|e| e.to_string())?;

    if from_phrases {
        // 常用语：从 phrases 表取文本直接粘贴，不置顶
        let text = {
            let conn = state.db.lock();
            conn.query_row(
                "SELECT text FROM phrases WHERE id = ?",
                rusqlite::params![id],
                |row| row.get::<_, String>(0),
            )
            .map_err(|e| format!("常用语未找到: {}", e))?
        };
        // 常用语仅有纯文本，不走图片分支；move_to_first = false 不重排
        crate::paste::do_paste(&state, &app, text, id, false)
    } else {
        // 剪贴板：按 kind 分派 text / image
        let kind: String = {
            let conn = state.db.lock();
            conn.query_row(
                "SELECT kind FROM clipboard_items WHERE id = ?",
                rusqlite::params![id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?
        };
        if kind == "image" {
            return crate::paste::do_paste_image(&state, &app, id);
        }
        let text = {
            let conn = state.db.lock();
            db::get_clipboard_text(&conn, id)?
                .ok_or_else(|| "clipboard item not found".to_string())?
        };
        crate::paste::do_paste(&state, &app, text, id, true)
    }
}

#[tauri::command]
pub fn delete_clipboard_item(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock();
    let id = id.parse::<i64>().map_err(|e| e.to_string())?;
    db::delete_clipboard_item(&conn, id)
}

#[tauri::command]
pub fn move_clipboard_to_first(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock();
    let id = id.parse::<i64>().map_err(|e| e.to_string())?;
    db::move_clipboard_to_first(&conn, id)
}

#[tauri::command]
pub fn move_clipboard_to_phrases(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock();
    let id = id.parse::<i64>().map_err(|e| e.to_string())?;
    db::move_clipboard_to_phrases(&conn, id)
}

#[tauri::command]
pub fn search_clipboard(state: State<AppState>, query: String) -> Result<Vec<ClipItemDto>, String> {
    let conn = state.db.lock();
    db::search_clipboard(&conn, &query)
}

#[tauri::command]
pub fn new_phrase(state: State<AppState>, text: String) -> Result<ClipItemDto, String> {
    let conn = state.db.lock();
    db::new_phrase(&conn, &text)
}

#[tauri::command]
pub fn edit_phrase(state: State<AppState>, id: String, text: String) -> Result<(), String> {
    let conn = state.db.lock();
    let id = id.parse::<i64>().map_err(|e| e.to_string())?;
    db::edit_phrase(&conn, id, &text)
}

#[tauri::command]
pub fn delete_phrase(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock();
    let id = id.parse::<i64>().map_err(|e| e.to_string())?;
    db::delete_phrase(&conn, id)
}

#[tauri::command]
pub fn move_phrase_to_first(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock();
    let id = id.parse::<i64>().map_err(|e| e.to_string())?;
    db::move_phrase_to_first(&conn, id)
}

#[tauri::command]
pub fn reorder_phrases(state: State<AppState>, ids: Vec<String>) -> Result<(), String> {
    let conn = state.db.lock();
    let ids: Vec<i64> = ids
        .iter()
        .map(|s| s.parse::<i64>())
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    db::reorder_phrases(&conn, &ids)
}

/// 重新定位面板到鼠标所在显示器的工作区角落（避开任务栏）。
/// 供前端在显示模式切换 resize 后调用——resize 只改尺寸不重定位，
/// 面板贴底部时变高会让底边溢出屏幕，必须按新高度重算 y。
#[tauri::command]
pub fn reposition_panel(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("panel") {
        let sz = win.outer_size().unwrap_or_default();
        let factor = win.scale_factor().unwrap_or(1.0);
        let logical_w = (sz.width as f64 / factor) as i32;
        let logical_h = (sz.height as f64 / factor) as i32;
        if let Some((x, y)) = crate::compute_panel_position(logical_w, logical_h) {
            let _ = win.set_position(PhysicalPosition::new(
                (x as f64 * factor) as i32,
                (y as f64 * factor) as i32,
            ));
        }
    }
}

/// 打开设置窗口：已显示则隐藏，否则显示并聚焦（供面板右下角齿轮按钮调用）
/// 同时 emit settings-visibility 事件，让面板据此决定是否抑制 blur 自动隐藏
#[tauri::command]
pub fn open_settings(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        match win.is_visible() {
            Ok(true) => {
                let _ = win.hide();
                let _ = app.emit_to("panel", "settings-visibility", false);
            }
            _ => {
                let _ = win.show();
                let _ = win.set_focus();
                let _ = app.emit_to("panel", "settings-visibility", true);
            }
        }
    }
}

/// 诊断日志：前端把切换模式等关键节点的状态发来，Rust 端 eprintln 到终端 +
/// 追加写到 app_data_dir/panel.diag.log（tauri dev 终端肉眼可见，文件事后可翻）
#[tauri::command]
pub fn debug_log(app: tauri::AppHandle, msg: String) {
    use tauri::Manager;
    eprintln!("[diag] {}", msg);
    if let Ok(dir) = app.path().app_data_dir() {
        let path = dir.join("panel.diag.log");
        let line = format!("[diag] {}\n", msg);
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
    }
}
