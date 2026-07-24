import { useCallback, useEffect, useRef, useState } from "react";
import lottie from "lottie-web";

const CONFETTI_URL = "../../assets/confetti.json";
const SUCCESS_URL = "/Success.json";
const SUCCESS_START_DELAY_MS = 1200;

async function loadAnimationData(url) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  return response.json();
}

/**
 * Full-screen booking success celebration:
 * 1) confetti plays once immediately
 * 2) after ~2.2s Success plays once
 * 3) translucent blur backdrop clears when the sequence finishes
 */
export function BookingSuccessOverlay({ open, onDone }) {
  const confettiRef = useRef(null);
  const successRef = useRef(null);
  const confettiAnimRef = useRef(null);
  const successAnimRef = useRef(null);
  const timersRef = useRef([]);
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

    (async () => {
      try {
        const [confettiData, successData] = await Promise.all([
          loadAnimationData(CONFETTI_URL),
          loadAnimationData(SUCCESS_URL),
        ]);
        if (cancelled || !confettiRef.current) return;

        setReady(true);
        setPhase("confetti");

        confettiAnimRef.current = lottie.loadAnimation({
          container: confettiRef.current,
          renderer: "svg",
          loop: false,
          autoplay: true,
          animationData: confettiData,
          rendererSettings: {
            preserveAspectRatio: "xMidYMid slice",
            progressiveLoad: true,
            title: "Celebration confetti",
          },
        });

        const startSuccess = () => {
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

        timersRef.current.push(window.setTimeout(startSuccess, SUCCESS_START_DELAY_MS));
        timersRef.current.push(window.setTimeout(finish, SUCCESS_START_DELAY_MS + 5200));
      } catch (_error) {
        if (!cancelled) finish();
      }
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
      <div className="booking-success-content">
        <div className="booking-success-stage" aria-hidden="true">
          <div ref={confettiRef} className="booking-success-confetti" />
          <div
            ref={successRef}
            className={`booking-success-check ${phase === "success" ? "is-visible" : ""}`}
          />
        </div>
        <p className="booking-success-message">Booking submitted successfully</p>
        <p className="booking-success-message" style={{ fontSize: "12px", color: "#0093FF", fontWeight: "bold" }}>We will contact you soon.</p>
      </div>
    </div>
  );
}
