import { useCallback, useEffect, useRef, useState } from "react";
import lottie from "lottie-web";

const CONFETTI_URLS = ["/confetti.json", "/Confetti.json"];
const SUCCESS_URLS = ["/Success.json", "/success.json"];
const SUCCESS_START_DELAY_MS = 1800;
const animationCache = new Map();

async function loadAnimationData(urls) {
  const list = Array.isArray(urls) ? urls : [urls];
  let lastError = null;

  for (const url of list) {
    if (animationCache.has(url)) return animationCache.get(url);

    try {
      const response = await fetch(url, {
        cache: "default",
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

function preferCanvasRenderer() {
  if (typeof navigator === "undefined") return true;
  const memory = Number(navigator.deviceMemory || 0);
  // Canvas is far cheaper than SVG for large confetti Lottie files.
  return memory === 0 || memory <= 8;
}

function spawnCssConfetti(container) {
  if (!container) return () => {};
  const colors = ["#22d3ee", "#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#fbbf24", "#f87171"];
  const nodes = [];
  const count = preferCanvasRenderer() ? 42 : 64;

  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("span");
    piece.className = "booking-css-confetti-piece";
    const left = Math.random() * 100;
    const delay = Math.random() * 0.45;
    const duration = 1.6 + Math.random() * 1.4;
    const size = 6 + Math.random() * 8;
    piece.style.left = `${left}%`;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * (0.55 + Math.random() * 0.7)}px`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${delay}s`;
    piece.style.animationDuration = `${duration}s`;
    piece.style.setProperty("--confetti-x", `${(Math.random() - 0.5) * 120}px`);
    piece.style.setProperty("--confetti-r", `${(Math.random() - 0.5) * 720}deg`);
    container.appendChild(piece);
    nodes.push(piece);
  }

  return () => {
    nodes.forEach((node) => node.remove());
  };
}

/**
 * Full-screen booking success celebration:
 * 1) confetti plays immediately (Lottie canvas, with CSS fallback)
 * 2) after ~1.8s Success check plays once
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
    doneRef.current = false;
    setPhase("loading");
    setReady(true);

    const startSuccess = async (successData) => {
      if (cancelled || !successRef.current || doneRef.current) return;
      setPhase("success");

      successAnimRef.current?.destroy();
      successAnimRef.current = lottie.loadAnimation({
        container: successRef.current,
        renderer: "svg",
        loop: false,
        autoplay: true,
        animationData: successData,
        rendererSettings: {
          preserveAspectRatio: "xMidYMid meet",
          progressiveLoad: true,
          title: "Booking success",
        },
      });

      successAnimRef.current.addEventListener("complete", () => {
        timersRef.current.push(window.setTimeout(finish, 350));
      });
    };

    const playConfetti = (confettiData) => {
      if (cancelled || !confettiRef.current) return false;
      try {
        confettiAnimRef.current = lottie.loadAnimation({
          container: confettiRef.current,
          renderer: preferCanvasRenderer() ? "canvas" : "svg",
          loop: false,
          autoplay: true,
          animationData: confettiData,
          rendererSettings: {
            preserveAspectRatio: "xMidYMid slice",
            clearCanvas: true,
            progressiveLoad: true,
            title: "Celebration confetti",
          },
        });
        setPhase("confetti");
        return true;
      } catch (_error) {
        return false;
      }
    };

    (async () => {
      // Load independently so success still shows if confetti fails in production.
      const [confettiResult, successResult] = await Promise.allSettled([
        loadAnimationData(CONFETTI_URLS),
        loadAnimationData(SUCCESS_URLS),
      ]);

      if (cancelled) return;

      let confettiPlaying = false;
      if (confettiResult.status === "fulfilled") {
        confettiPlaying = playConfetti(confettiResult.value);
      }

      if (!confettiPlaying && cssConfettiRef.current) {
        cleanupCssRef.current = spawnCssConfetti(cssConfettiRef.current);
        setPhase("confetti");
      }

      if (successResult.status === "fulfilled") {
        timersRef.current.push(
          window.setTimeout(() => {
            startSuccess(successResult.value);
          }, SUCCESS_START_DELAY_MS),
        );
        timersRef.current.push(window.setTimeout(finish, SUCCESS_START_DELAY_MS + 5200));
        return;
      }

      // No success Lottie — still celebrate briefly then close.
      timersRef.current.push(window.setTimeout(finish, 2800));
    })();

    return () => {
      cancelled = true;
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
