import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { easeEnter, easeExit, durBase } from "../lib/motion";

interface PanelProps {
  children: ReactNode;
  footer?: ReactNode;
  /** 隐藏态：animate 到 opacity 0 + 微缩 + 下移，用于窗口 hide 前的退出动画 */
  hidden?: boolean;
}

export function Panel({ children, footer, hidden = false }: PanelProps) {
  return (
    <motion.section
      className="panel"
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={hidden ? { opacity: 0, y: 8, scale: 0.98 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: durBase, ease: hidden ? easeExit : easeEnter }}
    >
      {children}
      {footer ? <footer className="panel-footer mono">{footer}</footer> : null}
    </motion.section>
  );
}
