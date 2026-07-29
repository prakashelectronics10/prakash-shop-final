import { useCallback, useEffect, useRef, useState } from "react";
import { loadLottie } from "./LottieSvgAnimation";

const CONFETTI_URLS = ["/confetti.json", "/Confetti.json"];
const SUCCESS_URLS = ["/Success.json", "/success.json"];
/** Let confetti start first so phones actually see the celebration. */
const SUCCESS_START_DELAY_MS = 100;
const CONFETTI_MIN_VISIBLE_MS = 200;
const animationCache = new Map();

async function loadAnimationData(urls) {
  const list = Array.isArray(urls) ? urls : [urls];
  let lastError = null;

  for (const url of list) {
    if (animationCache.has(url)) return animationCache.get(url);

    try {
      const response = await fetch(url, {
        cache: "force-cache",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        lastError = new Error(`Unable to load ${url} (${response.status})`);
        continue;
      }

      const contentType = String(response.headers.get("content-type") || "");
      // SPA fallback sometimes returns HTML for missing assets — reject it.
      if (contentType.includes("text/html")) {
        lastError = new Error(`Invalid content type for ${url}`);
        continue;
      }

      const data = await response.json();
      if (!data || typeof data !== "object") {
        lastError = new Error(`Invalid animation JSON for ${url}`);
        continue;
      }

      animationCache.set(url, data);
      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to load animation");
}

function cloneAnimationData(data) {
  if (!data) return data;
  try {
    return typeof structuredClone === "function"
      ? structuredClone(data)
      : JSON.parse(JSON.stringify(data));
  } catch (_error) {
    return JSON.parse(JSON.stringify(data));
  }
}

function isTouchPreferringDevice() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none), (pointer: coarse), (max-width: 760px)").matches;
}

function waitForPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

async function waitForSizedContainer(element, attempts = 12) {
  for (let i = 0; i < attempts; i += 1) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width >= 32 && rect.height >= 32) return true;
    await waitForPaint();
  }
  return Boolean(element);
}

function spawnCssConfetti(container, { dense = false } = {}) {
  if (!container) return () => {};
  const colors = ["#22d3ee", "#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#fbbf24", "#f87171", "#fb923c"];
  const nodes = [];
  const count = dense ? 72 : 48;

  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("span");
    piece.className = "booking-css-confetti-piece";
    const left = Math.random() * 100;
    const delay = Math.random() * 0.55;
    const duration = 1.7 + Math.random() * 1.6;
    const size = 6 + Math.random() * 9;
    piece.style.left = `${left}%`;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * (0.55 + Math.random() * 0.7)}px`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${delay}s`;
    piece.style.animationDuration = `${duration}s`;
    piece.style.setProperty("--confetti-x", `${(Math.random() - 0.5) * 160}px`);
    piece.style.setProperty("--confetti-r", `${(Math.random() - 0.5) * 820}deg`);
    container.appendChild(piece);
    nodes.push(piece);
  }

  return () => {
    nodes.forEach((node) => node.remove());
  };
}

/**
 * Full-screen booking success celebration:
 * 1) confetti plays immediately (Lottie SVG like desktop, CSS backup on phones)
 * 2) after a short delay Success check plays once
 * 3) translucent blur backdrop clears when the sequence finishes
 */
