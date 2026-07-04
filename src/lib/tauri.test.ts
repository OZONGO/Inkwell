import { describe, test, expect, vi } from "vitest";
import { newPhrase, listClipboard, pasteItem } from "./tauri";

describe("tauri IPC wrappers (non-Tauri fallbacks)", () => {
  test("newPhrase returns an object with correct shape and text", async () => {
    const item = await newPhrase("hello world");
    expect(item).toHaveProperty("id");
    expect(typeof item.id).toBe("string");
    expect(item.id.length).toBeGreaterThan(0);
    expect(item.type).toBe("text");
    expect(item.text).toBe("hello world");
    expect(item.time).toBeGreaterThan(0);
  });

  test("newPhrase creates a unique id each call", async () => {
    const [a, b] = await Promise.all([newPhrase("a"), newPhrase("b")]);
    expect(a.id).not.toBe(b.id);
  });

  test("listClipboard returns empty array in non-Tauri env", async () => {
    const result = await listClipboard();
    expect(result).toEqual([]);
  });

  test("pasteItem resolves to undefined in non-Tauri env", async () => {
    const result = await pasteItem("test-id", false);
    expect(result).toBeUndefined();
  });
});
