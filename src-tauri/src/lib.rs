mod clipboard_listener;
mod commands;
mod db;
mod foreground_tracker;
mod image_store;
mod paste;
mod settings;
mod state;

use std::str::FromStr;
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};
use windows::Win32::Foundation::{POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromPoint, MONITOR_DEFAULTTONEAREST, MONITORINFO,
};
use windows::Win32::UI::Shell::{ABM_GETTASKBARPOS, APPBARDATA, SHAppBarMessage};
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

// 面板物理尺寸占鼠标所在显示器物理工作区的比例。
// 锚定 1920×1080 屏幕（工作区约 1920×1040）下堆叠 380×320、卡片流 380×615：
// 宽 ≈19.8%、堆叠高 ≈30.8%、卡片流高 ≈59.1%。保证不同缩放下面板物理大小稳定，
// 不随系统 DPI 缩放膨胀。
const PANEL_WIDTH_RATIO: f64 = 380.0 / 1920.0;
const PANEL_STACK_HEIGHT_RATIO: f64 = 320.0 / 1040.0;
const PANEL_FLOW_HEIGHT_RATIO: f64 = 615.0 / 1040.0;

/// 取鼠标所在显示器的物理工作区与任务栏矩形。
/// rcWork / APPBARDATA.rc 均为物理像素；任务栏探测失败时任务栏 rc 为全零（按底部处理）。
unsafe fn cursor_monitor_work() -> Option<(RECT, RECT)> {
    let mut cursor = POINT { x: 0, y: 0 };
    if GetCursorPos(&mut cursor).is_err() {
        return None;
    }
    let hmon = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
    let mut mi = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if !GetMonitorInfoW(hmon, &mut mi).as_bool() {
        return None;
    }
    let mut abd: APPBARDATA = std::mem::zeroed();
    abd.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
    let _ = SHAppBarMessage(ABM_GETTASKBARPOS, &mut abd);
    Some((mi.rcWork, abd.rc))
}

/// 按显示模式 + 鼠标所在显示器物理工作区，计算面板物理尺寸。
/// 比例锚定 1920×1080 屏幕：宽 ≈19.8%，堆叠高 ≈30.8%，卡片流高 ≈59.1%。
/// 取工作区失败时回退堆叠 380×320（按 100% 缩放下的物理值兜底）。
fn panel_physical_size_for_mode(app: &tauri::AppHandle) -> (i32, i32) {
    let mode = {
        let state = app.state::<state::AppState>();
        let conn = state.db.lock();
        crate::db::get_display_mode(&conn).unwrap_or_else(|_| "stack".to_string())
    };
    let Some((work, _taskbar)) = (unsafe { cursor_monitor_work() }) else {
        return if mode == "flow" { (380, 615) } else { (380, 320) };
    };
    let work_w = (work.right - work.left) as f64;
    let work_h = (work.bottom - work.top) as f64;
    let w = (work_w * PANEL_WIDTH_RATIO) as i32;
    let h = if mode == "flow" {
        (work_h * PANEL_FLOW_HEIGHT_RATIO) as i32
    } else {
        (work_h * PANEL_STACK_HEIGHT_RATIO) as i32
    };
    (w, h)
}

fn toggle_panel(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("panel") {
        match win.is_visible() {
            Ok(true) => {
                let _ = win.hide();
            }
            _ => {
                // 按屏幕工作区比例算物理尺寸（覆盖上次 grid 等遗留尺寸），
                // 再定位到鼠标所在显示器的工作区角落（避开任务栏）。
                // 粘贴目标窗口由 foreground_tracker 后台线程持续记录，无需在此捕获
                let (w, h) = panel_physical_size_for_mode(app);
                let _ = win.set_size(PhysicalSize::new(w as f64, h as f64));
                if let Some((x, y)) = compute_panel_position(w, h) {
                    let _ = win.set_position(PhysicalPosition::new(x, y));
                }
                let _ = win.show();
                let _ = win.set_focus();
                // 通知前端重置到最新卡片
                let _ = app.emit_to("panel", "panel-shown", ());
            }
        }
    }
}

