import { useEffect } from "react";
import { motion } from "framer-motion";

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
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.12 }}
      >
        {items.map((it) => (
          <li key={it.label}>
            <button
              className={`ctx-item${it.danger ? " danger" : ""}`}
              onClick={() => {
                it.action();
                onClose();
              }}
            >
              {it.label}
            </button>
          </li>
        ))}
      </motion.ul>
    </>
  );
}
