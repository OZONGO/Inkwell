import type { ClipItem } from "../lib/types";

const now = Date.now();
const min = 60_000;
const day = 86_400_000;

// tiny SVG screenshot placeholder as a data URL so image cards render visually
const imagePlaceholder =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120">
      <rect width="320" height="120" fill="#2E5C8A" opacity="0.12"/>
      <rect x="20" y="18" width="180" height="10" rx="3" fill="#2E5C8A" opacity="0.5"/>
      <rect x="20" y="36" width="220" height="8" rx="3" fill="#1C1C22" opacity="0.18"/>
      <rect x="20" y="52" width="200" height="8" rx="3" fill="#1C1C22" opacity="0.18"/>
      <rect x="248" y="64" width="52" height="40" rx="4" fill="#2E5C8A" opacity="0.28"/>
    </svg>`,
  );

// newest first — the front of the stack is index 0
export const mockClipboard: ClipItem[] = [
  { id: "c1", type: "text", text: "npm run tauri dev\n启动 Tauri 开发模式，前端热更新、Rust 重编译", source: "Windows Terminal", time: now - 2 * min },
  { id: "c2", type: "text", text: "设计不是让事物变好看，而是让事物运作。好的设计是尽可能少的设计。\n—— Dieter Rams", source: "Chrome", time: now - 9 * min },
  { id: "c3", type: "text", text: "AttachThreadInput + SetForegroundWindow\n回切前台窗口的稳妥组合，再 SendInput 模拟 Ctrl+V", source: "VS Code", time: now - 24 * min },
  { id: "c4", type: "image", imageThumb: imagePlaceholder, source: "截图工具", time: now - 70 * min },
  { id: "c5", type: "text", text: "你好，这是一段被复制的中等长度文本，用来测试三行省略是否生效，第三行末尾应当出现省略号。", source: "微信", time: now - 120 * min },
  { id: "c6", type: "text", text: "blake3 精确去重 / 256px JPEG 预览 / HDROP 还原文件型图片", source: "Edge", time: now - 200 * min },
];

// common phrases: user-curated, new ones append at the END (栈底)
export const mockPhrases: ClipItem[] = [
  { id: "p1", type: "text", text: "感谢反馈，我在处理，预计今天内回复。", source: undefined, time: now - 3 * day },
  { id: "p2", type: "text", text: "git commit --amend --no-edit", source: undefined, time: now - 5 * day },
  { id: "p3", type: "text", text: "会议改为下午 3 点，地点不变。", source: undefined, time: now - 7 * day },
  { id: "p4", type: "text", text: "https://tauri.app/start/prerequisites/", source: undefined, time: now - 10 * day },
];

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mo}/${dd} ${hh}:${mm}`;
}
