use parking_lot::Mutex;
use rusqlite::Connection;
use std::path::PathBuf;
use std::time::Instant;

// 应用全局状态：DB 连接 + 自粘贴抑制标记。
// 粘贴目标窗口由 foreground_tracker 模块独立维护（全局原子），不在此处。
pub struct AppState {
    pub db: Mutex<Connection>,
    pub image_dir: PathBuf,                       // 本批次未用，预留
    pub last_self_paste: Mutex<Option<(String, Instant)>>,
}

impl AppState {
    pub fn new(db: Connection, image_dir: PathBuf) -> Self {
        Self {
            db: Mutex::new(db),
            image_dir,
            last_self_paste: Mutex::new(None),
        }
    }
}
