import { motion, AnimatePresence } from "framer-motion";
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
      <AnimatePresence>
        {items.length === 0 ? (
          <motion.li
            key="empty"
            className="search-empty"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: durFast, ease: easeOut }}
          >
            没有匹配的条目
          </motion.li>
        ) : (
          items.map((it, i) => (
            <motion.li
              key={it.id}
              className="search-row"
              variants={itemFadeUp}
              initial="hidden"
              animate="show"
              exit="exit"
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(it)}
            >
              <span className="card-serial mono">{String(i + 1).padStart(2, "0")}</span>
              <span className="search-text">{it.text}</span>
              <span className="search-time mono">{formatTime(it.time)}</span>
            </motion.li>
          ))
        )}
      </AnimatePresence>
    </motion.ul>
  );
}
