import { useRef } from "react";
import { motion } from "framer-motion";
import type { ClipItem } from "../lib/types";
import { formatTime } from "../lib/format";

interface CardProps {
  item: ClipItem;
  index: number; // absolute index in the list (newest = 0)
  position: number; // 0 = front, 1/2 = peek
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onLongPress?: () => void;
}

// mechanical, card-catalog feel: stiff spring, low bounce
const POS = [
  { y: 0, scale: 1, opacity: 1, z: 30 },
  { y: -36, scale: 0.975, opacity: 1, z: 20 },
  { y: -52, scale: 0.95, opacity: 1, z: 10 },
];

export function Card({ item, index, position, onClick, onContextMenu, onLongPress }: CardProps) {
  const p = POS[position] ?? POS[2];
  const active = position === 0;
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
      data-active={active}
      style={{ zIndex: p.z }}
      initial={{ y: -44, scale: 0.9, opacity: 0 }}
      animate={{ y: p.y, scale: p.scale, opacity: p.opacity }}
      exit={{ y: 40, scale: 1, opacity: 0 }}
      transition={{ type: "spring", stiffness: 440, damping: 36, mass: 0.7 }}
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