/// 切换设置窗口可见性：已显示则隐藏，否则显示并聚焦
/// 同时 emit settings-visibility 事件，让面板据此决定是否抑制 blur 自动隐藏
fn toggle_settings(app: &tauri::AppHandle) {
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

/// 计算面板位置：取鼠标所在显示器的工作区，按任务栏边定位面板到角落。
///
/// `panel_width` / `panel_height` 为**物理像素**，与 rcWork / APPBARDATA.rc
/// （均为物理像素）对齐计算，返回**物理像素**坐标，可直接用于 `PhysicalPosition`。
pub(crate) fn compute_panel_position(panel_width: i32, panel_height: i32) -> Option<(i32, i32)> {
    unsafe {
        let (work, taskbar) = cursor_monitor_work()?;

        // 根据任务栏所在边定位面板到工作区角落
        let (x, y) = if taskbar.top == 0 && taskbar.bottom < work.bottom {
            // 任务栏在顶部
            (work.right - panel_width, work.top)
        } else if taskbar.left == 0 && taskbar.right < work.right {
            // 任务栏在左侧
            (work.left, work.bottom - panel_height)
        } else {
            // 任务栏在底部（默认）或右侧
            (work.right - panel_width, work.bottom - panel_height)
        };
        Some((x, y))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            toggle_panel(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        // 热键固定不可改：直接按 id 分派（兼容 ctrl/control 等写法归一化）
                        let triggered_id = shortcut.id();
                        let panel_id = Shortcut::from_str("alt+v").ok().map(|s| s.id());
                        let search_id = Shortcut::from_str("alt+c").ok().map(|s| s.id());
                        if Some(triggered_id) == panel_id {
                            toggle_panel(app);
                        } else if Some(triggered_id) == search_id {
                            // Alt+C：面板隐藏时先显示再开搜索
                            if let Some(win) = app.get_webview_window("panel") {
                                if !win.is_visible().unwrap_or(false) {
                                    let (w, h) = panel_physical_size_for_mode(app);
                                    let _ = win.set_size(PhysicalSize::new(w as f64, h as f64));
                                    if let Some((x, y)) = compute_panel_position(w, h) {
                                        let _ = win.set_position(PhysicalPosition::new(x, y));
                                    }
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                    let _ = app.emit_to("panel", "panel-shown", ());
                                }
                            }
                            let _ = app.emit_to("panel", "toggle-search", ());
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            // 初始化数据库与全局状态
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
            let db_path = app_data_dir.join("clipboard.db");
            let image_dir = app_data_dir.join("images");
            std::fs::create_dir_all(&image_dir).map_err(|e| e.to_string())?;
            let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
            crate::db::init_schema(&conn).map_err(|e| e.to_string())?;
            crate::db::init_default_settings(&conn).map_err(|e| e.to_string())?;
            app.manage(crate::state::AppState::new(conn, image_dir));

            // 首次启动检测：settings 中无 initialized 键则视为首次运行，
            // 写入标记并向面板发送 first-run 事件（前端可显示引导提示）
            {
                let state = app.state::<state::AppState>();
                let is_first_run = {
                    let conn = state.db.lock();
                    let settings = crate::db::get_settings(&conn).map_err(|e| e.to_string())?;
                    let first = !settings.contains_key("initialized");
                    if first {
                        crate::db::set_setting(&conn, "initialized", "1")
                            .map_err(|e| e.to_string())?;
                    }
                    first
                };
                if is_first_run {
                    let _ = app.emit_to("panel", "first-run", ());
                }
            }

            // 注册全局热键（固定 alt+v / alt+c，不可改）：
            // 在后台线程调用 register（其内部通过 run_on_main_thread 派发到主线程，
            // 从主线程调用会死锁）
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    use tauri_plugin_global_shortcut::GlobalShortcutExt;
                    let gs = handle.global_shortcut();
                    if let Err(e) = gs.register("alt+v") {
                        eprintln!("注册面板热键失败: {}", e);
                    }
                    if let Err(e) = gs.register("alt+c") {
                        eprintln!("注册搜索热键失败: {}", e);
                    }
                });
            }

            // 启动前台窗口追踪线程（持续记录粘贴目标窗口，供 paste 回切）
            std::thread::spawn(|| foreground_tracker::run());

            let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_item, &quit])?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("no window icon").clone())
                .tooltip("Inkwell")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id().as_ref() == "settings" {
                        toggle_settings(app);
                    } else if event.id().as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_panel(tray.app_handle());
                    }
                })
                .build(app)?;

            // settings 窗口点 X 时改为 hide，避免销毁后无法再打开
            if let Some(settings_win) = app.get_webview_window("settings") {
                let win = settings_win.clone();
                settings_win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.hide();
                        // 通知面板设置窗口已关闭，解除 blur 抑制（否则点击面板外不再自动隐藏）
                        let _ = win.app_handle().emit_to("panel", "settings-visibility", false);
                    }
                });
            }

            // 启动 Win32 剪贴板监听线程
            let handle = app.handle().clone();
            std::thread::spawn(move || clipboard_listener::run(handle));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_clipboard,
            commands::list_phrases,
            commands::paste_item,
            commands::delete_clipboard_item,
            commands::clear_clipboard,
            commands::move_clipboard_to_first,
            commands::move_clipboard_to_phrases,
            commands::search_clipboard,
            commands::new_phrase,
            commands::edit_phrase,
            commands::delete_phrase,
            commands::move_phrase_to_first,
            commands::reorder_phrases,
            settings::get_settings,
            settings::set_setting,
            settings::set_autostart,
            commands::open_settings,
            commands::reposition_panel,
            commands::debug_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
