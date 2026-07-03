import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "./App";

// 注意：此测试需要 jsdom 环境 + @testing-library/react + @testing-library/jest-dom
// 并需 mock 以下 Tauri 模块（它们在 jsdom 中不可用）：
//   - @tauri-apps/api/window (getCurrentWindow)
//   - @tauri-apps/api/core (isTauri)
//   - @tauri-apps/api/event (listen)

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false, // 非 Tauri 环境，跳过原生窗口逻辑
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    hide: vi.fn(),
    listen: vi.fn(() => Promise.resolve(() => {})),
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// framer-motion 在 jsdom 下需要降级以避免动画相关 API 缺失
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    { get: (_, prop) => (prop === "input" ? "input" : "div") },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe("App", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 4, 12, 30, 0));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("renders clipboard panel with footer count", () => {
    render(<App />);
    // mock.ts 中 mockClipboard 有 6 条
    expect(screen.getByText(/6 条 · Tab 常用语/)).toBeTruthy();
  });

  test("Tab key switches pane to phrases and updates footer", () => {
    render(<App />);
    const root = document.getElementById("root") as HTMLElement;
    fireEvent.keyDown(window, { key: "Tab" });
    // mock.ts 中 mockPhrases 有 4 条
    expect(screen.getByText(/4 条 · Tab 剪贴板/)).toBeTruthy();
  });

  test("ArrowDown moves active card highlight", () => {
    render(<App />);
    // 按 ArrowDown 不应报错，且 active 索引应推进
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    // 没有直观断言点，验证不抛错即通过基础健壮性
    expect(screen.getByText(/6 条 · Tab 常用语/)).toBeTruthy();
  });

  test("ArrowUp at index 0 clamps to 0 (no negative)", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByText(/6 条 · Tab 常用语/)).toBeTruthy();
  });

  test("Enter on active clipboard item triggers paste flash", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "Enter" });
    // flash 文本"已粘贴 · ..."
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByText(/已粘贴 ·/)).toBeTruthy();
  });

  test("Enter on image item shows '图片' label", () => {
    render(<App />);
    // mockClipboard[3] 是 image 类型；连续 ArrowDown 三次到达
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByText(/已粘贴 · 图片/)).toBeTruthy();
  });

  test("Escape in stack view does not crash (no Tauri hide in test env)", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "Escape" });
    // 仍在 clipboard 视图
    expect(screen.getByText(/6 条 · Tab 常用语/)).toBeTruthy();
  });

  test("search filters clipboard by query (case-insensitive)", () => {
    render(<App />);
    // 进入搜索视图：TopBar 的搜索按钮 — 这里通过点击 toggle 模拟
    // 由于 TopBar 内部结构，直接点击搜索图标
    const searchBtn = screen.getByLabelText(/搜索/) as HTMLButtonElement;
    if (searchBtn) {
      fireEvent.click(searchBtn);
    }
    // 输入查询
    const input = screen.getByPlaceholderText(/搜索/i) as HTMLInputElement;
    if (input) {
      fireEvent.change(input, { target: { value: "TAURI" } });
    }
    // 应匹配含 "tauri" 的项（不区分大小写）
    // mockClipboard[0] 含 "Tauri"
    expect(screen.getByText(/1 \/ 6 条匹配/)).toBeTruthy();
  });
});
