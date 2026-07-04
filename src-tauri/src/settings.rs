use tauri::State;
use crate::db;
use crate::state::AppState;
use std::collections::HashMap;
use std::str::FromStr;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

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

/// 设置热键：校验 key 名 → 冲突检测（按 HotKey id 比较，兼容 ctrl/control 等写法）
/// → 先注册新热键成功再注销旧热键 → 写入 settings
#[tauri::command]
pub fn set_hotkey(
    state: State<AppState>,
    app: tauri::AppHandle,
    key: String,
    value: String,
) -> Result<(), String> {
    if key != "hotkey_panel" && key != "hotkey_search" {
        return Err("invalid key name, must be 'hotkey_panel' or 'hotkey_search'".into());
    }
    let other_key = if key == "hotkey_panel" { "hotkey_search" } else { "hotkey_panel" };

    // 读取当前设置（短临界区）
    let (old_value, other_value) = {
        let conn = state.db.lock();
        let settings = db::get_settings(&conn).map_err(|e| e.to_string())?;
        (
            settings.get(&key).cloned().unwrap_or_default(),
            settings.get(other_key).cloned().unwrap_or_default(),
        )
    };

    // 解析新热键（同时验证格式）
    let value_hk = Shortcut::from_str(&value)
        .map_err(|e| format!("无效热键 '{}': {}", value, e))?;

    // 冲突检测：与另一热键比较 id（兼容 ctrl/control、cmd/super 等不同写法）
    if !other_value.is_empty() {
        if let Ok(other_hk) = Shortcut::from_str(&other_value) {
            if value_hk.id() == other_hk.id() {
                return Err(format!("热键冲突：{} 已被 {}", value, other_key));
            }
        }
    }

    // 值未变化则直接返回
    if !old_value.is_empty() {
        if let Ok(old_hk) = Shortcut::from_str(&old_value) {
            if value_hk.id() == old_hk.id() {
                return Ok(());
            }
        }
    }

    // 先注册新热键，成功后再注销旧热键（避免新热键注册失败时丢失旧热键）
    let gs = app.global_shortcut();
    gs.register(value.as_str())
        .map_err(|e| format!("注册热键失败: {}", e))?;
    if !old_value.is_empty() {
        let _ = gs.unregister(old_value.as_str());
    }

    // 写入 settings
    let conn = state.db.lock();
    db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())?;
    drop(conn);
    Ok(())
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

