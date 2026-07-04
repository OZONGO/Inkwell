import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getSettings, setSetting } from "./tauri";

export type ThemeMode = "light" | "dark";

function systemTheme(): ThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const stored = localStorage.getItem("theme") as ThemeMode | null;
  const [manual, setManual] = useState<boolean>(!!stored);
  const [mode, setMode] = useState<ThemeMode>(stored ?? systemTheme());

  // 挂载时从后端设置读取主题（仅 Tauri 环境；测试中 isTauri() 为 false 跳过）
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (cancelled) return;
        const t = s.theme;
        if (t === "follow") {
          localStorage.removeItem("theme");
          setManual(false);
          setMode(systemTheme());
        } else if (t === "light" || t === "dark") {
          setManual(true);
          setMode(t);
        }
      })
      .catch((e) => console.error("load theme settings failed", e));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
  }, [mode]);

  useEffect(() => {
    if (manual) localStorage.setItem("theme", mode);
  }, [mode, manual]);

  // follow system changes unless the user has explicitly chosen
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (!manual) setMode(systemTheme());
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [manual]);

  const setTheme = (next: ThemeMode) => {
    setManual(true);
    setMode(next);
    if (isTauri()) {
      setSetting("theme", next).catch((e) =>
        console.error("persist theme failed", e),
      );
    }
  };

  return { mode, setTheme };
}
