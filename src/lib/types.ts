// 剪贴板条目类型：text = 纯文本，image = 图片
export type ClipType = "text" | "image";

// 剪贴板条目 DTO，与后端 Rust ClipItemDto 序列化格式对齐
export interface ClipItem {
  id: string;           // SQLite rowid，转为字符串传递
  type: ClipType;       // "text" | "image"
  text?: string;        // 文本内容（图片条目为 undefined）
  imageThumb?: string;  // 图片 data URL（base64 JPEG），直接用于 <img src>
  source?: string;      // 来源应用名称（当前未启用，恒为 undefined）
  time: number;         // 创建时间戳，epoch 毫秒
}

// 面板标签页：剪贴板历史 / 常用语
export type Pane = "clipboard" | "phrases";
// 视图模式：堆叠卡片 / 搜索列表 / 网格排序
export type View = "stack" | "search" | "grid";
// 显示模式：堆叠卡片 / 卡片流（持久偏好，存 settings.display_mode，与 View 区分——
// displayMode 是用户偏好，view 是临时状态）
export type DisplayMode = "stack" | "flow";
