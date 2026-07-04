import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getSettings, setSetting, setHotkey, setAutostart } from "../lib/tauri";

type ThemeValue = "follow" | "light" | "dark";
type AccentValue = "blue" | "green" | "orple" | "red";

const ACCENT_PRESETS: { value: AccentValue; label: string; color: string }[] = [
  { value: "blue", label: "蓝", color: "#2e5c8a" },
  { value: "green", label: "绿", color: "#2e8a5c" },
  { value: "orple", label: "紫", color: "#6a2e8a" },
  { value: "red", label: "红", color: "#c0392b" },
];

const THEME_OPTIONS: { value: ThemeValue; label: string }[] = [
  { value: "follow", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

// 将 theme 设置解析为实际生效的 data-theme 值
function resolveTheme(value: string): "light" | "dark" {
  if (value === "light") return "light";
  if (value === "dark") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function SettingsApp() {
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState<ThemeValue>("follow");
  const [accent, setAccent] = useState<AccentValue>("blue");
  const [hotkeyPanel, setHotkeyPanel] = useState("alt+v");
  const [hotkeySearch, setHotkeySearch] = useState("alt+c");
  const [maxItems, setMaxItems] = useState(50);
  const [autostart, setAutostartState] = useState(false);
  const [panelErr, setPanelErr] = useState<string | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  // 挂载时拉取设置并应用到当前窗口
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSettings();
        if (cancelled) return;
        const t = (s.theme as ThemeValue) ?? "follow";
        const a = (s.accent as AccentValue) ?? "blue";
        setTheme(t);
        setAccent(a);
        setHotkeyPanel(s.hotkey_panel ?? "alt+v");
        setHotkeySearch(s.hotkey_search ?? "alt+c");
        setMaxItems(Number(s.max_items ?? "50"));
        setAutostartState((s.autostart ?? "off") === "on");
        document.documentElement.setAttribute("data-theme", resolveTheme(t));
      } catch (e) {
        console.error("load settings failed", e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 跟随系统时，监听系统主题变化
  useEffect(() => {
    if (theme !== "follow") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.setAttribute("data-theme", resolveTheme("follow"));
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  async function handleThemeChange(next: ThemeValue) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", resolveTheme(next));
    try {
      await setSetting("theme", next);
    } catch (e) {
      console.error("set theme failed", e);
    }
  }

  async function handleAccentChange(next: AccentValue) {
    setAccent(next);
    try {
      await setSetting("accent", next);
      // 广播强调色变更，面板（Task 15）将监听并应用
      await emit("accent-changed", next);
    } catch (e) {
      console.error("set accent failed", e);
    }
  }

  async function handleHotkeyChange(
    key: "hotkey_panel" | "hotkey_search",
    value: string,
    setErr: (e: string | null) => void,
  ) {
    setErr(null);
    try {
      await setHotkey(key, value);
      if (key === "hotkey_panel") setHotkeyPanel(value);
      else setHotkeySearch(value);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
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
        {/* 主题 */}
        <section className="settings-section">
          <h2 className="settings-section-title">主题</h2>
          <div className="settings-radio-row">
            {THEME_OPTIONS.map((opt) => (
              <label key={opt.value} className="settings-radio">
                <input
                  type="radio"
                  name="theme"
                  value={opt.value}
                  checked={theme === opt.value}
                  onChange={() => handleThemeChange(opt.value)}
                />
                <span className="settings-radio-mark" />
                <span className="settings-radio-label">{opt.label}</span>
              </label>
            ))}
          </div>
        </section>

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

        {/* 热键 */}
        <section className="settings-section">
          <h2 className="settings-section-title">热键</h2>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="hotkey_panel">
              打开面板
            </label>
            <input
              id="hotkey_panel"
              className="settings-input mono"
              type="text"
              value={hotkeyPanel}
              spellCheck={false}
              onChange={(e) => setHotkeyPanel(e.target.value)}
              onBlur={() =>
                handleHotkeyChange("hotkey_panel", hotkeyPanel.trim(), setPanelErr)
              }
            />
            {panelErr ? <p className="settings-error">{panelErr}</p> : null}
          </div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="hotkey_search">
              打开搜索
            </label>
            <input
              id="hotkey_search"
              className="settings-input mono"
              type="text"
              value={hotkeySearch}
              spellCheck={false}
              onChange={(e) => setHotkeySearch(e.target.value)}
              onBlur={() =>
                handleHotkeyChange("hotkey_search", hotkeySearch.trim(), setSearchErr)
              }
            />
            {searchErr ? <p className="settings-error">{searchErr}</p> : null}
          </div>
        </section>

        {/* 最大条数 */}
        <section className="settings-section">
          <h2 className="settings-section-title">最大条数</h2>
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
      </main>
    </div>
  );
}
