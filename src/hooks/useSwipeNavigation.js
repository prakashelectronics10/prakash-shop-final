import { useCallback, useRef } from "react";

/**
 * Pointer-based horizontal swipe for fade/index sliders.
 * Ignores mostly-vertical gestures so page scroll still works.
 */
export function useSwipeNavigation({
  enabled = true,
  onSwipeLeft,
  onSwipeRight,
  threshold = 48,
  debounceMs = 300,
} = {}) {
  const startRef = useRef(null);
  const lastGestureAtRef = useRef(0);

  const onPointerDown = useCallback(
    (event) => {
      if (!enabled) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      startRef.current = { x: event.clientX, y: event.clientY };
    },
    [enabled],
  );

  const finish = useCallback(
    (event) => {
      const start = startRef.current;
      startRef.current = null;
      if (!enabled || !start) return;

      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY)) return;

      const now = Date.now();
      if (now - lastGestureAtRef.current < debounceMs) return;
      lastGestureAtRef.current = now;

      if (deltaX < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
    [debounceMs, enabled, onSwipeLeft, onSwipeRight, threshold],
  );

  const onPointerUp = finish;
  const onPointerCancel = useCallback(() => {
    startRef.current = null;
  }, []);

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    style: { touchAction: "pan-y", userSelect: "none" },
  };
}
