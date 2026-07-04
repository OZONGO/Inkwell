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

export async function pasteItem(id: string, shift: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("paste_item", { id, shift });
}

export async function deleteClipboardItem(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_clipboard_item", { id });
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

// 设置热键（后端会校验格式 + 冲突 + 注册）
export async function setHotkey(key: string, value: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_hotkey", { key, value });
}

// 设置开机自启（通过 autostart 插件注册系统级启动项）
export async function setAutostart(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_autostart", { enabled });
}

export function onClipboardUpdated(cb: () => void): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve((() => {}) as UnlistenFn);
  return listen("clipboard-updated", cb);
}
