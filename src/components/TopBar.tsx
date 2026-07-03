import { type MouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Pane } from "../lib/types";
import { SearchIcon, SunIcon, MoonIcon } from "./icons";

interface TopBarProps {
  pane: Pane;
  onPane: (p: Pane) => void;
  searching: boolean;
  query: string;
  onQuery: (q: string) => void;
  onSearchToggle: (on: boolean) => void;
  onToggleTheme: (e: MouseEvent<HTMLButtonElement>) => void;
  themeMode: "light" | "dark";
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
}: TopBarProps) {
  return (
    <div className="topbar">
      <div className="seg">
        <button
          className={pane === "clipboard" ? "seg-btn on" : "seg-btn"}
          onClick={() => onPane("clipboard")}
        >
          剪贴板
        </button>
        <button
          className={pane === "phrases" ? "seg-btn on" : "seg-btn"}
          onClick={() => onPane("phrases")}
        >
          常用语
        </button>
      </div>
      <div className="topbar-actions">
        {pane === "clipboard" && (
          <motion.div
            className="search-expander"
            animate={{ width: searching ? 168 : 28 }}
            transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <button
              className="icon-btn"
              onClick={() => onSearchToggle(!searching)}
              aria-label="搜索"
            >
              <SearchIcon />
            </button>
            <AnimatePresence>
              {searching && (
                <motion.input
                  className="search-input"
                  autoFocus
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  value={query}
                  onChange={(e) => onQuery(e.target.value)}
                  placeholder="搜索剪贴板…"
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
        <button
          className="icon-btn"
          onClick={onToggleTheme}
          title="切换主题"
          aria-label="切换主题"
        >
          {themeMode === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </div>
  );
}
