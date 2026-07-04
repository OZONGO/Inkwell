import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { getSettings, setSetting, setAutostart } from "../lib/tauri";

type AccentValue = "blue" | "green" | "orple" | "red";

const ACCENT_PRESETS: { value: AccentValue; label: string; color: string }[] = [
  { value: "blue", label: "蓝", color: "#2e5c8a" },
  { value: "green", label: "绿", color: "#2e8a5c" },
  { value: "orple", label: "紫", color: "#6a2e8a" },
  { value: "red", label: "红", color: "#c0392b" },
];

// 快捷键说明（只读，不可更改）
const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ["Alt", "V"], desc: "呼出 / 隐藏面板" },
  { keys: ["Alt", "C"], desc: "打开搜索" },
  { keys: ["↓", "↑"], desc: "翻动卡片" },
  { keys: ["Enter"], desc: "粘贴当前卡片" },

  { keys: ["Tab"], desc: "切换 剪贴板 / 常用语" },
  { keys: ["Esc"], desc: "关闭搜索 / 网格 / 面板" },
];

// 将 theme 设置值解析为实际生效的 data-theme 属性值
function resolveTheme(value: string | undefined): "light" | "dark" {
  if (value === "light") return "light";
  if (value === "dark") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function SettingsApp() {
  const [loaded, setLoaded] = useState(false);
  const [accent, setAccent] = useState<AccentValue>("blue");
  const [maxItems, setMaxItems] = useState(50);
  const [autostart, setAutostartState] = useState(false);

  // 挂载时拉取设置并应用到当前窗口 + 监听主题实时变更
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await getSettings();
        if (cancelled) return;
        const a = (s.accent as AccentValue) ?? "blue";
        setAccent(a);
        setMaxItems(Number(s.max_items ?? "50"));
        setAutostartState((s.autostart ?? "off") === "on");
        document.documentElement.setAttribute("data-theme", resolveTheme(s.theme));
      } catch (e) {
        console.error("load settings failed", e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    const un = listen<string>("theme-changed", (e) => {
      const v = e.payload;
      if (v === "light" || v === "dark") {
        document.documentElement.setAttribute("data-theme", v);
      }
    });
    return () => {
      cancelled = true;
      un.then((f) => f());
    };
  }, []);

  async function handleAccentChange(next: AccentValue) {
    setAccent(next);
    try {
      await setSetting("accent", next);
      // 广播强调色变更，面板监听并应用
      await emit("accent-changed", next);
    } catch (e) {
      console.error("set accent failed", e);
    }
  }

  async function handleMaxItemsChange(value: number) {
    setMaxItems(value);
    try {
      await setSetting("max_items", String(value));
    } catch (e) {
      console.error("set max_items failed", e);
    }
  }

  async function handleAutostartChange(on: boolean) {
    try {
      await setAutostart(on);
      // 持久化设置仅用于 UI 显示与下次启动时回显
      await setSetting("autostart", on ? "on" : "off");
      setAutostartState(on);
    } catch (e) {
      console.error("set autostart failed", e);
    }
  }

  if (!loaded) {
    return (
      <div className="settings-root">
        <div className="settings-loading">加载中…</div>
      </div>
    );
  }

  return (
    <div className="settings-root">
      <header className="settings-header">
        <h1 className="settings-title">设置</h1>
      </header>

      <main className="settings-body">
        {/* 强调色 */}
        <section className="settings-section">
          <h2 className="settings-section-title">强调色</h2>
          <div className="settings-swatches">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={"settings-swatch" + (accent === p.value ? " on" : "")}
                style={{ background: p.color }}
                title={p.label}
                aria-label={p.label}
                onClick={() => handleAccentChange(p.value)}
              />
            ))}
          </div>
        </section>

        {/* 保持条数 */}
        <section className="settings-section">
          <h2 className="settings-section-title">保持条数</h2>
          <div className="settings-field">
            <input
              className="settings-slider"
              type="range"
              min={10}
              max={500}
              step={10}
              value={maxItems}
              onChange={(e) => handleMaxItemsChange(Number(e.target.value))}
            />
            <span className="settings-slider-value mono">{maxItems}</span>
          </div>
        </section>

        {/* 开机自启 */}
        <section className="settings-section">
          <h2 className="settings-section-title">开机自启</h2>
          <label className="settings-toggle-row">
            <span className="settings-toggle-label">登录时自动启动</span>
            <span className="settings-toggle">
              <input
                type="checkbox"
                checked={autostart}
                onChange={(e) => handleAutostartChange(e.target.checked)}
              />
              <span className="settings-toggle-track" />
            </span>
          </label>
        </section>

        {/* 快捷键（只读） */}
        <section className="settings-section">
          <h2 className="settings-section-title">快捷键</h2>
          <div className="settings-shortcut-list">
            {SHORTCUTS.map((s) => (
              <div key={s.desc} className="settings-shortcut-row">
                <span className="settings-shortcut-desc">{s.desc}</span>
                <span className="settings-kbd-group">
                  {s.keys.map((k, i) => (
                    <kbd key={i} className="settings-kbd">{k}</kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
