import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { getOptimizedImageUrl } from "../../utils/media";

export function Lightbox({ items, index, onClose, onIndexChange }) {
  const open = index !== null;
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const imgWrapRef = useRef(null);

  const reset = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(+(z + 0.5).toFixed(2), 4)), []);
  const zoomOut = useCallback(
    () =>
      setZoom((z) => {
        const nz = Math.max(+(z - 0.5).toFixed(2), 1);
        if (nz === 1) setPan({ x: 0, y: 0 });
        return nz;
      }),
    [],
  );
  const rotate = useCallback(() => setRotation((r) => (r + 90) % 360), []);

  const next = useCallback(() => {
    if (index === null) return;
    onIndexChange((index + 1) % items.length);
    reset();
  }, [index, items.length, onIndexChange, reset]);

  const prev = useCallback(() => {
    if (index === null) return;
    onIndexChange((index - 1 + items.length) % items.length);
    reset();
  }, [index, items.length, onIndexChange, reset]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key.toLowerCase() === "r") rotate();
      else if (e.key === "0") reset();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, next, prev, onClose, reset, zoomIn, zoomOut, rotate]);

  // Native non-passive wheel listener so preventDefault works
  useEffect(() => {
    const el = imgWrapRef.current;
    if (!el || !open) return;
    const handler = (e) => {
      e.preventDefault();
      setZoom((z) => Math.max(1, Math.min(4, +(z + (e.deltaY < 0 ? 0.2 : -0.2)).toFixed(2))));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [open]);

  useEffect(() => reset(), [index, reset]);

  const current = index !== null ? items[index] : null;
  const imageWidth = typeof window === "undefined"
    ? 1600
    : Math.min(1920, Math.max(960, Math.ceil(window.innerWidth * Math.min(window.devicePixelRatio || 1, 2))));

  const onPointerDown = (e) => {
    if (zoom <= 1) return;
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    setPan((p) => ({
      x: p.x + (e.clientX - last.current.x),
      y: p.y + (e.clientY - last.current.y),
    }));
    last.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  const content = (
    <AnimatePresence>
      {open && current && (
        <motion.div
          key="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="lightbox-dialog fixed inset-0 z-[100] flex items-center justify-center"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={current.label}
        >
          <div
            className="lightbox-toolbar absolute inset-x-0 top-0 z-20 flex items-center justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lightbox-counter">
              {(index ?? 0) + 1} / {items.length} - {Math.round(zoom * 100)}%
            </div>
            <div className="lightbox-controls">
              <button
                type="button"
                aria-label="Previous"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="lightbox-control"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="lightbox-control"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="lightbox-control lightbox-close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            ref={imgWrapRef}
            className="lightbox-image-stage relative flex h-full w-full items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <AnimatePresence mode="wait">
              <motion.img
                key={current.src}
                src={getOptimizedImageUrl(current.src, { width: imageWidth })}
                alt={current.label}
                decoding="async"
                fetchpriority="high"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  cursor: zoom > 1 ? (dragging.current ? "grabbing" : "grab") : "zoom-in",
                  transition: dragging.current ? "none" : "transform 0.25s ease-out",
                  touchAction: "none",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setZoom((z) => (z === 1 ? 2 : 1));
                  if (zoom !== 1) setPan({ x: 0, y: 0 });
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="lightbox-image select-none"
                draggable={false}
              />
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
