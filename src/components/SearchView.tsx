import { motion } from "framer-motion";
import type { ClipItem } from "../lib/types";
import { formatTime } from "../lib/format";
import { staggerChildren, itemFadeUp, easeOut, durFast } from "../lib/motion";

interface Props {
  items: ClipItem[];
  onSelect: (item: ClipItem) => void;
}

export function SearchView({ items, onSelect }: Props) {
  return (
    <motion.ul
      className="search-list"
      variants={staggerChildren()}
      initial="hidden"
      animate="show"
    >
      {items.length === 0 ? (
        <li className="search-empty">没有匹配的条目</li>
      ) : (
        items.map((it, i) => (
          <motion.li
            key={it.id}
            className="search-row"
            variants={itemFadeUp}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(it)}
          >
            <span className="card-serial mono">{String(i + 1).padStart(2, "0")}</span>
            <span className="search-text">{it.text}</span>
            <span className="search-time mono">{formatTime(it.time)}</span>
          </motion.li>
        ))
      )}
    </motion.ul>
  );
}

// 保留导出避免 unused warning
export { easeOut, durFast };
