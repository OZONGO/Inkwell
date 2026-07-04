import { type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Pane } from "../lib/types";
import { SearchIcon, SunIcon, MoonIcon, PlusIcon, GridIcon } from "./icons";
import { easeOut, durBase, durFast, springUI, whileTap } from "../lib/motion";

interface TopBarProps {
  pane: Pane;
  onPane: (p: Pane) => void;
  searching: boolean;
  query: string;
  onQuery: (q: string) => void;
  onSearchToggle: (on: boolean) => void;
  onToggleTheme: (e: MouseEvent<HTMLButtonElement>) => void;
  themeMode: "light" | "dark";
  onNewPhrase?: () => void;
  onEditOrder?: () => void;
}

// 分段切换器：layoutId 让高亮指示器在两个选项间物理滑动，
// 像 iOS 分段控件。纸条从一格"滑"到另一格。
function Segmented({ pane, onPane }: { pane: Pane; onPane: (p: Pane) => void }) {
  return (
    <div className="seg">
      {(["clipboard", "phrases"] as const).map((p) => (
        <button
          key={p}
          className={pane === p ? "seg-btn on" : "seg-btn"}
          onClick={() => onPane(p)}
        >
          {pane === p && (
            <motion.div
              layoutId="seg-indicator"
              className="seg-indicator"
              transition={springUI}
            />
          )}
          <span className="seg-label">{p === "clipboard" ? "剪贴板" : "常用语"}</span>
        </button>
      ))}
    </div>
  );
}

export function TopBar({
  pane,
  onPane,
  searching,
  query,
  onQuery,
  onSearchToggle,
  onToggleTheme,
  themeMode,
  onNewPhrase,
  onEditOrder,
}: TopBarProps) {
  return (
    <div className="topbar">
      <Segmented pane={pane} onPane={onPane} />
      <div className="topbar-actions">
        {pane === "clipboard" && (
          <motion.div
            className="search-expander"
            animate={{ width: searching ? 168 : 28 }}
            transition={{ duration: durBase, ease: easeOut }}
          >
            <motion.button
              className="icon-btn"
              whileTap={whileTap}
              onClick={() => onSearchToggle(!searching)}
              aria-label="搜索"
            >
              <SearchIcon />
            </motion.button>
            <AnimatePresence>
              {searching && (
                <motion.input
                  className="search-input"
                  autoFocus
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: durFast, ease: easeOut }}
                  value={query}
                  onChange={(e) => onQuery(e.target.value)}
                  placeholder="搜索剪贴板…"
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
        {pane === "phrases" && (
          <>
            <motion.button
              className="icon-btn"
              whileTap={whileTap}
              onClick={() => onEditOrder?.()}
              title="编辑顺序"
              aria-label="编辑顺序"
            >
              <GridIcon />
            </motion.button>
            <motion.button
              className="icon-btn"
              whileTap={whileTap}
              onClick={() => onNewPhrase?.()}
              title="新建"
              aria-label="新建"
            >
              <PlusIcon />
            </motion.button>
          </>
        )}
        <motion.button
          className="icon-btn"
          whileTap={whileTap}
          onClick={onToggleTheme}
          title="切换主题"
          aria-label="切换主题"
        >
          {themeMode === "dark" ? <SunIcon /> : <MoonIcon />}
        </motion.button>
      </div>
    </div>
  );
}
