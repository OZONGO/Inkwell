use tauri::State;
use crate::db;
use crate::state::AppState;
use std::collections::HashMap;
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<HashMap<String, String>, String> {
    let conn = state.db.lock();
    db::get_settings(&conn)
}

#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: String) -> Result<(), String> {
    let conn = state.db.lock();
    db::set_setting(&conn, &key, &value)
}

/// 设置开机自启：通过 autostart 插件注册/注销系统级启动项
#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}

