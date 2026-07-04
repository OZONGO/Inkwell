//! 前台窗口追踪：用 SetWinEventHook 监听 EVENT_SYSTEM_FOREGROUND，
//! 持续记录"最近一个有效粘贴目标窗口"（排除本应用窗口 + 系统桌面/任务栏）。
//!
//! 解决"点击托盘打开面板时 GetForegroundWindow 返回的是托盘/桌面而非用户原窗口"，
//! 导致粘贴回切到错误窗口、Ctrl+V 发不到目标的问题。

use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetClassNameW, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId,
    TranslateMessage, MSG,
};

// Win32 事件常量（winuser.h）。windows-rs 0.61 未在 Accessibility 模块导出，硬编码。
const EVENT_SYSTEM_FOREGROUND: u32 = 0x0003;
const WINEVENT_OUTOFCONTEXT: u32 = 0x0000;

/// 最近一个有效粘贴目标窗口（HWND as i64）。0 表示尚未捕获。
static LAST_TARGET: AtomicI64 = AtomicI64::new(0);
/// 首次记录日志标志（诊断用，仅打印一次）
static FIRST_LOG: AtomicBool = AtomicBool::new(false);

/// 读取最近捕获的粘贴目标窗口
pub fn last_target() -> isize {
    LAST_TARGET.load(Ordering::Relaxed) as isize
}

/// 判断窗口是否为有效粘贴目标：非本进程 + 非系统桌面/任务栏类
fn is_valid_target(hwnd: HWND) -> bool {
    if hwnd.is_invalid() {
        return false;
    }
    // 排除本应用窗口（panel / settings 同进程）
    // 注意：GetWindowThreadProcessId 返回线程 ID，进程 ID 通过第二参数输出
    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32)) };
    if pid == std::process::id() {
        return false;
    }
    // 排除系统桌面/任务栏
    let mut buf = [0u16; 64];
    let len = unsafe { GetClassNameW(hwnd, &mut buf) };
    if len > 0 {
        let class = String::from_utf16_lossy(&buf[..len as usize]);
        match class.as_str() {
            "Progman" | "Shell_TrayWnd" | "WorkerW" | "IME" => return false,
            _ => {}
        }
    }
    true
}

unsafe extern "system" fn on_foreground(
    _hook: HWINEVENTHOOK,
    _event: u32,
    hwnd: HWND,
    _id_object: i32,
    _id_child: i32,
    _id_thread: u32,
    _time: u32,
) {
    if is_valid_target(hwnd) {
        LAST_TARGET.store(hwnd.0 as i64, Ordering::Relaxed);
        if !FIRST_LOG.swap(true, Ordering::Relaxed) {
            eprintln!("foreground_tracker: 首次记录目标窗口 hwnd={:?}", hwnd);
        }
    }
}

/// 启动前台窗口追踪：注册 WinEvent 钩子 + 消息循环。
/// 必须在独立线程运行（GetMessageW 阻塞），由 lib.rs setup spawn。
pub fn run() {
    let hook = unsafe {
        SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            None,
            Some(on_foreground),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        )
    };
    if hook.is_invalid() {
        eprintln!("SetWinEventHook failed（前台窗口追踪未启动）");
        return;
    }
    eprintln!("foreground_tracker: 钩子注册成功，开始监听前台窗口");

    // 初始化：若当前前台有效则记录，避免启动后到首次切换前 last_target 为 0
    let fg = unsafe { GetForegroundWindow() };
    if is_valid_target(fg) {
        LAST_TARGET.store(fg.0 as i64, Ordering::Relaxed);
        eprintln!("foreground_tracker: 初始前台已记录 hwnd={:?}", fg);
    } else {
        eprintln!("foreground_tracker: 当前前台无效（pid={:?}），等待首次切换", std::process::id());
    }

    // OUTOFCONTEXT 钩子需要消息循环分发事件
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
    let _ = unsafe { UnhookWinEvent(hook) };
}
