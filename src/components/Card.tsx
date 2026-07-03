import { motion } from "framer-motion";
import type { ClipItem } from "../lib/types";
import { formatTime } from "../data/mock";

interface CardProps {
  item: ClipItem;
  index: number; // absolute index in the list (newest = 0)
  position: number; // 0 = front, 1/2 = peek
  onClick: () => void;
}

// mechanical, card-catalog feel: stiff spring, low bounce
const POS = [
  { y: 0, scale: 1, opacity: 1, z: 30 },
  { y: -36, scale: 0.975, opacity: 1, z: 20 },
  { y: -52, scale: 0.95, opacity: 1, z: 10 },
];

export function Card({ item, index, position, onClick }: CardProps) {
  const p = POS[position] ?? POS[2];
  const active = position === 0;
  const serial = String(index + 1).padStart(2, "0");

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
