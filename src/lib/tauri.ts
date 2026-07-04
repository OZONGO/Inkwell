// typed Tauri IPC wrappers with jsdom-safe fallbacks

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ClipItem } from "./types";

export async function listClipboard(): Promise<ClipItem[]> {
  if (!isTauri()) return [];
  return invoke<ClipItem[]>("list_clipboard");
}

export async function listPhrases(): Promise<ClipItem[]> {
  if (!isTauri()) return [];
  return invoke<ClipItem[]>("list_phrases");
}

export async function pasteItem(id: string, from_phrases: boolean = false): Promise<void> {
  if (!isTauri()) return;
  await invoke("paste_item", { id, fromPhrases: from_phrases });
}

export async function deleteClipboardItem(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_clipboard_item", { id });
}

export async function clearClipboard(): Promise<void> {
  if (!isTauri()) return;
  await invoke("clear_clipboard");
}

export async function searchClipboard(query: string): Promise<ClipItem[]> {
  if (!isTauri()) return [];
  return invoke<ClipItem[]>("search_clipboard", { query });
}

export async function newPhrase(text: string): Promise<ClipItem> {
  if (!isTauri()) {
    return { id: Math.random().toString(36), type: "text", text, time: Date.now() };
  }
  return invoke<ClipItem>("new_phrase", { text });
}

export async function editPhrase(id: string, text: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("edit_phrase", { id, text });
}

export async function deletePhrase(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_phrase", { id });
}

export async function movePhraseToFirst(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("move_phrase_to_first", { id });
}

export async function moveClipboardToFirst(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("move_clipboard_to_first", { id });
}

export async function moveClipboardToPhrases(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("move_clipboard_to_phrases", { id });
}

// 按给定 id 顺序重写 sort_order（网格拖拽排序后持久化）
export async function reorderPhrases(ids: string[]): Promise<void> {
  if (!isTauri()) return;
  await invoke("reorder_phrases", { ids });
}

// 读取后端全部设置（key→value）
export async function getSettings(): Promise<Record<string, string>> {
  if (!isTauri()) return {};
  return invoke<Record<string, string>>("get_settings");
}

// 写入单条设置
export async function setSetting(key: string, value: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_setting", { key, value });
}

// 设置开机自启（通过 autostart 插件注册系统级启动项）
export async function setAutostart(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_autostart", { enabled });
}

// 打开设置窗口（面板右下角齿轮按钮调用）
export async function openSettings(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_settings");
}

// 诊断日志：前端把关键节点状态发到 Rust 端，eprintln 到终端 + 追加写文件
export async function debugLog(msg: string): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("debug_log", { msg });
  } catch (e) {
    console.error("debug_log failed", e);
  }
}

// 重新定位面板到鼠标所在显示器的工作区角落（避开任务栏）。
// 显示模式切换 resize 后调用——resize 只改尺寸不重定位，需按新高度重算 y 避免溢出屏幕
export async function repositionPanel(): Promise<void> {
  if (!isTauri()) return;
  await invoke("reposition_panel");
}

export function onClipboardUpdated(cb: () => void): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve((() => {}) as UnlistenFn);
  return listen("clipboard-updated", cb);
}

/// 把 Promise<UnlistenFn> 转成同步 cleanup 函数。
/// React useEffect 的 cleanup 是同步调用的，但 Tauri listen 返回 Promise——
/// 原写法 `return () => { un.then(f => f()) }` 把取消操作排进微任务，
/// 若组件在 Promise resolve 前卸载，监听器会泄漏直到进程退出。
/// 这里用 cancelled flag：Promise resolve 时若已卸载则立即取消，否则缓存；
/// cleanup 同步调用缓存的 unlisten。
export function syncUnlisten(un: Promise<UnlistenFn>): () => void {
  let cancelled = false;
  let unlisten: UnlistenFn | null = null;
  un.then((f) => {
    if (cancelled) f();
    else unlisten = f;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}
