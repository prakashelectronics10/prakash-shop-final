import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, Lightbulb, Mic, Paperclip, Send, X } from "lucide-react";
import "./AIChatInput.css";

const PLACEHOLDERS = [
  "Ask Pulse AI anything...",
  "Find electronics & electrical products",
  "Need help with wiring accessories?",
  "Compare products before you buy",
  "Troubleshoot electronic devices",
  "Get expert repair guidance",
  "Choose the right wire, MCB or switch",
  "Find the perfect electrical solution",
];

const WAVE_BAR_COUNT_DESKTOP = 56;
const WAVE_BAR_COUNT_MOBILE = 36;
const WAVE_MIN = 0.08;
const TEXTAREA_MIN_PX = 44;
const TEXTAREA_MAX_PX = 132;
const COLLAPSED_HEIGHT = 68;
const EXPANDED_BASE_HEIGHT = 128;
const LISTENING_HEIGHT = 148;

function getWaveBarCount() {
  if (typeof window === "undefined") return WAVE_BAR_COUNT_DESKTOP;
  return window.innerWidth <= 640 ? WAVE_BAR_COUNT_MOBILE : WAVE_BAR_COUNT_DESKTOP;
}

function createIdleWave(count = getWaveBarCount()) {
  return Array.from({ length: count }, () => WAVE_MIN);
}

function isLowPowerDevice() {
  if (typeof navigator === "undefined") return false;
  const memory = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);
  return (memory > 0 && memory <= 4) || (cores > 0 && cores <= 4);
}

/**
 * Professional expandable Pulse AI composer with live voice-wave UI.
 */
