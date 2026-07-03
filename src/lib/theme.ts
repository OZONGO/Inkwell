import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

function systemTheme(): ThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const stored = localStorage.getItem("theme") as ThemeMode | null;
  const [manual, setManual] = useState<boolean>(!!stored);
  const [mode, setMode] = useState<ThemeMode>(stored ?? systemTheme());

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
  };

  return { mode, setTheme };
}
