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
/// 用 textarea 支持多行/大段文本输入；Esc 关闭、Ctrl+Enter 提交。
export function PhraseEditModal({
  open,
  title,
  initialValue = "",
  onConfirm,
  onCancel,
}: PhraseEditModalProps) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 打开时重置为初始值并聚焦输入框（延迟一帧确保 DOM 已挂载）
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      const id = requestAnimationFrame(() => textareaRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open, initialValue]);

  // 弹窗打开时阻止 wheel 冒泡到面板（避免卡片滚动）。
  // keydown 不在这里拦截——改由 modal 容器在 bubble 阶段 stopPropagation，
  // 既阻止 App 全局 listener 收到方向键，又不影响 textarea 自己的 onKeyDown。
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
            // bubble 阶段拦截：textarea 处理完按键后，事件冒泡到这里被挡住，
            // 不再传到 window 上 App 的全局 keydown（否则方向键会滚动卡片）
            onKeyDown={(e) => e.stopPropagation()}
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
