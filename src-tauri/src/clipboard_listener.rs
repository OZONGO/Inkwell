use std::sync::OnceLock;
use std::time::Instant;

use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use windows::core::w;
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::DataExchange::{AddClipboardFormatListener, GetClipboardSequenceNumber};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW,
    KillTimer, RegisterClassW, SetTimer, TranslateMessage, CW_USEDEFAULT, HWND_MESSAGE, MSG,
    WINDOW_EX_STYLE, WINDOW_STYLE, WM_CLIPBOARDUPDATE, WM_TIMER, WNDCLASSW,
};

const TIMER_ID: usize = 1;
const DEBOUNCE_MS: u32 = 200;
const SELF_PASTE_WINDOW_MS: u128 = 500;

// 监听器与窗口过程之间的共享状态（单窗口，使用 static 即可）
static LAST_UPDATE: Mutex<Option<Instant>> = Mutex::new(None);
static LAST_SEQ: Mutex<u32> = Mutex::new(0);
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

/// 窗口过程：WM_CLIPBOARDUPDATE 启动 200ms 去抖定时器；WM_TIMER 触发实际读取
unsafe extern "system" fn window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_CLIPBOARDUPDATE => {
            // 重置去抖：杀掉旧 timer，启动新 200ms timer
            let _ = KillTimer(Some(hwnd), TIMER_ID);
            let _ = SetTimer(Some(hwnd), TIMER_ID, DEBOUNCE_MS, None);
            *LAST_UPDATE.lock() = Some(Instant::now());
            return LRESULT(0);
        }
        WM_TIMER if wparam.0 == TIMER_ID => {
            let _ = KillTimer(Some(hwnd), TIMER_ID);
            handle_clipboard_change();
            return LRESULT(0);
        }
        _ => {}
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

/// 读剪贴板（先文本，再 CF_DIB）→ 自粘贴抑制 → 入库 → emit
fn handle_clipboard_change() {
    // 消费去抖时间戳：None 表示已被处理，跳过
    let _update_time = LAST_UPDATE.lock().take();
    if _update_time.is_none() {
        return;
    }

    let seq = unsafe { GetClipboardSequenceNumber() };
    if seq == 0 {
        return;
    }
    // 跳过已处理过的序列号
    {
        let mut last = LAST_SEQ.lock();
        if *last == seq {
            return;
        }
        *last = seq;
    }

    let Some(handle) = APP_HANDLE.get() else { return };
    let Some(state) = handle.try_state::<crate::state::AppState>() else { return };

    // 优先尝试文本；非文本或为空再尝试 CF_DIB 图片
    let text = clipboard_win::get_clipboard_string().ok().filter(|s| !s.is_empty());

    if let Some(text) = text {
        // 自粘贴抑制：500ms 内同文本则跳过
        let suppressed = {
            let mut last_self = state.last_self_paste.lock();
            if let Some((last_text, last_time)) = last_self.as_ref() {
                if last_text == &text && last_time.elapsed().as_millis() < SELF_PASTE_WINDOW_MS {
                    *last_self = None;
                    true
                } else {
                    false
                }
            } else {
                false
            }
        };
        if suppressed {
            return;
        }

        let conn = state.db.lock();
        if let Err(e) = crate::db::insert_clipboard_text(&conn, &text) {
            eprintln!("insert_clipboard_text failed: {}", e);
            return;
        }
        let _ = handle.emit_to("panel", "clipboard-updated", ());
        return;
    }

    // 文本不可用 → 尝试 CF_DIB 图片
    if !clipboard_win::raw::is_format_avail(clipboard_win::formats::CF_DIB) {
        return;
    }
    // raw::get_vec 需要打开剪贴板
    let mut dib = Vec::new();
    let dib: Vec<u8> = {
        let _clip = match clipboard_win::Clipboard::new_attempts(10) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("open clipboard for CF_DIB failed: {}", e);
                return;
            }
        };
        match clipboard_win::raw::get_vec(clipboard_win::formats::CF_DIB, &mut dib) {
            Ok(_) => dib,
            Err(e) => {
                eprintln!("read CF_DIB failed: {}", e);
                return;
            }
        }
    };
    if dib.is_empty() {
        return;
    }

    // 图片处理 spawn 到独立线程，避免阻塞监听线程消息循环。
    // 4K 截图的 DIB 解码 + PNG 编码 + Lanczos3 缩略图可能耗时数百毫秒，
    // 同步处理会延迟后续 WM_CLIPBOARDUPDATE 的去抖定时器，快速连续复制时丢事件。
    let handle = handle.clone();
    std::thread::spawn(move || {
        let Some(state) = handle.try_state::<crate::state::AppState>() else { return };
        let (hash, original_path, thumb_path) =
            match crate::image_store::save_image(&dib, &state.image_dir) {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("save_image failed: {}", e);
                    return;
                }
            };
        let conn = state.db.lock();
        if let Err(e) = crate::db::insert_clipboard_image(
            &conn,
            &hash,
            original_path.to_str().unwrap_or(""),
            thumb_path.to_str().unwrap_or(""),
            None,
        ) {
            eprintln!("insert_clipboard_image failed: {}", e);
            return;
        }
        let _ = handle.emit_to("panel", "clipboard-updated", ());
    });
}

/// 启动剪贴板监听线程：创建 message-only 窗口 + 注册监听 + 200ms 去抖 + 自粘贴抑制
pub fn run(handle: AppHandle) {
    let _ = APP_HANDLE.set(handle);

    let hinstance = HINSTANCE::default();
    let wc = WNDCLASSW {
        lpfnWndProc: Some(window_proc),
        lpszClassName: w!("TauriClipboardListener"),
        hInstance: hinstance,
        ..Default::default()
    };
    let atom = unsafe { RegisterClassW(&wc) };
    if atom == 0 {
        eprintln!("RegisterClassW failed");
        return;
    }

    let hwnd = unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            w!("TauriClipboardListener"),
            w!(""),
            WINDOW_STYLE::default(),
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            Some(HWND_MESSAGE),
            None,
            Some(hinstance),
            None,
        )
    };
    let hwnd = match hwnd {
        Ok(h) => h,
        Err(e) => {
            eprintln!("CreateWindowExW failed: {}", e);
            return;
        }
    };

    if let Err(e) = unsafe { AddClipboardFormatListener(hwnd) } {
        eprintln!("AddClipboardFormatListener failed: {}", e);
        return;
    }

    // 标准消息循环
    let mut msg: MSG = unsafe { std::mem::zeroed() };
    loop {
        let ret = unsafe { GetMessageW(&mut msg, None, 0, 0) };
        if !ret.as_bool() {
            break;
        }
        unsafe {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}
