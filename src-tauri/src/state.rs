use parking_lot::Mutex;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::atomic::AtomicI64;
use std::time::Instant;

// 应用全局状态：DB 连接 + 粘贴目标窗口 + 自粘贴抑制标记
pub struct AppState {
    pub db: Mutex<Connection>,
    pub image_dir: PathBuf,                       // 本批次未用，预留
    pub last_target_hwnd: AtomicI64,              // HWND as i64
    pub last_self_paste: Mutex<Option<(String, Instant)>>,
}

impl AppState {
    pub fn new(db: Connection, image_dir: PathBuf) -> Self {
        Self {
            db: Mutex::new(db),
            image_dir,
            last_target_hwnd: AtomicI64::new(0),
            last_self_paste: Mutex::new(None),
        }
    }
    pub fn set_target_hwnd(&self, hwnd: isize) {
        self.last_target_hwnd.store(hwnd as i64, std::sync::atomic::Ordering::Relaxed);
    }
    pub fn get_target_hwnd(&self) -> isize {
        self.last_target_hwnd.load(std::sync::atomic::Ordering::Relaxed) as isize
    }
}
