import { flushSync } from "react-dom";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { Panel } from "./components/Panel";
import { TopBar } from "./components/TopBar";
import { CardStack } from "./components/CardStack";
import { CardFlow } from "./components/CardFlow";
import { SearchView } from "./components/SearchView";
import { PhraseGrid } from "./components/PhraseGrid";
import { ContextMenu, type ContextMenuItem } from "./components/ContextMenu";
import { PhraseEditModal } from "./components/PhraseEditModal";
import { ClearConfirm } from "./components/ClearConfirm";
import { TrashIcon, GearIcon } from "./components/icons";
import { useTheme, type ThemeMode } from "./lib/theme";
import { animatePanelHeight, animatePanelSize } from "./lib/animateWindowSize";
import { easeOut, easeEnter, easeExit, durBase, durFast, durSlow, paneSlide, footerRoll } from "./lib/motion";
import {
  listClipboard,
  listPhrases,
  pasteItem,
  deleteClipboardItem,
  clearClipboard,
  moveClipboardToFirst,
  moveClipboardToPhrases,
  editPhrase,
  deletePhrase,
  movePhraseToFirst,
  newPhrase,
  reorderPhrases,
  onClipboardUpdated,
  getSettings,
  openSettings,
  debugLog,
  syncUnlisten,
} from "./lib/tauri";
import type { ClipItem, DisplayMode, Pane, View } from "./lib/types";
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
  const [flash, setFlash] = useState<{ text: string; error?: boolean } | null>(null);
  const flashTimer = useRef<number | null>(null);
  // 数据是否已从后端加载完成。false 期间显示"加载中…"而非"还没有内容"，
  // 避免首次挂载时空状态闪烁误导用户。
  const [loaded, setLoaded] = useState(false);
  // 面板退出动画态：hidePanel 时置 true，Panel 淡出后（180ms）再 win.hide()，
  // 避免窗口瞬时消失来不及播退出动画。panel-shown 时置 false 重新进场。
  const [panelHidden, setPanelHidden] = useState(false);
  // pane 切换方向：+1 = 向右翻（剪贴板→常用语），-1 = 向左翻（常用语→剪贴板）。
  // 用于 paneSlide 抽屉式换页的方向向量。默认 +1，切到常用语时设 +1、切回设 -1。
  const [paneDir, setPaneDir] = useState<1 | -1>(1);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("stack");
  // 显示模式切换方向：flow 比 stack 高，切到 flow 时 +1（内容从下方进入），
  // 切回 stack 时 -1（内容从上方进入），与窗口向下生长/向上收缩的方向感一致
  const [dmDir, setDmDir] = useState<1 | -1>(1);
  // suppressBlurRef：点齿轮按钮时置 true，挡住打开设置窗口导致的首次 blur
  // settingsVisibleRef：设置窗口可见期间持续为 true，挡住后续 blur
  const suppressBlurRef = useRef(false);
  const settingsVisibleRef = useRef(false);
  const [menu, setMenu] = useState<{ x: number; y: number; item: ClipItem } | null>(null);
  const [phraseModal, setPhraseModal] = useState<{
    title: string;
    initialValue: string;
    onConfirm: (text: string) => void;
    originRect?: { left: number; top: number; width: number; height: number } | null;
  } | null>(null);
  // 任何 overlay（编辑弹窗 / 右键菜单）打开时，全局键盘快捷键让位。
  // React 的 e.stopPropagation() 只挡合成事件，挡不住 window 上的原生 listener，
  // 必须在 onKey 里读 ref 跳过，否则 Tab/方向键/Enter/Escape 会穿透到 overlay 背后的面板。
  const overlayOpenRef = useRef(false);
  // 清空剪贴板动画态：true 期间卡片播批量退场动画，空状态守卫挡住外层 AnimatePresence
  // 提前卸载 CardStack/CardFlow。clearingRef 同步给 onClipboardUpdated 监听挡回灌事件。
  const [clearing, setClearing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const clearingRef = useRef(false);
  clearingRef.current = clearing;
  overlayOpenRef.current = phraseModal !== null || menu !== null || clearConfirm !== null;

  const items = pane === "clipboard" ? clip : phrases;
  const active = Math.min(activeByPane[pane], Math.max(0, items.length - 1));
  const searching = view === "search" && pane === "clipboard";
  const searchingRef = useRef(searching);
  searchingRef.current = searching;
  const paneRef = useRef(pane);
  paneRef.current = pane;
  const viewRef = useRef(view);
  viewRef.current = view;
  const displayModeRef = useRef(displayMode);
  displayModeRef.current = displayMode;

  function setActive(n: number) {
    const clamped = Math.max(0, Math.min(n, items.length - 1));
    setActiveByPane((p) => ({ ...p, [pane]: clamped }));
  }

  function hidePanel() {
    // 不直接 win.hide()，先触发 Panel 退出动画，由下方 useEffect 延迟 hide
    setPanelHidden(true);
  }

  // panelHidden 触发时，等 Panel 退出动画（durBase 180ms）跑完再 win.hide()。
  // panel-shown 会 setPanelHidden(false)，cleanup 取消定时器（避免重新打开被误 hide）。
  useEffect(() => {
    if (!panelHidden || !isTauri()) return;
    const timer = window.setTimeout(() => {
      getCurrentWindow().hide();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [panelHidden]);

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
    emit("theme-changed", next).catch((e) =>
      console.error("emit theme-changed failed", e),
    );
  }

  // 挂载时拉取数据 + 订阅剪贴板更新事件
  useEffect(() => {
    if (!isTauri()) {
      setLoaded(true);  // 非Tauri环境（如测试）直接标记完成
      return;
    }
    Promise.all([listClipboard(), listPhrases()])
      .then(([c, p]) => {
        setClip(c);
        setPhrases(p);
      })
      .finally(() => setLoaded(true));
    const un = onClipboardUpdated(() => {
      if (clearingRef.current) return;  // 清空期间忽略回灌事件，避免覆盖 setClip([])
      listClipboard().then(setClip);
    });
    return syncUnlisten(un);
  }, []);

  // 每次面板打开，重置到最新卡片（最前 = 最新）；refetch 数据 + 聚焦 DOM 使键盘立即生效
  useEffect(() => {
    if (!isTauri()) return;
    const un = listen("panel-shown", () => {
      setActiveByPane({ clipboard: 0, phrases: 0 });
      setView("stack");
      setQuery("");
      setMenu(null);
      setPhraseModal(null);
      setPanelHidden(false);  // 重新进场（取消挂起的 hide 定时器）
      // 同步显示模式（用户可能在设置里改过）；Rust 端已按 settings 尺寸 resize 窗口
      getSettings().then((s) => setDisplayMode(s.display_mode === "flow" ? "flow" : "stack"));
      listClipboard().then(setClip);
      listPhrases().then(setPhrases);
      // 立即聚焦 + 下一帧再试，覆盖 Alt 键弹起时 WebView2 的焦点抢占
      const root = document.getElementById("root");
      const focusRoot = () => root?.focus({ preventScroll: true });
      focusRoot();
      requestAnimationFrame(focusRoot);
    });
    return syncUnlisten(un);
  }, []);

  // 点击面板外部或切窗口时自动隐藏（打开设置窗口导致的 blur 除外）
  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    const un = win.listen("tauri://blur", () => {
      const suppressed = suppressBlurRef.current || settingsVisibleRef.current;
      debugLog(`blur: suppressed=${suppressed} suppressBlur=${suppressBlurRef.current} settingsVisible=${settingsVisibleRef.current}`);
      if (suppressed) {
        suppressBlurRef.current = false;
        return;
      }
      win.hide();
    });
    return syncUnlisten(un);
  }, []);

  // 监听设置窗口可见性（Rust 端 open_settings/toggle_settings emit）+ 显示模式切换
  // 设置窗口 emit display-mode-changed 时，面板若可见则做 resize 动画 + 切内容
  useEffect(() => {
    if (!isTauri()) return;
    const un1 = listen<boolean>("settings-visibility", (e) => {
      settingsVisibleRef.current = e.payload === true;
    });
    const un2 = listen<DisplayMode>("display-mode-changed", async (e) => {
      const next: DisplayMode = e.payload === "flow" ? "flow" : "stack";
      const win = getCurrentWindow();
      const visible = await win.isVisible();
      debugLog(`dm-changed: from=${displayMode} next=${next} visible=${visible} view=${viewRef.current}`);
      // grid 模式下窗口尺寸由 grid 控制（720×480），不动画高度——animatePanelHeight
      // 内部宽度硬编码 380 会把 grid 的 720 宽压回 380，破坏布局。
      // 只更新 state，退出 grid 时 handleExitGrid 按新 displayMode 恢复高度
      if (visible && viewRef.current !== "grid") {
        const toH = next === "flow" ? 615 : 320;
        animatePanelHeight(toH, 260).catch((err) =>
          debugLog(`dm-changed: animatePanelHeight FAILED ${String(err)}`),
        );
      } else {
        debugLog(`dm-changed: skipped resize (not visible or in grid)`);
      }
      // 方向：切到 flow（更高）内容从下方进入，切回 stack 从上方进入
      setDmDir(next === "flow" ? 1 : -1);
      setDisplayMode(next);
    });
    const clean1 = syncUnlisten(un1);
    const clean2 = syncUnlisten(un2);
    return () => {
      clean1();
      clean2();
    };
  }, [displayMode]);

  // 挂载时从设置读取强调色 + 显示模式 + 监听 SettingsApp 发出的 accent-changed 事件
  useEffect(() => {
    if (!isTauri()) return;
    getSettings()
      .then((s) => {
        const a = s.accent;
        if (a) document.documentElement.setAttribute("data-accent", a);
        if (s.display_mode === "flow") setDisplayMode("flow");
      })
      .catch((e) => console.error("load settings failed", e));
    const un = listen<string>("accent-changed", (e) => {
      const v = e.payload;
      if (typeof v === "string") {
        document.documentElement.setAttribute("data-accent", v);
      }
    });
    return syncUnlisten(un);
  }, []);

  // Alt+C 全局热键：后端 emit toggle-search，前端 toggle 搜索框
  useEffect(() => {
    if (!isTauri()) return;
    const un = listen("toggle-search", () => {
      if (overlayOpenRef.current) return;  // 弹窗/菜单打开时不抢搜索
      if (paneRef.current !== "clipboard") return;
      const on = !searchingRef.current;
      if (on) {
        setView("search");
      } else {
        setView("stack");
        setQuery("");
      }
    });
    return syncUnlisten(un);
  }, []);

  function paste(item: ClipItem) {
    const label =
      item.type === "image"
        ? "图片"
        : item.text && item.text.length > 20
          ? item.text!.slice(0, 20) + "…"
          : item.text;
    setFlash({ text: label ?? "已粘贴" });
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
    pasteItem(item.id, pane === "phrases")
      .then(() => {
        // paste 成功后 Rust 端已 hide 窗口；同步前端 state，下次打开时 Panel 重新进场
        setPanelHidden(true);
      })
      .catch((e) => {
        console.error("paste failed", e);
        // 错误反馈：红色 toast + shake（面板还可见时用户能看到）
        setFlash({ text: "粘贴失败", error: true });
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash(null), 1500);
      });
  }

  // 点击 footer 清空按钮：捕获按钮位置，弹出确认气泡
  function handleClearClick(e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setClearConfirm({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  }

  // 确认清空：置 clearing 态触发卡片批量退场动画，调 IPC 清空数据库，
  // setClip([]) 让 CardStack/CardFlow 进入退出流程；onExitComplete 复位 clearing。
  // 800ms 兜底定时器防止动画异常时永久卡死。
  function handleClearConfirm() {
    setClearConfirm(null);
    setClearing(true);
    clearingRef.current = true;
    const fallback = window.setTimeout(() => {
      setClearing(false);
      clearingRef.current = false;
    }, 800);
    clearClipboard()
      .then(() => {
        setClip([]);
      })
      .catch((err: unknown) => {
        console.error("clear clipboard failed", err);
        window.clearTimeout(fallback);
        setClearing(false);
        clearingRef.current = false;
        listClipboard().then(setClip);
      });
  }

  function handleClearCancel() {
    setClearConfirm(null);
  }

  function handleClearExitComplete() {
    setClearing(false);
    clearingRef.current = false;
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // 弹窗/右键菜单打开时，键盘事件交给 overlay 自身处理，全局快捷键全部让位
      if (overlayOpenRef.current) return;
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
      // grid 排序模式是模态的：禁用 Tab/方向键/Enter 等所有面板快捷键，
      // 只留 Escape 退出（上面已处理）。Tab 需要 preventDefault 防止焦点跳走。
      if (view === "grid") {
        if (e.key === "Tab") e.preventDefault();
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
        const next = pane === "clipboard" ? "phrases" : "clipboard";
        setPaneDir(next === "phrases" ? 1 : -1);
        setPane(next);
        setView("stack");
        setQuery("");
      }
    }
    // Alt 弹起时重新聚焦，弥补被 WebView2 菜单模式吞掉的焦点
    function onAltUp(e: KeyboardEvent) {
      if (e.key === "Alt") {
        if (overlayOpenRef.current) return;  // 弹窗内不抢 textarea 焦点
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
    if (view === "grid") return `${phrases.length} 条`;  // grid 模式禁用 Tab，不显示提示
    if (pane === "clipboard") return `${clip.length} 条 · Tab 常用语`;
    return `${phrases.length} 条 · Tab 剪贴板`;
  })();

  // footer 滚动方向：计数涨用 +1（新数字从下进），缩水用 -1。粘贴置顶删到剪贴板
  // 时计数不变但内容变，仍用 +1 维持"翻向更新"的感觉；切 pane 用 paneDir 呼应。
  const footerKey = `${pane}:${view}:${searching ? query : ""}:${clip.length}:${phrases.length}`;
  const footerDir = paneDir;

  // 新建常用语：打开自定义弹窗输入文本，确认后调用后端追加并更新本地状态。
  // 记录 + 按钮位置，弹窗从按钮位置扩展出来（originRect 驱动 PhraseEditModal 进场动画）。
  function handleNewPhrase(e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPhraseModal({
      title: "新建常用语",
      initialValue: "",
      originRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      onConfirm: async (text) => {
        try {
          const item = await newPhrase(text);
          setPhrases((prev) => [...prev, item]);
        } catch (e) {
          console.error("new phrase failed", e);
        }
        setPhraseModal(null);
      },
    });
  }

  // 进入网格排序模式：先放大面板到 720×480，待尺寸生效后再切视图，
  // 让 PhraseGrid 的 initial（缩小堆叠态）在已放大的容器里炸开飞散到网格位。
  async function handleEnterGrid() {
    if (isTauri()) {
      try {
        await animatePanelSize(720, 480);
      } catch (e) {
        console.error("resize failed", e);
      }
    }
    requestAnimationFrame(() => setView("grid"));
  }

  // 退出网格排序模式：先让网格收拢退出，再恢复面板到当前显示模式高度
  async function handleExitGrid() {
    setView("stack");
    await ensurePanelSize();
  }

  // 确保窗口尺寸是当前显示模式对应的标准尺寸（stack=380×320, flow=380×615）。
  // 不依赖 view state——直接读物理窗口尺寸，若偏离标准（如停留在 grid 的 720×480）
  // 就动画缩回。用于切 pane、退出 grid 等所有需要恢复窗口尺寸的场景。
  async function ensurePanelSize() {
    if (!isTauri()) return;
    try {
      const win = getCurrentWindow();
      const size = await win.outerSize();
      const factor = await win.scaleFactor();
      const curW = size.width / factor;
      const curH = size.height / factor;
      const targetH = displayModeRef.current === "flow" ? 615 : 320;
      debugLog(`ensurePanelSize: cur=${curW.toFixed(0)}x${curH.toFixed(0)} target=380x${targetH} dm=${displayModeRef.current}`);
      if (Math.abs(curW - 380) > 1 || Math.abs(curH - targetH) > 1) {
        await animatePanelSize(380, targetH);
        debugLog(`ensurePanelSize: resize done`);
      }
    } catch (e) {
      debugLog(`ensurePanelSize: FAILED ${String(e)}`);
      console.error("ensurePanelSize failed", e);
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
          setPhraseModal({
            title: "编辑常用语",
            initialValue: item.text || "",
            onConfirm: async (text) => {
              try {
                await editPhrase(item.id, text);
                listPhrases().then(setPhrases);
              } catch (e) {
                console.error("edit phrase failed", e);
              }
              setPhraseModal(null);
            },
          });
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
    <MotionConfig reducedMotion="user">
    <div className="stage">
      <AnimatePresence>
        <Panel
          key="panel"
          hidden={panelHidden}
          footer={
            <>
              <span className="footer-roll-wrap">
                <AnimatePresence mode="wait" custom={footerDir} initial={false}>
                  <motion.span
                    key={footerKey}
                    className="footer-roll"
                    custom={footerDir}
                    initial={footerRoll.initial(footerDir)}
                    animate={footerRoll.animate}
                    exit={footerRoll.exit(footerDir)}
                  >
                    {footerText}
                  </motion.span>
                </AnimatePresence>
              </span>
              <div className="footer-actions">
                {pane === "clipboard" && items.length > 0 && view !== "grid" && (
                  <button
                    className="icon-btn"
                    onClick={handleClearClick}
                    title="清空剪贴板"
                    aria-label="清空剪贴板"
                  >
                    <TrashIcon size={14} />
                  </button>
                )}
                <button
                  className="icon-btn"
                  onClick={() => {
                    // 置标志挡住打开设置窗口导致的首次 blur，避免面板自动隐藏
                    suppressBlurRef.current = true;
                    openSettings();
                  }}
                  title="设置"
                  aria-label="设置"
                >
                  <GearIcon size={14} />
                </button>
              </div>
            </>
          }
        >
          <TopBar
            pane={pane}
            onPane={(p) => {
              setPaneDir(p === "phrases" ? 1 : -1);
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
            hideSwitch={view === "grid"}
          />
          <div className="panel-body">
            {/* 外层：按 pane 抽屉式换页（剪贴板 ↔ 常用语），方向与顶部指示器一致 */}
            <AnimatePresence mode="wait" custom={paneDir} initial={false}>
              <motion.div
                key={pane}
                className="panel-body-view"
                custom={paneDir}
                variants={paneSlide.enter(paneDir)}
                initial="initial"
                animate="animate"
                exit="exit"
                style={{ height: "100%", display: "flex", flexDirection: "column" }}
              >
                {/* 内层：按 view 切换（堆叠 / 搜索 / 网格） */}
                <AnimatePresence mode="wait" custom={dmDir}>
                  {view === "grid" && pane === "phrases" ? (
                    <motion.div
                      key="grid"
                      className="panel-body-view"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: durBase, ease: easeEnter }}
                      style={{ height: "100%", display: "flex", flexDirection: "column" }}
                    >
                      <PhraseGrid
                        items={phrases}
                        onReorder={handlePhraseReorder}
                        onExit={handleExitGrid}
                      />
                    </motion.div>
                  ) : searching ? (
                    <motion.div
                      key="search"
                      className="panel-body-view"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: durFast, ease: easeOut }}
                      style={{ height: "100%" }}
                    >
                      <SearchView items={searchResults} onSelect={paste} />
                    </motion.div>
                  ) : !loaded ? (
                    <motion.div
                      key="skeleton"
                      className="panel-body-view card-flow"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: durFast, ease: easeOut }}
                      style={{ height: "100%" }}
                    >
                      {[0, 1, 2].map((i) => (
                        <div className="card-skeleton" key={i}>
                          <div className="skeleton-bar" style={{ width: 60, height: 10 }} />
                          <div className="skeleton-bar" style={{ flex: 1, width: "100%" }} />
                        </div>
                      ))}
                    </motion.div>
                  ) : items.length === 0 && !clearing ? (
                    <motion.div
                      key="empty"
                      className="panel-body-view stack-empty"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: durBase, ease: easeEnter }}
                    >
                      <div className="stack-empty-slip mono">
                        {pane === "clipboard" ? "00" : "—"}
                      </div>
                      <p className="stack-empty-text">
                        {pane === "clipboard" ? "还没有剪贴板内容" : "还没有常用语"}
                      </p>
                      <p className="stack-empty-hint mono">
                        {pane === "clipboard" ? "复制任意文字即自动记录" : "点右上角 + 新建一条"}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={displayMode}
                      className="panel-body-view"
                      custom={dmDir}
                      variants={{
                        initial: (dir: number) => ({
                          opacity: 0,
                          y: 8 * dir,
                        }),
                        animate: {
                          opacity: 1,
                          y: 0,
                          transition: { duration: durSlow, ease: easeEnter },
                        },
                        exit: (dir: number) => ({
                          opacity: 0,
                          y: -6 * dir,
                          transition: { duration: durBase, ease: easeExit },
                        }),
                      }}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      style={{ height: "100%" }}
                    >
                      {displayMode === "flow" ? (
                        <CardFlow
                          items={items}
                          active={active}
                          clearing={clearing}
                          onExitComplete={handleClearExitComplete}
                          onSelect={(i) => paste(items[i])}
                          onHover={(i) => setActive(i)}
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
                      ) : (
                        <CardStack
                          items={items}
                          active={active}
                          clearing={clearing}
                          onExitComplete={handleClearExitComplete}
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </AnimatePresence>
          </div>
        </Panel>
      </AnimatePresence>

      <AnimatePresence>
        {flash ? (
          <motion.div
            className={"flash mono" + (flash.error ? " error" : "")}
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={flash.error
              ? { opacity: 1, y: 0, scale: 1, x: [0, -4, 4, -2, 0] }
              : { opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={flash.error
              ? { duration: 0.3, ease: easeOut }
              : { duration: durBase, ease: easeEnter }}
          >
            {flash.error ? flash.text : `已粘贴 · ${flash.text}`}
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

      <AnimatePresence>
        {clearConfirm ? (
          <ClearConfirm
            originRect={clearConfirm}
            onConfirm={handleClearConfirm}
            onCancel={handleClearCancel}
          />
        ) : null}
      </AnimatePresence>

      <PhraseEditModal
        open={phraseModal !== null}
        title={phraseModal?.title ?? ""}
        initialValue={phraseModal?.initialValue ?? ""}
        originRect={phraseModal?.originRect}
        onConfirm={(text) => phraseModal?.onConfirm(text)}
        onCancel={() => setPhraseModal(null)}
      />
    </div>
    </MotionConfig>
  );
}
