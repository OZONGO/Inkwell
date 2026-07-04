import { motion } from "framer-motion";
import type { ClipItem } from "../lib/types";
import { formatTime } from "../lib/format";

interface Props {
  items: ClipItem[];
  onSelect: (item: ClipItem) => void;
}

export function SearchView({ items, onSelect }: Props) {
  return (
    <ul className="search-list">
      {items.length === 0 ? (
        <li className="search-empty">没有匹配的条目</li>
      ) : (
        items.map((it, i) => (
          <motion.li
            key={it.id}
            className="search-row"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.015 }}
            onClick={() => onSelect(it)}
          >
            <span className="card-serial mono">{String(i + 1).padStart(2, "0")}</span>
            <span className="search-text">{it.text}</span>
            <span className="search-time mono">{formatTime(it.time)}</span>
          </motion.li>
        ))
      )}
    </ul>
  );
}
