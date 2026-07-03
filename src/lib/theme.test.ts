import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./theme";

// 注意：此测试需要 jsdom 环境（vitest config 中 environment: 'jsdom'）
// 需要 devDependencies：jsdom, @testing-library/react

describe("useTheme", () => {
  beforeEach(() => {
    // 隔离 localStorage / matchMedia
    localStorage.clear();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("dark") ? false : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("falls back to system light theme when localStorage is empty", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("light");
  });

  test("reads stored theme from localStorage", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("dark");
  });

  test("setTheme updates mode and persists to localStorage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("dark");
    });
    expect(result.current.mode).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  test("setTheme sets data-theme attribute on documentElement", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("light");
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  test("toggling between light and dark persists latest value", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    act(() => result.current.setTheme("light"));
    expect(localStorage.getItem("theme")).toBe("light");
    expect(result.current.mode).toBe("light");
  });
});
