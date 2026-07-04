import { useRef } from "react";
import { motion } from "framer-motion";
import type { ClipItem } from "../lib/types";
import { formatTime } from "../lib/format";
import { springCard, easeEnter, easeExit, easeOut, durFast } from "../lib/motion";

interface CardProps {
  item: ClipItem;
  index: number; // absolute index in the list (newest = 0)
  position?: number; // 堆叠模式：0 = front, 1/2 = peek
  active?: boolean;  // 是否选中（堆叠=最前卡；卡片流=当前焦点卡）
  flat?: boolean;    // 卡片流模式：平铺，无堆叠偏移
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onLongPress?: () => void;
}

// 堆叠位置：前卡正面，后卡向上偏移+缩小米窥。
// peek 卡加极轻微旋转（±1°），模拟桌上散落的纸条——
// 不是花哨的倾斜，而是肉眼几乎察觉不到的"不齐"。
const POS = [
  { y: 0, scale: 1, opacity: 1, z: 30, rotate: 0 },
  { y: -36, scale: 0.975, opacity: 1, z: 20, rotate: -1 },
  { y: -52, scale: 0.95, opacity: 1, z: 10, rotate: 0.8 },
];

export function Card({ item, index, position, active, flat, onClick, onContextMenu, onLongPress }: CardProps) {
  const p = POS[position ?? 0] ?? POS[2];
  const isActive = active ?? (!flat && position === 0);
  const serial = String(index + 1).padStart(2, "0");

  // 长按检测：按下后 600ms 内未移动超过 10px 则触发
  const pressTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  function clearPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  }

  function onPointerDown(e: React.PointerEvent) {
    pressStart.current = { x: e.clientX, y: e.clientY };
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      pressStart.current = null;
      onLongPress?.();
    }, 600);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    const dx = e.clientX - pressStart.current.x;
    const dy = e.clientY - pressStart.current.y;
    if (dx * dx + dy * dy > 100) clearPress();
  }

  return (
    <motion.div
      className="card"
      data-active={isActive}
      style={{ zIndex: flat ? undefined : p.z, transformOrigin: "50% 100%" }}
      initial={flat ? { opacity: 0, y: 8 } : { y: -44, scale: 0.9, opacity: 0, rotate: 0 }}
      animate={flat ? { opacity: 1, y: 0 } : { y: p.y, scale: p.scale, opacity: p.opacity, rotate: p.rotate }}
      exit={flat ? { opacity: 0, y: 16 } : { y: 40, scale: 1, opacity: 0, rotate: 0 }}
      transition={flat ? { duration: durFast, ease: easeOut } : springCard}
      whileTap={flat ? { scale: 0.98 } : isActive ? { scale: 0.97 } : undefined}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e);
      }}
      onPointerDown={onPointerDown}
      onPointerUp={clearPress}
      onPointerLeave={clearPress}
      onPointerMove={onPointerMove}
    >
      <div className="card-slip mono">
        <span className="card-serial">{serial}</span>
        <span className="card-dot">·</span>
        <span>{formatTime(item.time)}</span>
        {item.source ? (
          <>
            <span className="card-dot">·</span>
            <span className="card-src">{item.source}</span>
          </>
        ) : null}
      </div>
      <div className="card-body">
        {item.type === "image" ? (
          <img className="card-img" src={item.imageThumb} alt="" draggable={false} />
        ) : (
          <p className="card-text">{item.text}</p>
        )}
      </div>
    </motion.div>
  );
}

// 保留导出供外部类型推断
export { easeEnter, easeExit, durFast };
