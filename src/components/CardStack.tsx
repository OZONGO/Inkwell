import { useRef } from "react";
import { AnimatePresence } from "framer-motion";
import type { ClipItem } from "../lib/types";
import { Card } from "./Card";

interface StackProps {
  items: ClipItem[];
  active: number;
  onSelect: (index: number) => void;
  onNav: (delta: number) => void;
}

export function CardStack({ items, active, onSelect, onNav }: StackProps) {
  const visible = items.slice(active, active + 3);
  const lastWheel = useRef(0);
  return (
    <div
      className="stack"
      onWheel={(e) => {
        const now = Date.now();
        if (now - lastWheel.current < 110) return;
        lastWheel.current = now;
        onNav(e.deltaY > 0 ? 1 : -1);
      }}
    >
      <AnimatePresence initial={false}>
        {visible.map((item, i) => (
          <Card
            key={item.id}
            item={item}
            index={active + i}
            position={i}
            onClick={() => onSelect(active + i)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
