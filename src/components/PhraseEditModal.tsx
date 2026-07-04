import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { overlayPop, easeEnter, easeExit, easeOut, durFast, durSlow, whileTap } from "../lib/motion";

interface OriginRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PhraseEditModalProps {
  open: boolean;
  title: string;
  initialValue?: string;
  /// 触发按钮的位置（新建常用语时由 + 按钮传入）。
  /// 有值时弹窗从按钮位置扩展出来；为空时用居中 scale-in（编辑模式）。
  originRect?: OriginRect | null;
  onConfirm: (text: string) => void | Promise<void>;
  onCancel: () => void;
}

/// 常用语新建/编辑模态弹窗——替代 window.prompt，匹配墨与纸视觉语言。
/// 渲染在 WebView 内部，不触发面板 blur（避免面板自动隐藏）。
/// 用 textarea 支持多行/大段文本输入；Esc 关闭、Ctrl+Enter 提交。
///
/// 进场动画两种模式：
/// - 新建（originRect 有值）：真 morph——弹窗由按钮"长成"。壳子 initial 用按钮
///   尺寸（scale 28/300）、按钮圆角（8px）、按钮位置（offset），animate 到全尺寸、
///   弹窗圆角（12px）、居中。easeEnter 略带过冲呼应"生长"。内容延迟 140ms 淡入，
///   待壳子接近全尺寸再显现，避免小尺寸时内容挤成一团。
/// - 编辑（originRect 为空）：复用 overlayPop（居中 scale + y 抬升）。
export function PhraseEditModal({
  open,
  title,
  initialValue = "",
  originRect,
  onConfirm,
  onCancel,
}: PhraseEditModalProps) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // ref 镜像 submitting，避免 handleKey 闭包读到旧值导致重复提交
  const submittingRef = useRef(false);

  // 缓存按钮中心相对弹窗中心的偏移。退出动画时 originRect prop 已被清空
  // （phraseModal=null），用 ref 兜底让退出也回到按钮位置。
  // open=true 且无 originRect（编辑模式）时清空，回退到 overlayPop。
  const originOffsetRef = useRef<{ x: number; y: number } | null>(null);
  if (open && originRect) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const bx = originRect.left + originRect.width / 2;
    const by = originRect.top + originRect.height / 2;
    originOffsetRef.current = { x: bx - cx, y: by - cy };
  } else if (open && !originRect) {
    originOffsetRef.current = null;
  }

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

  // 进/退场变体
  // 新建模式（有 originRect）：真 morph——壳子从按钮尺寸/圆角/位置生长到弹窗尺寸/圆角/居中。
  //   scale 28/300 让初始尺寸匹配 + 按钮（28px → 弹窗 300px）；borderRadius 8→12
  //   是 icon-btn 圆角到 modal 圆角；x/y 偏移让壳子中心落在按钮中心。
  //   opacity 用 durFast 快速显形（壳子先"出现"再生长），scale/位置/圆角用 durSlow
  //   配 easeEnter 略带过冲，呼应"生长"的视觉语言。内容延迟 140ms 淡入。
  // 编辑模式（无 originRect）：复用 overlayPop（居中 scale + y 抬升）。
  const offset = originOffsetRef.current;
  const isMorph = !!offset;
  const enterScale = isMorph ? 28 / 300 : 0.92;
  const enterX = isMorph ? offset!.x : 0;
  const enterY = isMorph ? offset!.y : 8;
  const enterRadius = isMorph ? 8 : 12;

  const shellInitial = isMorph
    ? { opacity: 0, scale: enterScale, x: enterX, y: enterY, borderRadius: enterRadius }
    : { opacity: 0, scale: enterScale, x: enterX, y: enterY };
  const shellAnimate = isMorph
    ? {
        opacity: 1,
        scale: 1,
        x: 0,
        y: 0,
        borderRadius: 12,
        transition: {
          opacity: { duration: durFast, ease: easeOut },
          default: { duration: durSlow, ease: easeEnter },
        },
      }
    : {
        opacity: 1,
        scale: 1,
        x: 0,
        y: 0,
        transition: overlayPop.animate.transition,
      };
  const shellExit = isMorph
    ? {
        opacity: 0,
        scale: enterScale,
        x: enterX,
        y: enterY,
        borderRadius: enterRadius,
        transition: { duration: durSlow, ease: easeExit },
      }
    : {
        opacity: 0,
        scale: enterScale,
        x: enterX,
        y: enterY,
        transition: overlayPop.exit.transition,
      };

  // 内容延迟入场：壳子先扩展到接近全尺寸，内容再淡入（避免小尺寸时内容挤成一团）。
  // 退出时内容立即淡出（无延迟），壳子继续缩回按钮尺寸——形成"内容消散 → 壳子收回"的层次。
  const contentEnter = isMorph
    ? { opacity: 1, transition: { delay: 0.14, duration: durFast, ease: easeOut } }
    : { opacity: 1, transition: { duration: durFast, ease: easeOut } };

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
            initial={shellInitial}
            animate={shellAnimate}
            exit={shellExit}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={contentEnter}
              exit={{ opacity: 0, transition: { duration: durFast, ease: easeOut } }}
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
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
