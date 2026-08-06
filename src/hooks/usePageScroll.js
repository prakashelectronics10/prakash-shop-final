import { useEffect, useRef } from "react";

const listeners = new Set();
let attached = false;
let raf = 0;
let lastSnapshot = { scrollY: 0, progress: 0 };

function computeSnapshot() {
  const scrollY = window.scrollY || 0;
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  return {
    scrollY,
    progress: Math.min(1, Math.max(0, scrollY / max)),
  };
}

function notify() {
  raf = 0;
  lastSnapshot = computeSnapshot();
  listeners.forEach((listener) => {
    try {
      listener(lastSnapshot);
    } catch (_error) {
      // Keep other listeners alive if one throws.
    }
  });
}

function onScroll() {
  if (raf) return;
  raf = window.requestAnimationFrame(notify);
}

function ensureAttached() {
  if (attached || typeof window === "undefined") return;
  attached = true;
  lastSnapshot = computeSnapshot();
  window.addEventListener("scroll", onScroll, { passive: true });
}

function maybeDetach() {
  if (!attached || listeners.size) return;
  window.removeEventListener("scroll", onScroll);
  if (raf) window.cancelAnimationFrame(raf);
  raf = 0;
  attached = false;
}

/**
 * Single shared passive scroll + rAF pipeline for homepage chrome.
 * Prefer updating refs/DOM in the callback; call setState only when values change.
 */
export function usePageScroll(onScrollFrame, { immediate = true } = {}) {
  const callbackRef = useRef(onScrollFrame);
  callbackRef.current = onScrollFrame;

  useEffect(() => {
    const listener = (snapshot) => callbackRef.current?.(snapshot);
    ensureAttached();
    listeners.add(listener);
    if (immediate) listener(lastSnapshot);
    return () => {
      listeners.delete(listener);
      maybeDetach();
    };
  }, [immediate]);
}

export function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
