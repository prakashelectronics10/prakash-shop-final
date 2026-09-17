import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { getOptimizedImageUrl } from "../../utils/media";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function pointerDistance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pointerMidpoint(first, second) {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

export function Lightbox({ items, index, onClose, onIndexChange }) {
  const open = index !== null;
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const stageRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const suppressClickRef = useRef(false);

  const clampPan = useCallback((value, atZoom = zoomRef.current) => {
    const stage = stageRef.current;
    if (!stage || atZoom <= MIN_ZOOM) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    const maxX = (rect.width * (atZoom - 1)) / 2;
    const maxY = (rect.height * (atZoom - 1)) / 2;
    return {
      x: clamp(value.x, -maxX, maxX),
      y: clamp(value.y, -maxY, maxY),
    };
  }, []);

  const setTransform = useCallback((nextZoom, nextPan) => {
    const safeZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const safePan = clampPan(nextPan, safeZoom);
    zoomRef.current = safeZoom;
    panRef.current = safePan;
    setZoom(safeZoom);
    setPan(safePan);
  }, [clampPan]);

  const reset = useCallback(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    pointersRef.current.clear();
    gestureRef.current = null;
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setSwipeOffset(0);
    setInteracting(false);
  }, []);

  const zoomAtPoint = useCallback((requestedZoom, clientX, clientY) => {
    const stage = stageRef.current;
    if (!stage) return;
    const previousZoom = zoomRef.current;
    const nextZoom = clamp(requestedZoom, MIN_ZOOM, MAX_ZOOM);
    if (nextZoom === MIN_ZOOM) {
      setTransform(MIN_ZOOM, { x: 0, y: 0 });
      return;
    }
    const rect = stage.getBoundingClientRect();
    const focalX = clientX - (rect.left + rect.width / 2);
    const focalY = clientY - (rect.top + rect.height / 2);
    const ratio = nextZoom / previousZoom;
    const currentPan = panRef.current;
    setTransform(nextZoom, {
      x: focalX - (focalX - currentPan.x) * ratio,
      y: focalY - (focalY - currentPan.y) * ratio,
    });
  }, [setTransform]);

  const changeIndex = useCallback((nextIndex) => {
    if (!items.length) return;
    onIndexChange((nextIndex + items.length) % items.length);
    reset();
  }, [items.length, onIndexChange, reset]);

  const next = useCallback(() => {
    if (index === null) return;
    changeIndex(index + 1);
  }, [changeIndex, index]);

  const prev = useCallback(() => {
    if (index === null) return;
    changeIndex(index - 1);
  }, [changeIndex, index]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") prev();
      else if (event.key === "+" || event.key === "=") {
        const rect = stageRef.current?.getBoundingClientRect();
        if (rect) zoomAtPoint(zoomRef.current + 0.5, rect.left + rect.width / 2, rect.top + rect.height / 2);
      } else if (event.key === "-") {
        const rect = stageRef.current?.getBoundingClientRect();
        if (rect) zoomAtPoint(zoomRef.current - 0.5, rect.left + rect.width / 2, rect.top + rect.height / 2);
      } else if (event.key.toLowerCase() === "r") setRotation((current) => (current + 90) % 360);
      else if (event.key === "0") reset();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [next, onClose, open, prev, reset, zoomAtPoint]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !open) return undefined;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const zoomFactor = Math.exp(-event.deltaY * 0.0025);
      zoomAtPoint(zoomRef.current * zoomFactor, event.clientX, event.clientY);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [open, zoomAtPoint]);

  useEffect(() => reset(), [index, reset]);

  const beginPinch = () => {
    const [first, second] = [...pointersRef.current.values()];
    if (!first || !second) return;
    gestureRef.current = {
      type: "pinch",
      startDistance: Math.max(1, pointerDistance(first, second)),
      startMidpoint: pointerMidpoint(first, second),
      startZoom: zoomRef.current,
      startPan: panRef.current,
    };
    suppressClickRef.current = true;
    setSwipeOffset(0);
    setInteracting(true);
  };

  const onPointerDown = (event) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    suppressClickRef.current = false;
    if (pointersRef.current.size >= 2) {
      beginPinch();
      return;
    }
    gestureRef.current = {
      type: zoomRef.current > MIN_ZOOM ? "pan" : "swipe",
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: performance.now(),
    };
    setInteracting(true);
  };

  const onPointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2) {
      if (gestureRef.current?.type !== "pinch") beginPinch();
      const gesture = gestureRef.current;
      const [first, second] = [...pointersRef.current.values()];
      if (!gesture || !first || !second) return;
      const currentMidpoint = pointerMidpoint(first, second);
      const nextZoom = clamp(
        gesture.startZoom * (pointerDistance(first, second) / gesture.startDistance),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const ratio = nextZoom / gesture.startZoom;
      setTransform(nextZoom, {
        x: currentMidpoint.x - centerX - (gesture.startMidpoint.x - centerX - gesture.startPan.x) * ratio,
        y: currentMidpoint.y - centerY - (gesture.startMidpoint.y - centerY - gesture.startPan.y) * ratio,
      });
      return;
    }

    const gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.type === "pan") {
      const nextPan = {
        x: panRef.current.x + (event.clientX - gesture.lastX),
        y: panRef.current.y + (event.clientY - gesture.lastY),
      };
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      setTransform(zoomRef.current, nextPan);
      suppressClickRef.current = true;
      return;
    }
    if (gesture.type === "swipe") {
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (Math.abs(deltaX) > 5 && Math.abs(deltaX) > Math.abs(deltaY)) {
        setSwipeOffset(deltaX);
        suppressClickRef.current = true;
      }
    }
  };

  const finishPointer = (event, cancelled = false) => {
    pointersRef.current.delete(event.pointerId);
    const gesture = gestureRef.current;

    if (gesture?.type === "pinch") {
      if (zoomRef.current <= 1.02) setTransform(1, { x: 0, y: 0 });
      if (pointersRef.current.size === 1 && zoomRef.current > 1) {
        const remaining = [...pointersRef.current.values()][0];
        gestureRef.current = { type: "pan", lastX: remaining.x, lastY: remaining.y };
      } else {
        gestureRef.current = null;
        setInteracting(false);
      }
      return;
    }

    if (!cancelled && gesture?.type === "swipe" && items.length > 1) {
      const deltaX = event.clientX - gesture.startX;
      const elapsed = Math.max(1, performance.now() - gesture.startedAt);
      const velocity = Math.abs(deltaX) / elapsed;
      const stageWidth = stageRef.current?.clientWidth || 320;
      const threshold = Math.min(80, stageWidth * 0.16);
      if (Math.abs(deltaX) >= threshold || (Math.abs(deltaX) > 24 && velocity > 0.45)) {
        if (deltaX < 0) next();
        else prev();
      }
    }

    gestureRef.current = null;
    setSwipeOffset(0);
    setInteracting(false);
  };

  const onStageClick = (event) => {
    event.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (zoomRef.current > 1) setTransform(1, { x: 0, y: 0 });
    else zoomAtPoint(2, event.clientX, event.clientY);
  };

  const current = index !== null ? items[index] : null;
  const safeIndex = index ?? 0;
  const imageWidth = typeof window === "undefined"
    ? 1600
    : Math.min(2048, Math.max(1200, Math.ceil(window.innerWidth * Math.min(window.devicePixelRatio || 1, 2))));

  const content = (
    <AnimatePresence>
      {open && current && (
        <motion.div
          key="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="lightbox-dialog fixed inset-0 z-[100] flex items-center justify-center"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={current.label}
        >
          <div className="lightbox-toolbar absolute inset-x-0 top-0 z-20 flex items-center justify-between" onClick={(event) => event.stopPropagation()}>
            <div className="lightbox-counter">{safeIndex + 1} / {items.length} - {Math.round(zoom * 100)}%</div>
            <p className="lightbox-zoom-hint">Hold Ctrl and scroll over the image to zoom at your pointer</p>
            <div className="lightbox-controls">
              <button type="button" aria-label="Previous" onClick={(event) => { event.stopPropagation(); prev(); }} className="lightbox-control">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button type="button" aria-label="Next" onClick={(event) => { event.stopPropagation(); next(); }} className="lightbox-control">
                <ChevronRight className="h-6 w-6" />
              </button>
              <button type="button" aria-label="Close" onClick={onClose} className="lightbox-control lightbox-close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            ref={stageRef}
            className={`lightbox-image-stage relative h-full w-full overflow-hidden ${zoom > 1 ? "is-zoomed" : ""}`}
            onClick={onStageClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => finishPointer(event)}
            onPointerCancel={(event) => finishPointer(event, true)}
          >
            <div
              className="lightbox-slide-track"
              style={{
                transform: `translate3d(calc(${-safeIndex * 100}% + ${swipeOffset}px), 0, 0)`,
                transition: interacting ? "none" : "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {items.map((item, itemIndex) => (
                <div className="lightbox-slide" aria-hidden={itemIndex !== safeIndex} key={item.src}>
                  <motion.img
                    src={getOptimizedImageUrl(item.src, { width: imageWidth })}
                    alt={item.label}
                    loading="eager"
                    decoding="async"
                    fetchpriority={itemIndex === safeIndex ? "high" : "auto"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    style={itemIndex === safeIndex ? {
                      transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom}) rotate(${rotation}deg)`,
                      cursor: zoom > 1 ? (interacting ? "grabbing" : "grab") : "zoom-in",
                      transition: interacting ? "none" : "transform 180ms ease-out",
                    } : undefined}
                    className="lightbox-image select-none"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
