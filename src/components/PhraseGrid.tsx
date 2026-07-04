import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import type { ClipItem } from "../lib/types";
import { springGrid, springSnap, easeOut } from "../lib/motion";

interface Props {
  items: ClipItem[];
  onReorder: (newItems: ClipItem[]) => void;
  onExit: () => void;
}

// 拖拽中的卡片用 drag + onDragEnd 计算落点，重排数组。
// 网格用固定 3 列，落点 = round(x/colW) + round(y/rowH)*cols。
export function PhraseGrid({ items, onReorder, onExit }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  function handleDragEnd(item: ClipItem, info: PanInfo) {
    const grid = gridRef.current;
    setDragId(null);
    if (!grid) return;
    const cols = 3;
    const cellW = grid.clientWidth / cols;
    const cellH = 92; // height + gap，与 CSS 对齐
    const fromIdx = items.findIndex((i) => i.id === item.id);
    if (fromIdx < 0) return;
    // 卡片中心当前在 grid 内的坐标
    const rect = grid.getBoundingClientRect();
    const cx = rect.left + (fromIdx % cols) * cellW + cellW / 2 + info.offset.x;
    const cy = rect.top + Math.floor(fromIdx / cols) * cellH + cellH / 2 + info.offset.y;
    let col = Math.floor((cx - rect.left) / cellW);
    let row = Math.floor((cy - rect.top) / cellH);
    col = Math.max(0, Math.min(cols - 1, col));
    row = Math.max(0, Math.min(Math.ceil(items.length / cols) - 1, row));
    const toIdx = Math.min(row * cols + col, items.length - 1);
    if (toIdx === fromIdx) return;
    const next = items.slice();
    const [m] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, m);
    onReorder(next);
  }

  return (
    <div className="phrase-grid-wrap">
      <div className="phrase-grid-header">
        <span className="phrase-grid-title">拖拽排序</span>
        <button className="phrase-grid-done" onClick={onExit} aria-label="完成">
          完成
        </button>
      </div>
      <div className="phrase-grid" ref={gridRef}>
        <AnimatePresence>
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              layout
              layoutId={`phrase-${item.id}`}
              className="phrase-grid-cell"
              // 炸开：从堆叠中心（缩小的卡片）飞散到各自的网格位
              initial={{ scale: 0.7, opacity: 0, x: 0, y: 0 }}
              animate={{
                scale: dragId === item.id ? 1.06 : 1,
                opacity: 1,
                x: 0,
                y: 0,
                zIndex: dragId === item.id ? 50 : 10,
                boxShadow:
                  dragId === item.id
                    ? "var(--shadow-lift)"
                    : "var(--shadow)",
              }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{
                layout: springGrid,
                // 错峰：越靠后延迟越多，模拟惯性依次落位
                delay: dragId ? 0 : Math.min(i * 0.035, 0.25),
                ...springSnap,
              }}
              drag
              dragSnapToOrigin
              dragElastic={0.4}
              dragTransition={{ bounceStiffness: springSnap.stiffness, bounceDamping: springSnap.damping }}
              onDragStart={() => setDragId(item.id)}
              onDragEnd={(_, info) => handleDragEnd(item, info)}
              whileHover={{ scale: dragId ? undefined : 1.02 }}
            >
              <span className="phrase-grid-text">{item.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// 保留类型导出供可能的外部使用
export type { RPointerEvent };
export { easeOut };
