import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { menuStagger, menuItem, whileTap, easeOut, durFast } from "../lib/motion";

export interface ContextMenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

// 浮动右键菜单：背景淡入 + 容器 scale-in + 项错峰落位。
// 边界检测：菜单渲染后测量实际尺寸，超出视口则翻转到左侧/上方，避免溢出屏幕。
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ x, y });

  // useLayoutEffect 在 paint 前同步测量，避免位置调整闪烁。
  // 首次渲染用原始 {x,y}（可能溢出），测量后立即修正再 paint。
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let nx = x;
    let ny = y;
    if (x + rect.width > window.innerWidth - margin) {
      nx = Math.max(margin, x - rect.width);  // 翻转到光标左侧
    }
    if (y + rect.height > window.innerHeight - margin) {
      ny = Math.max(margin, y - rect.height);  // 翻转到光标上方
    }
    setPos((prev) => (prev.x === nx && prev.y === ny ? prev : { x: nx, y: ny }));
  }, [x, y]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <motion.div
        className="ctx-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: durFast, ease: easeOut }}
      />
      <motion.ul
        ref={menuRef}
        className="ctx-menu"
        style={{ left: pos.x, top: pos.y }}
        variants={menuStagger()}
        initial="hidden"
        animate="show"
        exit="exit"
      >
        {items.map((it) => (
          <motion.li key={it.label} variants={menuItem}>
            <motion.button
              className={`ctx-item${it.danger ? " danger" : ""}`}
              whileTap={whileTap}
              onClick={() => {
                it.action();
                onClose();
              }}
            >
              {it.label}
            </motion.button>
          </motion.li>
        ))}
      </motion.ul>
    </>
  );
}
