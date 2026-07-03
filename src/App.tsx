import { flushSync } from "react-dom";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Panel } from "./components/Panel";
import { TopBar } from "./components/TopBar";
import { CardStack } from "./components/CardStack";
import { SearchView } from "./components/SearchView";
import { useTheme, type ThemeMode } from "./lib/theme";
import { mockClipboard, mockPhrases } from "./data/mock";
import type { ClipItem, Pane, View } from "./lib/types";
import "./styles/base.css";
import "./styles/panel.css";

export default function App() {
  const { mode, setTheme } = useTheme();
  const [pane, setPane] = useState<Pane>("clipboard");
  const [view, setView] = useState<View>("stack");
  const [query, setQuery] = useState("");
  const [clip, setClip] = useState(mockClipboard);
  const [phrases] = useState(mockPhrases);
  const [activeByPane, setActiveByPane] = useState<Record<Pane, number>>({
    clipboard: 0,
    phrases: 0,
  });
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  const items = pane === "clipboard" ? clip : phrases;
  const active = Math.min(activeByPane[pane], Math.max(0, items.length - 1));
  const searching = view === "search" && pane === "clipboard";

  function setActive(n: number) {
    const clamped = Math.max(0, Math.min(n, items.length - 1));
    setActiveByPane((p) => ({ ...p, [pane]: clamped }));
  }

  function hidePanel() {
    if (isTauri()) getCurrentWindow().hide();
  }

  // 主题切换：从按钮位置开始圆形扩散（View Transitions API）
  function handleToggleTheme(e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    document.documentElement.style.setProperty("--reveal-x", `${x}px`);
    document.documentElement.style.setProperty("--reveal-y", `${y}px`);
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => unknown;
    };
    if (doc.startViewTransition && !reduce) {
      doc.startViewTransition(() => {
        flushSync(() => setTheme(next));
      });
    } else {
      setTheme(next);
    }
  }

  // 每次面板打开，重置到最新卡片（最前 = 最新）
  useEffect(() => {
    if (!isTauri()) return;
    const un = listen("panel-shown", () => {
      setActiveByPane({ clipboard: 0, phrases: 0 });
      setView("stack");
      setQuery("");
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  function paste(item: ClipItem) {
    const label =
      item.type === "image"
        ? "图片"
        : item.text && item.text.length > 20
          ? item.text!.slice(0, 20) + "…"
          : item.text;
    setFlash(label ?? "已粘贴");
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1100);

    if (pane === "clipboard") {
      setClip((prev) => {
        const idx = prev.findIndex((c) => c.id === item.id);
        if (idx <= 0) return prev;
        const next = prev.slice();
        const [m] = next.splice(idx, 1);
        next.unshift({ ...m, time: Date.now() });
        return next;
      });
      setActiveByPane((p) => ({ ...p, clipboard: 0 }));
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (searching) {
          setView("stack");
          setQuery("");
        } else {
          hidePanel();
        }
        return;
      }
      if (searching) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(active + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(active - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = items[active];
        if (it) paste(it);
      } else if (e.key === "Tab") {
        e.preventDefault();
        setPane((p) => (p === "clipboard" ? "phrases" : "clipboard"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searching, active, items, pane]);

  const searchResults = useMemo(() => {
    if (!searching) return [];
    const q = query.trim().toLowerCase();
    if (!q) return clip;
    return clip.filter(
      (c) => c.type === "text" && c.text && c.text.toLowerCase().includes(q),
    );
  }, [searching, query, clip]);

  const footerText = (() => {
    if (searching) return `${searchResults.length} / ${clip.length} 条匹配`;
    if (pane === "clipboard") return `${clip.length} 条 · Tab 常用语`;
    return `${phrases.length} 条 · Tab 剪贴板`;
  })();

  return (
    <div className="stage">
      <AnimatePresence>
        <Panel key="panel" footer={footerText}>
          <TopBar
            pane={pane}
            onPane={(p) => {
              setPane(p);
              setView("stack");
              setQuery("");
            }}
            searching={searching}
            query={query}
            onQuery={setQuery}
            onSearchToggle={(on) => {
              if (on) {
                setPane("clipboard");
                setView("search");
              } else {
                setView("stack");
                setQuery("");
              }
            }}
            onToggleTheme={handleToggleTheme}
            themeMode={mode}
          />
          <div className="panel-body">
            {searching ? (
              <SearchView items={searchResults} onSelect={paste} />
            ) : (
              <CardStack
                items={items}
                active={active}
                onSelect={(i) => paste(items[i])}
                onNav={(d) => setActive(active + d)}
              />
            )}
          </div>
        </Panel>
      </AnimatePresence>

      <AnimatePresence>
        {flash ? (
          <motion.div
            className="flash mono"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16 }}
          >
            已粘贴 · {flash}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
