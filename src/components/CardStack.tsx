import { useRef } from "react";
import { AnimatePresence } from "framer-motion";
import type { ClipItem } from "../lib/types";
import { Card } from "./Card";

interface StackProps {
  items: ClipItem[];
  active: number;           // 当前选中卡片在 items 中的索引
  onSelect: (index: number) => void;   // 点击卡片时触发粘贴
  onNav: (delta: number) => void;      // 滚轮/方向键：+1 往后翻，-1 往前翻
  onItemContext?: (item: ClipItem, e: React.MouseEvent) => void;  // 右键菜单
  onItemLongPress?: (item: ClipItem) => void;  // 长按（600ms）触发右键菜单
}

/**
 * 堆叠卡片容器 — 从 items 中切片出当前可见的至多 3 张卡片，
 * 滚轮 110ms 去抖防止过度触发，配合 AnimatePresence 实现卡片进出动效。
 *
 * 可见切片逻辑：visible = items.slice(active, active + 3)
 * - active = 0：显示最新 3 张
 * - active = n：跳过前 n 张，显示后 3 张
 * - 不足 3 张时按实际数量渲染
 */
export function CardStack({ items, active, onSelect, onNav, onItemContext, onItemLongPress }: StackProps) {
  const visible = items.slice(active, active + 3);
  const lastWheel = useRef(0);  // 上次滚轮时间戳，用于 110ms 去抖
  return (
    <div
      className="stack"
      onWheel={(e) => {
        const now = Date.now();
        if (now - lastWheel.current < 110) return;  // 去抖：同方向连续滚动间隔至少 110ms
        lastWheel.current = now;
        onNav(e.deltaY > 0 ? 1 : -1);  // 向下滚 → 更旧（+1），向上滚 → 更新（-1）
      }}
    >
      <AnimatePresence initial={false}>
        {visible.map((item, i) => (
          <Card
            key={item.id}
            item={item}
            index={active + i}        // 全局序号（用于卡片左上角编号）
            position={i}               // 0=最前（全显），1/2=peek（偏移/缩小）
            onClick={() => onSelect(active + i)}
            onContextMenu={onItemContext ? (e) => onItemContext(item, e) : undefined}
            onLongPress={onItemLongPress ? () => onItemLongPress(item) : undefined}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
