import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { overlayPop, easeOut, durFast, whileTap } from "../lib/motion";

interface PhraseEditModalProps {
  open: boolean;
  title: string;
  initialValue?: string;
  onConfirm: (text: string) => void | Promise<void>;
  onCancel: () => void;
}

/// 常用语新建/编辑模态弹窗——替代 window.prompt，匹配墨与纸视觉语言。
/// 渲染在 WebView 内部，不触发面板 blur（避免面板自动隐藏）。
/// 用 textarea 支持多行/大段文本输入；Esc 关闭、Ctrl+Enter 提交。
export function PhraseEditModal({
  open,
  title,
  initialValue = "",
  onConfirm,
  onCancel,
}: PhraseEditModalProps) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // ref 镜像 submitting，避免 handleKey 闭包读到旧值导致重复提交
  const submittingRef = useRef(false);

  // 打开时重置为初始值并聚焦输入框（延迟一帧确保 DOM 已挂载）
  // 编辑模式（initialValue 非空）自动全选，方便整段替换
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setSubmitting(false);
      submittingRef.current = false;
      const id = requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        if (initialValue) ta.select();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open, initialValue]);

  // 弹窗打开时阻止 wheel 冒泡到面板（避免卡片滚动）。
  // 键盘事件由 App 的全局 onKey 读 overlayOpenRef 让位，无需在此拦截。
  useEffect(() => {
    if (!open) return;
    function stopWheel(e: Event) {
      e.stopPropagation();
    }
    window.addEventListener("wheel", stopWheel, true);
    return () => {
      window.removeEventListener("wheel", stopWheel, true);
    };
  }, [open]);

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl/Cmd+Enter 提交，普通 Enter 换行（大段文本友好）
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void confirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (!submittingRef.current) onCancel();
    }
  }

  async function confirm() {
    const v = value.trim();
    if (!v || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onConfirm(v);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: durFast, ease: easeOut }}
            onClick={() => { if (!submitting) onCancel(); }}
          >
          <motion.div
            className="modal"
            initial={overlayPop.initial}
            animate={overlayPop.animate}
            exit={overlayPop.exit}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">{title}</div>
            <textarea
              ref={textareaRef}
              className="modal-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKey}
              placeholder="输入常用语…"
              rows={4}
            />
            <div className="modal-hint mono">Ctrl+Enter 确定 · Esc 取消</div>
            <div className="modal-actions">
              <motion.button
                className="modal-btn"
                whileTap={whileTap}
                onClick={onCancel}
                disabled={submitting}
              >
                取消
              </motion.button>
              <motion.button
                className="modal-btn primary"
                whileTap={whileTap}
                onClick={confirm}
                disabled={!value.trim() || submitting}
              >
                {submitting ? "…" : "确定"}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
