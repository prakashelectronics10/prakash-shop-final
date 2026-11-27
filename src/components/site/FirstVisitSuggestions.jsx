import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "lucide-react";
import { DEFAULT_PUBLIC_CONTACT } from "../../utils/contactDefaults";
import { PULSE_AI_GREETING_PATH } from "../../utils/pulseAISearchPrompt";
import whatsappBadge from "../../assets/whatsapp-suggestion-badge.png";
import { PulseOrbAnimation } from "./PulseOrbAnimation";
import "./FirstVisitSuggestions.css";

const VISIT_KEY = "prakash:first-visit-suggestions:v1";
const PULSE_DELAY = 20_000;
const WHATSAPP_DELAY = 8_000;

function getVisitStart() {
  const now = Date.now();
  const startedAt = Number(window.sessionStorage.getItem(VISIT_KEY));
  if (startedAt > 0 && startedAt <= now) return startedAt;
  window.sessionStorage.setItem(VISIT_KEY, String(now));
  return now;
}

function pageHasActiveInteraction() {
  return document.querySelector('dialog[open]:not(.first-visit-suggestion), [aria-modal="true"]:not(.first-visit-suggestion)')
    || document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
}

function SuggestionSheet({ suggestion, onDismiss }) {
  const dialogRef = useRef(null);
  const headingRef = useRef(null);
  const pointerStart = useRef(null);
  const isPulse = suggestion === "pulse";

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [suggestion]);

  function startSwipe(event) {
    if (event.pointerType !== "touch") return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function endSwipe(event) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const down = event.clientY - start.y;
    if (down > 48 && down > Math.abs(event.clientX - start.x)) onDismiss();
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="first-visit-suggestion"
      aria-labelledby="first-visit-suggestion-title"
      aria-describedby="first-visit-suggestion-description"
      onCancel={(event) => { event.preventDefault(); onDismiss(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onDismiss(); }}
    >
      <div className="first-visit-suggestion-panel" key={suggestion}>
        <div className="first-visit-suggestion-grabber" aria-hidden="true"
          onPointerDown={startSwipe} onPointerUp={endSwipe} onPointerCancel={() => { pointerStart.current = null; }}>
          <span />
        </div>
        <div className="first-visit-suggestion-body">
          {isPulse ? (
            <div className="first-visit-suggestion-art" aria-hidden="true">
              <PulseOrbAnimation className="first-visit-suggestion-orb" />
            </div>
          ) : (
            <div className="first-visit-suggestion-avatar" aria-hidden="true">
              <img className="first-visit-suggestion-logo" src="/logo192.png" alt="" width={104} height={104} />
              <img className="first-visit-suggestion-badge" src={whatsappBadge} alt="" width={32} height={32} />
            </div>
          )}
          <h2 id="first-visit-suggestion-title" ref={headingRef} tabIndex={-1}>
            {isPulse ? "Pulse AI" : "Connect with us on WhatsApp"}
          </h2>
          <p id="first-visit-suggestion-description">
            {isPulse
              ? "Ask about products, find the right wiring accessories, or get help booking a repair."
              : "Chat directly with Prakash Electronics for product questions or repair support."}
          </p>
          <a className={`first-visit-suggestion-action${isPulse ? "" : " first-visit-suggestion-action--whatsapp"}`}
            href={isPulse ? PULSE_AI_GREETING_PATH : `https://wa.me/${DEFAULT_PUBLIC_CONTACT.whatsappNumber}`}
            target={isPulse ? undefined : "_blank"} rel={isPulse ? undefined : "noopener noreferrer"} onClick={onDismiss}>
            {isPulse ? "Say hello to Pulse AI" : "Open WhatsApp"}<ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
    </dialog>, document.body,
  );
}

export function FirstVisitSuggestions() {
  const [suggestion, setSuggestion] = useState(null);

  useEffect(() => {
    let startedAt;
    try {
      startedAt = getVisitStart();
    } catch {
      // Browsers without storage cannot remember that the suggestions were shown.
      return undefined;
    }
    let active = true;
    let timer;
    function showDueSuggestion() {
      window.clearTimeout(timer);
      if (!active || document.visibilityState === "hidden") return;

      try {
        const shown = JSON.parse(window.localStorage.getItem(VISIT_KEY) || "{}");
        if (shown.whatsappShown) return;
        const now = Date.now();
        const dueAt = shown.pulseShownAt
          ? Math.max(shown.pulseShownAt, startedAt) + WHATSAPP_DELAY
          : startedAt + PULSE_DELAY;
        const remaining = dueAt - now;
        if (remaining > 0) {
          timer = window.setTimeout(advanceSuggestions, remaining);
        } else if (pageHasActiveInteraction()) {
          timer = window.setTimeout(advanceSuggestions, 1000);
        } else if (!shown.pulseShownAt) {
          window.localStorage.setItem(VISIT_KEY, JSON.stringify({ pulseShownAt: now }));
          setSuggestion("pulse");
          timer = window.setTimeout(advanceSuggestions, WHATSAPP_DELAY);
        } else {
          window.localStorage.setItem(VISIT_KEY, JSON.stringify({ pulseShownAt: shown.pulseShownAt, whatsappShown: true }));
          setSuggestion("whatsapp");
        }
      } catch {
        // Leave the storefront usable if the visitor clears or blocks storage.
      }
    }

    function advanceSuggestions() {
      if (!active || document.visibilityState === "hidden") return;
      const locks = window.navigator.locks;
      // Serialize storage updates when two storefront tabs reach a timer together.
      if (locks?.request) void locks.request(VISIT_KEY, showDueSuggestion).catch(showDueSuggestion);
      else showDueSuggestion();
    }

    advanceSuggestions();
    document.addEventListener("visibilitychange", advanceSuggestions);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", advanceSuggestions);
    };
  }, []);

  return suggestion ? <SuggestionSheet suggestion={suggestion} onDismiss={() => setSuggestion(null)} /> : null;
}