export function AIChatInput({
  value = "",
  onChange,
  onSubmit,
  onAttach,
  attachButtonRef = null,
  hasAttachments = false,
  disabled = false,
  busy = false,
  thinkActive = false,
  deepSearchActive = false,
  onThinkChange,
  onDeepSearchChange,
  className = "",
}) {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [textareaHeight, setTextareaHeight] = useState(TEXTAREA_MIN_PX);
  const [waveBarCount, setWaveBarCount] = useState(getWaveBarCount);

  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const waveBarsRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const rafRef = useRef(0);
  const baseValueRef = useRef("");
  const waveHistoryRef = useRef(createIdleWave());
  const wavePhaseRef = useRef(0);
  const scrollCarryRef = useRef(0);
  const wantListeningRef = useRef(false);
  const restartTimerRef = useRef(0);
  const lowPower = useRef(isLowPowerDevice());

  const hasText = Boolean(String(value || "").trim());
  const canSubmit = hasText || hasAttachments;
  const modesOn = thinkActive || deepSearchActive;
  const expanded = isActive || hasText || hasAttachments || listening || modesOn;

  const stopAudioMeters = () => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };

  const paintWaveBars = () => {
    const barsRoot = waveBarsRef.current;
    if (!barsRoot) return;
    const history = waveHistoryRef.current;
    const children = barsRoot.children;
    const count = history.length;
    for (let index = 0; index < count; index += 1) {
      const bar = children[index];
      if (!bar) continue;
      const level = history[index] ?? WAVE_MIN;
      const edge = Math.min(index, count - 1 - index);
      const fade = edge < 5 ? 0.35 + (edge / 5) * 0.65 : 1;
      bar.style.height = `${Math.max(8, level * 100)}%`;
      bar.style.opacity = String(fade);
    }
  };

  const stopVoice = ({ userInitiated = false } = {}) => {
    if (userInitiated) wantListeningRef.current = false;
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = 0;
    }
    try {
      recognitionRef.current?.stop?.();
    } catch (_error) {
      // Recognition may already be stopped.
    }
    recognitionRef.current = null;
    stopAudioMeters();
    setListening(false);
    setInterimText("");
    waveHistoryRef.current = createIdleWave(waveBarCount);
    paintWaveBars();
  };

  const pushWaveSample = (level) => {
    const history = waveHistoryRef.current;
    history.shift();
    history.push(level);
    paintWaveBars();
  };

  const startAudioMeters = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = lowPower.current ? 128 : 256;
      analyser.smoothingTimeConstant = 0.55;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = context;
      analyserRef.current = analyser;

      const timeData = new Uint8Array(analyser.fftSize);
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      let lastPush = 0;

      const tick = (now) => {
        if (!analyserRef.current || !wantListeningRef.current) return;

        analyserRef.current.getByteTimeDomainData(timeData);
        analyserRef.current.getByteFrequencyData(freqData);

        let sum = 0;
        for (let i = 0; i < timeData.length; i += 1) {
          const normalized = (timeData[i] - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / timeData.length);

        let bass = 0;
        const bassBins = Math.min(12, freqData.length);
        for (let i = 0; i < bassBins; i += 1) bass += freqData[i];
        bass = bass / (bassBins * 255);

        const loudness = Math.min(1, Math.max(0, rms * 4.6 + bass * 0.55));
        const shaped = loudness < 0.04
          ? WAVE_MIN
          : Math.min(1, WAVE_MIN + loudness ** 0.78 * 0.92);

        const scrollSpeed = 0.55 + shaped * 1.65;
        scrollCarryRef.current += scrollSpeed;

        while (scrollCarryRef.current >= 1) {
          scrollCarryRef.current -= 1;
          wavePhaseRef.current += 0.37;
          const texture = 0.04 * Math.sin(wavePhaseRef.current * 2.1);
          const sample = Math.max(WAVE_MIN, Math.min(1, shaped + texture));
          pushWaveSample(sample);
          lastPush = now;
        }

        if (now - lastPush > 110 && shaped <= WAVE_MIN + 0.02) {
          pushWaveSample(WAVE_MIN + Math.random() * 0.03);
          lastPush = now;
        }

        rafRef.current = window.requestAnimationFrame(tick);
      };

      rafRef.current = window.requestAnimationFrame(tick);
    } catch (_error) {
      waveHistoryRef.current = createIdleWave(waveBarCount);
      paintWaveBars();
    }
  };

  const syncTextareaHeight = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(TEXTAREA_MAX_PX, Math.max(TEXTAREA_MIN_PX, el.scrollHeight));
    el.style.height = `${next}px`;
    setTextareaHeight(next);
  };

  useLayoutEffect(() => {
    if (listening) return;
    syncTextareaHeight();
  }, [value, interimText, listening, expanded, isActive]);

  useEffect(() => {
    const onResize = () => {
      const next = getWaveBarCount();
      setWaveBarCount((prev) => (prev === next ? prev : next));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!listening) return undefined;
    waveHistoryRef.current = createIdleWave(waveBarCount);
    const frame = window.requestAnimationFrame(() => paintWaveBars());
    return () => window.cancelAnimationFrame(frame);
  }, [listening, waveBarCount]);

  useEffect(() => {
    if (isActive || hasText || listening || modesOn) return undefined;

    const interval = window.setInterval(() => {
      setShowPlaceholder(false);
      window.setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
        setShowPlaceholder(true);
      }, 400);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [isActive, hasText, listening, modesOn]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        if (!hasText && !listening && !modesOn) setIsActive(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [hasText, listening, modesOn]);

  useEffect(() => () => {
    wantListeningRef.current = false;
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = 0;
    }
    try {
      recognitionRef.current?.stop?.();
    } catch (_error) {
      // ignore
    }
    recognitionRef.current = null;
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  useEffect(() => {
    if (!listening) return undefined;
    const fallback = window.setInterval(() => {
      if (analyserRef.current || !wantListeningRef.current) return;
      wavePhaseRef.current += 0.42;
      const t = wavePhaseRef.current;
      const envelope = 0.22 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.15));
      const sample = Math.max(
        WAVE_MIN,
        Math.min(1, envelope * (0.55 + 0.45 * Math.sin(t * 2.4 + Math.random()))),
      );
      const history = waveHistoryRef.current;
      history.shift();
      history.push(sample);
      paintWaveBars();
    }, lowPower.current ? 80 : 55);
    return () => window.clearInterval(fallback);
  }, [listening]);

  const handleActivate = () => {
    if (disabled) return;
    setIsActive(true);
    inputRef.current?.focus();
  };

  const handleSubmit = (event) => {
    event?.preventDefault?.();
    if (disabled || busy || !canSubmit || listening) return;
    onSubmit?.();
  };

  const bindRecognitionHandlers = (recognition) => {
    recognition.onresult = (event) => {
      if (!wantListeningRef.current) return;

      let finalChunk = "";
      let interimChunk = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = String(result?.[0]?.transcript || "").trim();
        if (!transcript) continue;
        if (result.isFinal) finalChunk = `${finalChunk} ${transcript}`.trim();
        else interimChunk = `${interimChunk} ${transcript}`.trim();
      }

      if (finalChunk) {
        const nextBase = baseValueRef.current
          ? `${baseValueRef.current} ${finalChunk}`.trim()
          : finalChunk;
        baseValueRef.current = nextBase;
        onChange?.(nextBase);
        setInterimText("");
      } else {
        setInterimText(interimChunk);
      }
    };

    recognition.onerror = (event) => {
      const errorType = String(event?.error || "");
      // Keep listening through silence / network blips until the user turns mic off.
      if (errorType === "no-speech" || errorType === "aborted" || errorType === "network") {
        return;
      }
      if (errorType === "not-allowed" || errorType === "service-not-allowed") {
        setVoiceError("Microphone permission denied. Allow mic access and try again.");
        stopVoice({ userInitiated: true });
        return;
      }
      if (errorType) {
        setVoiceError("Voice typing paused. Tap the mic to continue.");
        stopVoice({ userInitiated: true });
      }
    };

    recognition.onend = () => {
      // Browsers often end continuous recognition after a pause — restart until user stops.
      if (!wantListeningRef.current) {
        stopAudioMeters();
        setListening(false);
        setInterimText("");
        waveHistoryRef.current = createIdleWave(waveBarCount);
        return;
      }

      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = window.setTimeout(() => {
        if (!wantListeningRef.current || !recognitionRef.current) return;
        try {
          recognitionRef.current.start();
        } catch (_error) {
          // Already started or temporarily unavailable — retry shortly.
          if (!wantListeningRef.current) return;
          restartTimerRef.current = window.setTimeout(() => {
            try {
              recognitionRef.current?.start?.();
            } catch (_retryError) {
              setVoiceError("Voice typing paused. Tap the mic to continue.");
              stopVoice({ userInitiated: true });
            }
          }, 350);
        }
      }, 120);
    };
  };

  const toggleVoice = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Voice typing is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    if (listening || wantListeningRef.current) {
      stopVoice({ userInitiated: true });
      return;
    }

    setVoiceError("");
    setIsActive(true);
    baseValueRef.current = String(value || "").trim();
    setInterimText("");
    waveHistoryRef.current = createIdleWave(waveBarCount);
    scrollCarryRef.current = 0;
    wantListeningRef.current = true;
    window.requestAnimationFrame(() => paintWaveBars());

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    bindRecognitionHandlers(recognition);

    try {
      await startAudioMeters();
      setListening(true);
      recognition.start();
    } catch (_error) {
      setVoiceError("Unable to start voice typing right now.");
      stopVoice({ userInitiated: true });
    }
  };

  const extraTextHeight = Math.max(0, textareaHeight - TEXTAREA_MIN_PX);
  const composerHeight = listening
    ? LISTENING_HEIGHT
    : expanded
      ? EXPANDED_BASE_HEIGHT + extraTextHeight
      : COLLAPSED_HEIGHT;

  const displayValue = listening && interimText
    ? `${baseValueRef.current ? `${baseValueRef.current} ` : ""}${interimText}`
    : value;

  const heightTransition = lowPower.current
    ? { duration: 0.18, ease: "easeOut" }
    : { type: "spring", stiffness: 120, damping: 18 };

  return (
    <motion.div
      ref={wrapperRef}
      className={`pulse-ai-input ${expanded ? "expanded" : "collapsed"} ${listening ? "listening" : ""} ${modesOn ? "modes-on" : ""} ${className}`}
      animate={{ height: composerHeight }}
      initial={{ height: COLLAPSED_HEIGHT }}
      transition={heightTransition}
      onClick={handleActivate}
      role="group"
      aria-label="Pulse AI message composer"
    >
      <div className="pulse-ai-input-inner">
        <div className="pulse-ai-input-row">
          <button
            ref={attachButtonRef}
            className="pulse-ai-icon-btn"
            title="Attach image"
            type="button"
            tabIndex={0}
            disabled={disabled || busy || listening}
            onClick={(event) => {
              event.stopPropagation();
              onAttach?.();
            }}
          >
            <Paperclip size={20} />
          </button>

          <div className={`pulse-ai-field ${listening ? "is-listening" : ""}`}>
            {listening ? (
              <div className="pulse-voice-wave" aria-live="polite" aria-label="Listening for voice input">
                <div className="pulse-voice-wave-track" aria-hidden="true">
                  <div className="pulse-voice-wave-bars" ref={waveBarsRef}>
                    {Array.from({ length: waveBarCount }, (_, index) => (
                      <span
                        key={`wave-${index}`}
                        className="pulse-voice-bar"
                        style={{ height: "8%" }}
                      />
                    ))}
                  </div>
                </div>
                <button
                  className="pulse-voice-cancel"
                  type="button"
                  title="Stop voice typing"
                  aria-label="Stop voice typing"
                  onClick={(event) => {
                    event.stopPropagation();
                    stopVoice({ userInitiated: true });
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <textarea
                  ref={inputRef}
                  value={displayValue}
                  disabled={disabled || busy}
                  rows={1}
                  onChange={(event) => onChange?.(event.target.value)}
                  onFocus={handleActivate}
                  onInput={syncTextareaHeight}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSubmit(event);
                    }
                  }}
                  aria-label="Message Pulse AI"
                  autoComplete="off"
                  spellCheck
                />
                <div className="pulse-ai-placeholder" aria-hidden="true">
                  <AnimatePresence mode="wait">
                    {showPlaceholder && !isActive && !hasText && (
                      <motion.span
                        key={placeholderIndex}
                        className="pulse-ai-placeholder-text"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: lowPower.current ? 0.15 : 0.28 }}
                      >
                        {PLACEHOLDERS[placeholderIndex]}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>

          <button
            className={`pulse-ai-icon-btn mic ${listening ? "active" : ""}`}
            title={listening ? "Stop voice typing" : "Start voice typing"}
            type="button"
            tabIndex={0}
            aria-pressed={listening}
            disabled={disabled || busy}
            onClick={(event) => {
              event.stopPropagation();
              toggleVoice();
            }}
          >
            <Mic size={20} />
          </button>

          <button
            className="pulse-ai-send"
            title="Send"
            type="button"
            tabIndex={0}
            disabled={disabled || busy || !canSubmit || listening}
            onClick={(event) => {
              event.stopPropagation();
              handleSubmit(event);
            }}
          >
            <Send size={18} />
          </button>
        </div>

        <motion.div
          className="pulse-ai-modes"
          variants={{
            hidden: { opacity: 0, y: 16, pointerEvents: "none", transition: { duration: 0.18 } },
            visible: { opacity: 1, y: 0, pointerEvents: "auto", transition: { duration: 0.24, delay: 0.04 } },
          }}
          initial="hidden"
          animate={expanded ? "visible" : "hidden"}
        >
          <button
            className={`pulse-ai-mode-chip ${thinkActive ? "on" : ""}`}
            title="Think: step-by-step reasoning before the final answer"
            type="button"
            aria-pressed={thinkActive}
            onClick={(event) => {
              event.stopPropagation();
              setIsActive(true);
              onThinkChange?.(!thinkActive);
            }}
          >
            <Lightbulb size={16} />
            Think
          </button>

          <button
            className={`pulse-ai-mode-chip deep ${deepSearchActive ? "on" : ""}`}
            title="Deep Research: compare more products, services, and offers"
            type="button"
            aria-pressed={deepSearchActive}
            onClick={(event) => {
              event.stopPropagation();
              setIsActive(true);
              onDeepSearchChange?.(!deepSearchActive);
            }}
          >
            <Globe size={16} />
            Deep Research
          </button>

          {(thinkActive || deepSearchActive) && (
            <span className="pulse-ai-mode-hint">
              {thinkActive && deepSearchActive
                ? "Step-by-step + deeper catalog match"
                : thinkActive
                  ? "Step-by-step reasoning on"
                  : "Deep catalog & service research on"}
            </span>
          )}
        </motion.div>

        {voiceError ? <div className="pulse-ai-voice-error">{voiceError}</div> : null}
      </div>
    </motion.div>
  );
}

export default AIChatInput;
