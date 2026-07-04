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
import { PhraseGrid } from "./components/PhraseGrid";
import { ContextMenu, type ContextMenuItem } from "./components/ContextMenu";
import { useTheme, type ThemeMode } from "./lib/theme";
import {
  listClipboard,
  listPhrases,
  pasteItem,
  deleteClipboardItem,
  moveClipboardToFirst,
  moveClipboardToPhrases,
  editPhrase,
  deletePhrase,
  movePhraseToFirst,
  newPhrase,
  reorderPhrases,
  onClipboardUpdated,
  getSettings,
} from "./lib/tauri";
import type { ClipItem, Pane, View } from "./lib/types";
import "./styles/base.css";
import "./styles/panel.css";

export default function App() {
  const { mode, setTheme } = useTheme();
  const [pane, setPane] = useState<Pane>("clipboard");
  const [view, setView] = useState<View>("stack");
  const [query, setQuery] = useState("");
  const [clip, setClip] = useState<ClipItem[]>([]);
  const [phrases, setPhrases] = useState<ClipItem[]>([]);
  const [activeByPane, setActiveByPane] = useState<Record<Pane, number>>({
    clipboard: 0,
    phrases: 0,
  });
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; item: ClipItem } | null>(null);

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

  // 挂载时拉取数据 + 订阅剪贴板更新事件
  useEffect(() => {
    if (!isTauri()) return;
    listClipboard().then(setClip);
    listPhrases().then(setPhrases);
    const un = onClipboardUpdated(() => {
      listClipboard().then(setClip);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // 每次面板打开，重置到最新卡片（最前 = 最新）；refetch 数据 + 聚焦 DOM 使键盘立即生效
  useEffect(() => {
    if (!isTauri()) return;
    const un = listen("panel-shown", () => {
      setActiveByPane({ clipboard: 0, phrases: 0 });
      setView("stack");
      setQuery("");
      listClipboard().then(setClip);
      listPhrases().then(setPhrases);
      // 立即聚焦 + 下一帧再试，覆盖 Alt 键弹起时 WebView2 的焦点抢占
      const root = document.getElementById("root");
      const focusRoot = () => root?.focus({ preventScroll: true });
      focusRoot();
      requestAnimationFrame(focusRoot);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // 点击面板外部或切窗口时自动隐藏
  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    const un = win.listen("tauri://blur", () => {
      win.hide();
    });
    return () => { un.then((f) => f()); };
  }, []);

  // 挂载时从设置读取强调色 + 监听 SettingsApp 发出的 accent-changed 事件
  useEffect(() => {
    if (!isTauri()) return;
    getSettings()
      .then((s) => {
        const a = s.accent;
        if (a) document.documentElement.setAttribute("data-accent", a);
      })
      .catch((e) => console.error("load accent failed", e));
    const un = listen<string>("accent-changed", (e) => {
      const v = e.payload;
      if (typeof v === "string") {
        document.documentElement.setAttribute("data-accent", v);
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  function paste(item: ClipItem, shift: boolean = false) {
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
    pasteItem(item.id, shift).catch((e) => console.error("paste failed", e));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // 优先级：网格 → 搜索 → 隐藏面板
        if (view === "grid") {
          handleExitGrid();
        } else if (searching) {
          setView("stack");
          setQuery("");
        } else {
          hidePanel();
        }
        return;
      }
      // 阻止 Alt 键激活 WebView2 菜单导航模式（否则焦点丢失，滚动/键盘失效）
      if (e.key === "Alt") {
        e.preventDefault();
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
        if (it) paste(it, e.shiftKey);
      } else if (e.key === "Tab") {
        e.preventDefault();
        setPane((p) => (p === "clipboard" ? "phrases" : "clipboard"));
      }
    }
    // Alt 弹起时重新聚焦，弥补被 WebView2 菜单模式吞掉的焦点
    function onAltUp(e: KeyboardEvent) {
      if (e.key === "Alt") {
        document.getElementById("root")?.focus({ preventScroll: true });
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onAltUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onAltUp);
    };
  }, [searching, active, items, pane, view]);

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

  // 新建常用语：弹窗输入文本，调用后端追加，并更新本地状态
  async function handleNewPhrase() {
    const text = window.prompt("新建常用语", "");
    if (!text || !text.trim()) return;
    try {
      const item = await newPhrase(text.trim());
      setPhrases((prev) => [...prev, item]);
    } catch (e) {
      console.error("new phrase failed", e);
    }
  }

  // 进入网格排序模式：切视图 + 放大面板到 720×480
  async function handleEnterGrid() {
    setView("grid");
    if (isTauri()) {
      try {
        const { LogicalSize } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setSize(new LogicalSize(720, 480));
      } catch (e) {
        console.error("resize failed", e);
      }
    }
  }

  // 退出网格排序模式：切回 stack + 恢复面板到 380×320
  async function handleExitGrid() {
    setView("stack");
    if (isTauri()) {
      try {
        const { LogicalSize } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setSize(new LogicalSize(380, 320));
      } catch (e) {
        console.error("resize failed", e);
      }
    }
  }

  // 拖拽重排：乐观更新本地 state + 持久化到后端
  function handlePhraseReorder(newItems: ClipItem[]) {
    setPhrases(newItems);
    reorderPhrases(newItems.map((i) => i.id)).catch((e) =>
      console.error("reorder failed", e),
    );
  }

  // 根据当前面板和条目类型构造右键菜单项
  function buildMenuItems(item: ClipItem): ContextMenuItem[] {
    if (pane === "clipboard") {
      const list: ContextMenuItem[] = [
        {
          label: "移到第一",
          action: () => {
            moveClipboardToFirst(item.id).then(() => listClipboard().then(setClip));
          },
        },
      ];
      if (item.type === "text") {
        list.push({
          label: "移入常用语",
          action: () => {
            moveClipboardToPhrases(item.id).then(() => {
              listClipboard().then(setClip);
              listPhrases().then(setPhrases);
            });
          },
        });
      }
      list.push({
        label: "删除",
        danger: true,
        action: () => {
          deleteClipboardItem(item.id).then(() => listClipboard().then(setClip));
        },
      });
      return list;
    }
    // phrases 面板
    return [
      {
        label: "修改",
        action: () => {
          const next = window.prompt("编辑常用语", item.text || "");
          if (next && next.trim()) {
            editPhrase(item.id, next.trim()).then(() =>
              listPhrases().then(setPhrases),
            );
          }
        },
      },
      {
        label: "移到第一",
        action: () => {
          movePhraseToFirst(item.id).then(() => listPhrases().then(setPhrases));
        },
      },
      {
        label: "删除",
        danger: true,
        action: () => {
          deletePhrase(item.id).then(() => listPhrases().then(setPhrases));
        },
      },
    ];
  }

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
            onNewPhrase={handleNewPhrase}
            onEditOrder={handleEnterGrid}
          />
          <div className="panel-body">
            {view === "grid" && pane === "phrases" ? (
              <PhraseGrid
                items={phrases}
                onReorder={handlePhraseReorder}
                onExit={handleExitGrid}
              />
            ) : searching ? (
              <SearchView items={searchResults} onSelect={paste} />
            ) : (
              <CardStack
                items={items}
                active={active}
                onSelect={(i) => paste(items[i])}
                onNav={(d) => setActive(active + d)}
                onItemContext={(item, e) =>
                  setMenu({ x: e.clientX, y: e.clientY, item })
                }
                onItemLongPress={(item) =>
                  setMenu({
                    x: window.innerWidth / 2,
                    y: window.innerHeight / 2,
                    item,
                  })
                }
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

      <AnimatePresence>
        {menu ? (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={buildMenuItems(menu.item)}
            onClose={() => setMenu(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
