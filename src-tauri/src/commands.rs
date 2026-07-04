use tauri::State;

use crate::db::{self, ClipItemDto};
use crate::state::AppState;

// 所有命令返回 Result<T, String>，错误会被 Tauri 序列化为前端 rejected promise。
// id 在前端为 string（与 ClipItemDto.id 一致），这里 parse 回 i64 供 DB 层使用。

#[tauri::command]
pub fn list_clipboard(state: State<AppState>) -> Result<Vec<ClipItemDto>, String> {
    let conn = state.db.lock();
    db::list_clipboard(&conn, 50)
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
    shift: bool,
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
        crate::paste::do_paste(&state, &app, text, id, shift, false)
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
            return crate::paste::do_paste_image(&state, &app, id, shift);
        }
        let text = {
            let conn = state.db.lock();
            db::get_clipboard_text(&conn, id)?
                .ok_or_else(|| "clipboard item not found".to_string())?
        };
        crate::paste::do_paste(&state, &app, text, id, shift, true)
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
