import { Reorder } from "framer-motion";
import type { ClipItem } from "../lib/types";

interface Props {
  items: ClipItem[];
  onReorder: (newItems: ClipItem[]) => void;
  onExit: () => void;
}

// 3 列网格拖拽排序：Reorder.Group(axis="y") + CSS grid，
// 拖动时 Framer Motion 按 y 坐标重排 DOM，grid 自动重排单元格，
// layout 动画给出"磁力让位"效果。
export function PhraseGrid({ items, onReorder, onExit }: Props) {
  return (
    <div className="phrase-grid-wrap">
      <div className="phrase-grid-header">
        <span className="phrase-grid-title">拖拽排序</span>
        <button className="phrase-grid-done" onClick={onExit} aria-label="完成">
          完成
        </button>
      </div>
      <Reorder.Group
        axis="y"
        values={items}
        onReorder={onReorder}
        className="phrase-grid"
      >
        {items.map((item) => (
          <Reorder.Item
            key={item.id}
            value={item}
            className="phrase-grid-cell"
            whileDrag={{ scale: 1.04, boxShadow: "var(--shadow-lift)" }}
          >
            <span className="phrase-grid-text">{item.text}</span>
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  );
}
