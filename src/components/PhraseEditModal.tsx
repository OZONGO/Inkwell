import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface PhraseEditModalProps {
  open: boolean;
  title: string;
  initialValue?: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}

/// 常用语新建/编辑模态弹窗——替代 window.prompt，匹配墨与纸视觉语言。
/// 渲染在 WebView 内部，不触发面板 blur（避免面板自动隐藏）。
export function PhraseEditModal({
  open,
  title,
  initialValue = "",
  onConfirm,
  onCancel,
}: PhraseEditModalProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时重置为初始值并聚焦输入框（延迟一帧确保 DOM 已挂载）
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open, initialValue]);

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = value.trim();
      if (v) onConfirm(v);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  function confirm() {
    const v = value.trim();
    if (v) onConfirm(v);
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onClick={onCancel}
        >
          <motion.div
            className="modal"
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">{title}</div>
            <input
              ref={inputRef}
              className="modal-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKey}
              placeholder="输入常用语…"
            />
            <div className="modal-actions">
              <button className="modal-btn" onClick={onCancel}>
                取消
              </button>
              <button className="modal-btn primary" onClick={confirm}>
                确定
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
