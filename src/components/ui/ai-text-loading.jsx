import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import "./ai-text-loading.css";

// Adapted from Kokonut UI's AI Text Loading component (MIT).
export default function AITextLoading({ text }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="ai-text-loading" role="status">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {reduceMotion ? text : (
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={text}
              className="ai-text-loading-shimmer"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {text}
            </motion.span>
          </AnimatePresence>
        )}
      </span>
    </div>
  );
}
