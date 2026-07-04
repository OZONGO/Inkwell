import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import type { ClipItem } from "../lib/types";
import { Card } from "./Card";

interface FlowProps {
  items: ClipItem[];
  active: number;           // 当前选中卡片在 items 中的索引
  onSelect: (index: number) => void;   // 点击卡片时触发粘贴
  onNav: (delta: number) => void;      // 滚轮：+1 往后翻，-1 往前翻
  onItemContext?: (item: ClipItem, e: React.MouseEvent) => void;  // 右键菜单
  onItemLongPress?: (item: ClipItem) => void;  // 长按（600ms）触发右键菜单
}

/**
 * 卡片流容器 — 等宽等高卡片纵向排列，可滚动。
 * 与 CardStack 接口一致，便于上层按 displayMode 切换。
 *
 * 交互（一致型，和堆叠模式同语义）：
 * - 滚轮 110ms 去抖 → onNav(±1) 移动 active（preventDefault 阻止原生滚动，
 *   让滚动完全由 active 驱动的 scrollIntoView 控制，避免两者冲突）
 * - active 卡片自动 scrollIntoView（smooth, nearest，已在视野内则不动）
 * - 点击卡片 = 粘贴
 *
 * 性能：CSS content-visibility: auto 让视口外的卡片跳过渲染（见 panel.css），
 * 和堆叠模式「只渲染可见卡片」思路一致，500 条也无压力。
 */
export function CardFlow({ items, active, onSelect, onNav, onItemContext, onItemLongPress }: FlowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastWheel = useRef(0);
  // onNav 每次渲染都是新闭包（依赖上层 active），用 ref 存避免 wheel listener 反复重注册
  const onNavRef = useRef(onNav);
  onNavRef.current = onNav;

  // 注册原生 wheel 事件：passive: false 才能 preventDefault 阻止原生滚动
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheel.current < 110) return;  // 去抖：同方向连续滚动间隔至少 110ms
      lastWheel.current = now;
      onNavRef.current(e.deltaY > 0 ? 1 : -1);  // 向下滚 → 更旧（+1），向上滚 → 更新（-1）
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // active 变化时滚动到对应卡片（smooth + nearest，已在视野内则不滚）
  useEffect(() => {
    cellRefs.current[active]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [active]);

  return (
    <div className="card-flow" ref={scrollRef}>
      <AnimatePresence initial={false}>
        {items.map((item, i) => (
          <div
            key={item.id}
            className="card-flow-cell"
            ref={(el) => { cellRefs.current[i] = el; }}
          >
            <Card
              item={item}
              index={i}
              active={i === active}
              flat
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
