import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { easeEnter, durBase } from "../lib/motion";

interface PanelProps {
  children: ReactNode;
  footer?: ReactNode;
}

export function Panel({ children, footer }: PanelProps) {
  return (
    <motion.section
      className="panel"
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: durBase, ease: easeEnter }}
    >
      {children}
      {footer ? <footer className="panel-footer mono">{footer}</footer> : null}
    </motion.section>
  );
}
