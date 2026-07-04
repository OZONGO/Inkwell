use std::time::Instant;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_KEYUP,
    VK_CONTROL, VK_V,
};
use windows::Win32::UI::WindowsAndMessaging::{GetWindowThreadProcessId, SetForegroundWindow};

use clipboard_win::raw;
use tauri::{AppHandle, Manager};

/// 执行粘贴：写剪贴板 → 设自粘贴抑制 → 抢回前台 → SendInput Ctrl+V → 置顶 → 隐藏面板（如 !shift）
pub fn do_paste(
    state: &crate::state::AppState,
    app: &AppHandle,
    text: String,
    id: i64,
    shift: bool,
) -> Result<(), String> {
    // 1. 写文本到剪贴板（CF_UNICODETEXT）
    raw::set_string(&text).map_err(|e| format!("set clipboard failed: {}", e))?;

    // 2. 设自粘贴抑制标记：500ms 内同文本会被 listener 跳过
    {
        let mut last = state.last_self_paste.lock();
        *last = Some((text.clone(), Instant::now()));
    }

    // 3. 抢回前台窗口焦点
    let target = state.get_target_hwnd();
    if target == 0 {
        return Err("no target window captured".into());
    }
    let target_hwnd = HWND(target as *mut core::ffi::c_void);

    let current_thread_id = unsafe { GetCurrentThreadId() };
    let target_thread_id = unsafe { GetWindowThreadProcessId(target_hwnd, None) };

    // 4. AttachThreadInput 把目标窗口线程的输入队列 attach 到当前线程，让 SetForegroundWindow 可靠
    let attached = unsafe { AttachThreadInput(current_thread_id, target_thread_id, true) };
    let _ = unsafe { SetForegroundWindow(target_hwnd) };
    // 短暂让出，确保目标窗口进入前台
    std::thread::sleep(std::time::Duration::from_millis(50));

    // 5. SendInput 4 个 INPUT：Ctrl down / V down / V up / Ctrl up
    send_ctrl_v();

    // 6. detach 输入队列
    if attached.as_bool() {
        let _ = unsafe { AttachThreadInput(current_thread_id, target_thread_id, false) };
    }

    // 7. 置顶剪贴板条目
    {
        let conn = state.db.lock();
        crate::db::move_clipboard_to_first(&conn, id)?;
    }

    // 8. 隐藏面板（除非 Shift 按下保持打开）
    if !shift {
        if let Some(win) = app.get_webview_window("panel") {
            let _ = win.hide();
        }
    }
    Ok(())
}

/// 粘贴图片条目：
/// - file_path 为 Some → CF_HDROP 写文件路径（文件型图片，如资源管理器复制的图片）
/// - file_path 为 None → 读 PNG 原图重新编码为 DIB 写 CF_DIB（截图类）
/// 自粘贴抑制按剪贴板序列号在 listener 中处理（图片不走文本比对分支）
pub fn do_paste_image(
    state: &crate::state::AppState,
    app: &AppHandle,
    id: i64,
    shift: bool,
) -> Result<(), String> {
    let (original_path, file_path) = {
        let conn = state.db.lock();
        crate::db::get_clipboard_image_path(&conn, id)?
    };
    let original_path = original_path.ok_or_else(|| "image original_path missing".to_string())?;

    // 1. 写剪贴板：文件型用 CF_HDROP；截图型用 CF_DIB
    if let Some(fp) = file_path {
        // 文件型：CF_HDROP 写文件路径
        let _clip = clipboard_win::Clipboard::new_attempts(10)
            .map_err(|e| format!("open clipboard failed: {}", e))?;
        clipboard_win::raw::empty().map_err(|e| format!("empty clipboard failed: {}", e))?;
        clipboard_win::raw::set_file_list(&[fp])
            .map_err(|e| format!("set file list failed: {}", e))?;
    } else {
        // 截图型：读 PNG → DIB → CF_DIB
        let dib = crate::image_store::png_to_dib(std::path::Path::new(&original_path))?;
        let _clip = clipboard_win::Clipboard::new_attempts(10)
            .map_err(|e| format!("open clipboard failed: {}", e))?;
        clipboard_win::raw::empty().map_err(|e| format!("empty clipboard failed: {}", e))?;
        clipboard_win::raw::set_without_clear(clipboard_win::formats::CF_DIB, &dib)
            .map_err(|e| format!("set CF_DIB failed: {}", e))?;
    }

    // 2. 抢回前台焦点（与 do_paste 一致）
    let target = state.get_target_hwnd();
    if target == 0 {
        return Err("no target window captured".into());
    }
    let target_hwnd = HWND(target as *mut core::ffi::c_void);
    let current_thread_id = unsafe { GetCurrentThreadId() };
    let target_thread_id = unsafe { GetWindowThreadProcessId(target_hwnd, None) };
    let attached = unsafe { AttachThreadInput(current_thread_id, target_thread_id, true) };
    let _ = unsafe { SetForegroundWindow(target_hwnd) };
    std::thread::sleep(std::time::Duration::from_millis(50));
    send_ctrl_v();
    if attached.as_bool() {
        let _ = unsafe { AttachThreadInput(current_thread_id, target_thread_id, false) };
    }

    // 3. 置顶 + 隐藏面板
    {
        let conn = state.db.lock();
        crate::db::move_clipboard_to_first(&conn, id)?;
    }
    if !shift {
        if let Some(win) = app.get_webview_window("panel") {
            let _ = win.hide();
        }
    }
    Ok(())
}

fn send_ctrl_v() {
    let inputs: [INPUT; 4] = [
        make_key_input(VK_CONTROL, false),
        make_key_input(VK_V, false),
        make_key_input(VK_V, true),
        make_key_input(VK_CONTROL, true),
    ];
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

fn make_key_input(vk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}