export function BookingSuccessOverlay({ open, onDone }) {
  const confettiRef = useRef(null);
  const successRef = useRef(null);
  const cssConfettiRef = useRef(null);
  const confettiAnimRef = useRef(null);
  const successAnimRef = useRef(null);
  const timersRef = useRef([]);
  const cleanupCssRef = useRef(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const [phase, setPhase] = useState("idle");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const destroyAnimations = useCallback(() => {
    confettiAnimRef.current?.destroy();
    successAnimRef.current?.destroy();
    confettiAnimRef.current = null;
    successAnimRef.current = null;
    cleanupCssRef.current?.();
    cleanupCssRef.current = null;
    if (confettiRef.current) confettiRef.current.innerHTML = "";
    if (successRef.current) successRef.current.innerHTML = "";
  }, []);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimers();
    destroyAnimations();
    setPhase("idle");
    setReady(false);
    onDoneRef.current?.();
  }, [clearTimers, destroyAnimations]);

  useEffect(() => {
    if (!open) {
      doneRef.current = false;
      clearTimers();
      destroyAnimations();
      setPhase("idle");
      setReady(false);
      document.body.style.removeProperty("overflow");
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let cancelled = false;
    let confettiStartedAt = 0;
    doneRef.current = false;
    setPhase("loading");
    setReady(true);

    const scheduleFinish = (delayMs) => {
      const elapsed = confettiStartedAt ? Date.now() - confettiStartedAt : 0;
      const wait = Math.max(delayMs, CONFETTI_MIN_VISIBLE_MS - elapsed, 400);
      timersRef.current.push(window.setTimeout(finish, wait));
    };

    const startSuccess = async (successData) => {
      if (cancelled || !successRef.current || doneRef.current) return;
      await waitForSizedContainer(successRef.current);
      if (cancelled || !successRef.current || doneRef.current) return;

      const lottie = await loadLottie();
      if (cancelled || !successRef.current || doneRef.current) return;

      setPhase("success");
      successAnimRef.current?.destroy();
      successAnimRef.current = lottie.loadAnimation({
        container: successRef.current,
        renderer: "svg",
        loop: false,
        autoplay: true,
        animationData: cloneAnimationData(successData),
        rendererSettings: {
          preserveAspectRatio: "xMidYMid meet",
          progressiveLoad: true,
          title: "Booking success",
        },
      });

      successAnimRef.current.addEventListener("DOMLoaded", () => {
        successAnimRef.current?.resize();
      });

      successAnimRef.current.addEventListener("complete", () => {
        scheduleFinish(380);
      });
    };

    const playConfettiWithRenderer = async (confettiData, renderer) => {
      if (cancelled || !confettiRef.current) return null;
      confettiRef.current.innerHTML = "";

      const lottie = await loadLottie();
      if (cancelled || !confettiRef.current) return null;

      const animation = lottie.loadAnimation({
        container: confettiRef.current,
        renderer,
        loop: false,
        autoplay: true,
        animationData: cloneAnimationData(confettiData),
        rendererSettings: {
          preserveAspectRatio: "xMidYMid slice",
          clearCanvas: true,
          progressiveLoad: false,
          hideOnTransparent: true,
          // Cap DPR so tall confetti canvas does not blank out on retina phones.
          dpr: Math.min(window.devicePixelRatio || 1, 2),
          title: "Celebration confetti",
        },
      });

      animation.addEventListener("DOMLoaded", () => {
        animation.resize();
      });

      return animation;
    };

    const playConfetti = async (confettiData) => {
      if (cancelled || !confettiRef.current) return false;
      await waitForSizedContainer(confettiRef.current);
      if (cancelled || !confettiRef.current) return false;

      // SVG matches the working desktop path; canvas is only a fallback.
      const renderers = ["svg", "canvas"];
      for (const renderer of renderers) {
        try {
          const animation = await playConfettiWithRenderer(confettiData, renderer);
          if (!animation) continue;
          confettiAnimRef.current = animation;
          confettiStartedAt = Date.now();
          setPhase("confetti");
          // Force a layout pass — critical on iOS/Android WebViews.
          window.requestAnimationFrame(() => animation.resize());
          return true;
        } catch (_error) {
          confettiAnimRef.current?.destroy();
          confettiAnimRef.current = null;
          if (confettiRef.current) confettiRef.current.innerHTML = "";
        }
      }
      return false;
    };

    const startCssConfetti = (dense = false) => {
      cleanupCssRef.current?.();
      if (!cssConfettiRef.current) return;
      cleanupCssRef.current = spawnCssConfetti(cssConfettiRef.current, { dense });
      if (!confettiStartedAt) confettiStartedAt = Date.now();
      setPhase((current) => (current === "success" ? current : "confetti"));
    };

    const onResize = () => {
      confettiAnimRef.current?.resize();
      successAnimRef.current?.resize();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    (async () => {
      // Phones: skip 1MB+ confetti.json — CSS confetti looks good and saves a large download.
      const useCssConfettiOnly = isTouchPreferringDevice();
      if (useCssConfettiOnly) {
        startCssConfetti(true);
      }

      const [confettiResult, successResult] = await Promise.allSettled([
        useCssConfettiOnly ? Promise.resolve(null) : loadAnimationData(CONFETTI_URLS),
        loadAnimationData(SUCCESS_URLS),
      ]);

      if (cancelled) return;

      let confettiPlaying = false;
      if (!useCssConfettiOnly && confettiResult.status === "fulfilled" && confettiResult.value) {
        confettiPlaying = await playConfetti(confettiResult.value);
      }

      if (!confettiPlaying && !useCssConfettiOnly) {
        startCssConfetti(true);
      }

      if (successResult.status === "fulfilled") {
        timersRef.current.push(
          window.setTimeout(() => {
            startSuccess(successResult.value);
          }, SUCCESS_START_DELAY_MS),
        );
        timersRef.current.push(window.setTimeout(() => scheduleFinish(0), SUCCESS_START_DELAY_MS + 5600));
        return;
      }

      timersRef.current.push(window.setTimeout(() => scheduleFinish(0), 3000));
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      clearTimers();
      destroyAnimations();
      document.body.style.overflow = previousOverflow;
    };
  }, [open, clearTimers, destroyAnimations, finish]);

  if (!open) return null;

  return (
    <div
      className={`booking-success-overlay ${ready ? "is-ready" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Booking submitted successfully"
    >
      <div className="booking-success-backdrop" aria-hidden="true" />
      <div ref={cssConfettiRef} className="booking-css-confetti" aria-hidden="true" />
      <div ref={confettiRef} className="booking-success-confetti" aria-hidden="true" />
      <div className="booking-success-content">
        <div className="booking-success-stage" aria-hidden="true">
          <div
            ref={successRef}
            className={`booking-success-check ${phase === "success" ? "is-visible" : ""}`}
          />
        </div>
        <p className="booking-success-message">Booking submitted successfully</p>
        <p className="booking-success-submessage">We will contact you soon.</p>
      </div>
    </div>
  );
}
