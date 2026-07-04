use std::time::Instant;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_KEYUP,
    VK_CONTROL, VK_V,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
};

use clipboard_win::raw;
use tauri::{AppHandle, Manager};

/// 执行粘贴：写剪贴板 → 设自粘贴抑制 → 抢回前台 → SendInput Ctrl+V → 置顶 → 隐藏面板
///
/// `move_to_first` 控制粘贴后是否将该条置顶（剪贴板需要，常用语不需要）。
pub fn do_paste(
    state: &crate::state::AppState,
    app: &AppHandle,
    text: String,
    id: i64,
    move_to_first: bool,
) -> Result<(), String> {
    // 1. 写文本到剪贴板（CF_UNICODETEXT）—— raw::set_string 不自行打开剪贴板，需先 OpenClipboard
    {
        let _clip = clipboard_win::Clipboard::new_attempts(10)
            .map_err(|e| format!("open clipboard failed: {e}"))?;
        clipboard_win::raw::empty().map_err(|e| format!("empty clipboard failed: {e}"))?;
        raw::set_string(&text).map_err(|e| format!("set clipboard failed: {e}"))?;
    }

    // 2. 设自粘贴抑制标记：500ms 内同文本会被 listener 跳过
    {
        let mut last = state.last_self_paste.lock();
        *last = Some((text.clone(), Instant::now()));
    }

    // 3. hide 面板让系统把前台还给目标窗口 → 等目标成为前台 → Ctrl+V
    let target = crate::foreground_tracker::last_target();
    if target == 0 {
        return Err("no target window captured".into());
    }
    paste_to_target(app, HWND(target as *mut core::ffi::c_void))?;

    // 4. 置顶剪贴板条目（仅剪贴板使用，常用语不重排）
    if move_to_first {
        {
            let conn = state.db.lock();
            crate::db::move_clipboard_to_first(&conn, id)?;
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

    // 2. hide 面板让系统把前台还给目标窗口 → 等目标成为前台 → Ctrl+V
    let target = crate::foreground_tracker::last_target();
    if target == 0 {
        return Err("no target window captured".into());
    }
    paste_to_target(app, HWND(target as *mut core::ffi::c_void))?;

    // 3. 置顶
    {
        let conn = state.db.lock();
        crate::db::move_clipboard_to_first(&conn, id)?;
    }
    Ok(())
}

/// 让目标窗口获得前台并模拟 Ctrl+V 粘贴。
///
/// 思路：先 `hide` 面板，由 Windows 按默认行为把前台还给上一个前台窗口（目标）——
/// 这正是「关闭面板后光标自动回到输入框」的机制，比 `SetForegroundWindow` 可靠
///（后者受前台锁限制，从命令工作线程调用常被静默拒绝）。
/// hide 后轮询确认目标已成为前台再 `SendInput`；超时则用 `AttachThreadInput`
/// 附加到当前前台线程获取权限，兜底 `SetForegroundWindow`。
fn paste_to_target(app: &AppHandle, target_hwnd: HWND) -> Result<(), String> {
    let panel = app.get_webview_window("panel");

    // 1. hide 面板：触发系统把前台还给目标窗口
    if let Some(win) = &panel {
        let _ = win.hide();
    }

    // 2. 轮询等待目标窗口成为前台（hide 异步派发 + 系统还前台需时，最多 200ms）
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(200);
    let mut foregrounded = false;
    while std::time::Instant::now() < deadline {
        if unsafe { GetForegroundWindow() } == target_hwnd {
            foregrounded = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }

    // 3. 兜底：系统没还前台时，附加到当前前台线程获取权限再 SetForegroundWindow
    if !foregrounded {
        let current_tid = unsafe { GetCurrentThreadId() };
        let fg_hwnd = unsafe { GetForegroundWindow() };
        let fg_tid = unsafe { GetWindowThreadProcessId(fg_hwnd, None) };
        let attached = current_tid != fg_tid
            && unsafe { AttachThreadInput(current_tid, fg_tid, true) }.as_bool();
        let _ = unsafe { SetForegroundWindow(target_hwnd) };
        std::thread::sleep(std::time::Duration::from_millis(50));
        if attached {
            let _ = unsafe { AttachThreadInput(current_tid, fg_tid, false) };
        }
    }

    // 4. 模拟 Ctrl+V
    send_ctrl_v();

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
