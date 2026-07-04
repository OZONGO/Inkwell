import { useEffect } from "react";
import { motion } from "framer-motion";
import { easeEnter, easeExit, durBase, durFast } from "../lib/motion";

interface ClearConfirmProps {
  originRect: { left: number; top: number; width: number; height: number };
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 清空剪贴板确认气泡。position: fixed，定位在按钮上方 8px，水平居中于按钮。
 * 透明 backdrop 接管点击外部 = 取消；Esc 取消、Enter 确认（capture 阶段拦截，
 * 先于 App 的全局 onKey，避免穿透到面板快捷键）。
 *
 * 定位原理：left/top 设为按钮中心 + 按钮顶部-8px，再用 framer-motion 的
 * x:"-50%" y:"-100%" 把气泡左上角偏移到自身底部中心，使气泡底部中心对齐按钮中心。
 * transformOrigin "50% 100%" 让 scale 从底部中心展开，视觉上从按钮位置浮出。
 * 不能用 CSS transform: translate(-50%, -100%) — 会被 framer-motion 的动画 transform 覆盖。
 */
export function ClearConfirm({ originRect, onConfirm, onCancel }: ClearConfirmProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onConfirm, onCancel]);

  const cx = originRect.left + originRect.width / 2;
  const top = originRect.top - 8;

  return (
    <>
      <div className="clear-confirm-backdrop" onClick={onCancel} />
      <motion.div
        className="clear-confirm"
        style={{ left: cx, top, transformOrigin: "50% 100%" }}
        initial={{ opacity: 0, scale: 0.92, x: "-50%", y: "-100%" }}
        animate={{ opacity: 1, scale: 1, x: "-50%", y: "-100%", transition: { duration: durBase, ease: easeEnter } }}
        exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-100%", transition: { duration: durFast, ease: easeExit } }}
      >
        <span className="clear-confirm-text">清空剪贴板？</span>
        <div className="clear-confirm-actions">
          <button
            className="clear-confirm-btn danger"
            onClick={onConfirm}
            autoFocus
          >
            是
          </button>
          <button
            className="clear-confirm-btn"
            onClick={onCancel}
          >
            不是
          </button>
        </div>
      </motion.div>
    </>
  );
}
