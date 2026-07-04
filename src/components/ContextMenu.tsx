import { useEffect } from "react";
import { motion } from "framer-motion";
import { overlayPop, whileTap } from "../lib/motion";

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

// 浮动右键菜单：fade + scale-in；点击外部或 Esc 关闭
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="ctx-backdrop" onClick={onClose} />
      <motion.ul
        className="ctx-menu"
        style={{ left: x, top: y }}
        initial={overlayPop.initial}
        animate={overlayPop.animate}
        exit={overlayPop.exit}
      >
        {items.map((it) => (
          <li key={it.label}>
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
          </li>
        ))}
      </motion.ul>
    </>
  );
}
