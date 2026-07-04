import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import type { ClipItem } from "../lib/types";
import { Card } from "./Card";

interface FlowProps {
  items: ClipItem[];
  active: number;           // 当前选中卡片在 items 中的索引
  onSelect: (index: number) => void;   // 点击卡片时触发粘贴
  onHover?: (index: number) => void;   // 鼠标进入卡片时更新选中
  onItemContext?: (item: ClipItem, e: React.MouseEvent) => void;  // 右键菜单
  onItemLongPress?: (item: ClipItem) => void;  // 长按（600ms）触发右键菜单
  clearing?: boolean;       // 清空剪贴板：触发批量退场动画
  onExitComplete?: () => void;  // AnimatePresence 退场动画结束回调
}

/**
 * 卡片流容器 — 等宽等高卡片纵向排列，可滚动。
 * 与 CardStack 接口相近，便于上层按 displayMode 切换。
 *
 * 交互（hover-to-select 模式）：
 * - 滚轮 = 原生滚动列表（overflow-y: auto），不再拦截/去抖
 * - 鼠标 hover 卡片 = 即时选中（onHover 回调更新 active）
 * - 点击卡片 = 粘贴
 * - 键盘 ArrowUp/Down = 移动 active + scrollIntoView（可访问性，与堆叠模式一致）
 *
 * 性能：CSS content-visibility: auto 让视口外的卡片跳过渲染（见 panel.css），
 * 和堆叠模式「只渲染可见卡片」思路一致，500 条也无压力。
 */
export function CardFlow({ items, active, onSelect, onHover, onItemContext, onItemLongPress, clearing, onExitComplete }: FlowProps) {
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  // active 变化时滚动到对应卡片（smooth + nearest，已在视野内则不滚）。
  // hover 改变 active 时鼠标已在卡上，scrollIntoView 是 no-op；
  // 键盘改变 active 时把选中卡拉回视野。
  useEffect(() => {
    cellRefs.current[active]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [active]);

  return (
    <div className="card-flow">
      <AnimatePresence onExitComplete={onExitComplete}>
        {items.map((item, i) => (
          <div
            key={item.id}
            className="card-flow-cell"
            ref={(el) => { cellRefs.current[i] = el; }}
            onMouseEnter={() => onHover?.(i)}
          >
            <Card
              item={item}
              index={i}
              active={i === active}
              flat
              clearing={clearing}
              onClick={() => onSelect(i)}
              onContextMenu={onItemContext ? (e) => onItemContext(item, e) : undefined}
              onLongPress={onItemLongPress ? () => onItemLongPress(item) : undefined}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
