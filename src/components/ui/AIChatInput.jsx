import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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

const WAVE_BAR_COUNT = 72;
const WAVE_MIN = 0.08;
const TEXTAREA_MIN_PX = 44;
const TEXTAREA_MAX_PX = 132;
const COLLAPSED_HEIGHT = 68;
const EXPANDED_BASE_HEIGHT = 128;
const LISTENING_HEIGHT = 148;

function createIdleWave() {
  return Array.from({ length: WAVE_BAR_COUNT }, () => WAVE_MIN);
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

  const hasText = Boolean(String(value || "").trim());
  const canSubmit = hasText || hasAttachments;
  const expanded = isActive || hasText || hasAttachments || listening;

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

  const stopVoice = () => {
    try {
      recognitionRef.current?.stop?.();
    } catch (_error) {
      // Recognition may already be stopped.
    }
    recognitionRef.current = null;
    stopAudioMeters();
    setListening(false);
    setInterimText("");
    waveHistoryRef.current = createIdleWave();
    paintWaveBars();
  };

  const paintWaveBars = () => {
    const barsRoot = waveBarsRef.current;
    if (!barsRoot) return;
    const history = waveHistoryRef.current;
    const children = barsRoot.children;
    for (let index = 0; index < WAVE_BAR_COUNT; index += 1) {
      const bar = children[index];
      if (!bar) continue;
      const level = history[index] ?? WAVE_MIN;
      const edge = Math.min(index, WAVE_BAR_COUNT - 1 - index);
      const fade = edge < 6 ? 0.35 + (edge / 6) * 0.65 : 1;
      bar.style.height = `${Math.max(8, level * 100)}%`;
      bar.style.opacity = String(fade);
    }
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
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = context;
      analyserRef.current = analyser;

      const timeData = new Uint8Array(analyser.fftSize);
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      let lastPush = 0;

      const tick = (now) => {
        if (!analyserRef.current) return;

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

        // Scroll speed scales with loudness — quieter = slower drift, louder = faster leftward flow.
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

        // Keep a soft idle drip so the wave never freezes in silence.
        if (now - lastPush > 110 && shaped <= WAVE_MIN + 0.02) {
          pushWaveSample(WAVE_MIN + Math.random() * 0.03);
          lastPush = now;
        }

        rafRef.current = window.requestAnimationFrame(tick);
      };

      rafRef.current = window.requestAnimationFrame(tick);
    } catch (_error) {
      // Fallback to synthetic wave animation when mic stream is blocked.
      waveHistoryRef.current = createIdleWave();
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
    if (!listening) return undefined;
    const frame = window.requestAnimationFrame(() => paintWaveBars());
    return () => window.cancelAnimationFrame(frame);
  }, [listening]);

  useEffect(() => {
    if (isActive || hasText || listening) return undefined;

    const interval = window.setInterval(() => {
      setShowPlaceholder(false);
      window.setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
        setShowPlaceholder(true);
      }, 400);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [isActive, hasText, listening]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        if (!hasText && !listening) setIsActive(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [hasText, listening]);

  useEffect(() => () => {
    stopVoice();
  }, []);

  useEffect(() => {
    if (!listening) return undefined;
    const fallback = window.setInterval(() => {
      if (analyserRef.current) return;
      wavePhaseRef.current += 0.42;
      const t = wavePhaseRef.current;
      const envelope = 0.22 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.15));
      const sample = Math.max(
        WAVE_MIN,
        Math.min(1, envelope * (0.55 + 0.45 * Math.sin(t * 2.4 + Math.random()))),
      );
      pushWaveSample(sample);
    }, 55);
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

  const toggleVoice = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Voice typing is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    if (listening) {
      stopVoice();
      return;
    }

    setVoiceError("");
    setIsActive(true);
    baseValueRef.current = String(value || "").trim();
    setInterimText("");
    waveHistoryRef.current = createIdleWave();
    scrollCarryRef.current = 0;
    // Paint after listening UI mounts.
    window.requestAnimationFrame(() => paintWaveBars());

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
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
      if (errorType === "not-allowed" || errorType === "service-not-allowed") {
        setVoiceError("Microphone permission denied. Allow mic access and try again.");
      } else if (errorType && errorType !== "aborted" && errorType !== "no-speech") {
        setVoiceError("Voice typing paused. Tap the mic to try again.");
      }
      stopVoice();
    };

    recognition.onend = () => {
      stopAudioMeters();
      setListening(false);
      setInterimText("");
      waveHistoryRef.current = createIdleWave();
    };

    try {
      await startAudioMeters();
      setListening(true);
      recognition.start();
    } catch (_error) {
      setVoiceError("Unable to start voice typing right now.");
      stopVoice();
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

  return (
    <motion.div
      ref={wrapperRef}
      className={`pulse-ai-input ${expanded ? "expanded" : "collapsed"} ${listening ? "listening" : ""} ${className}`}
      animate={{ height: composerHeight }}
      initial={{ height: COLLAPSED_HEIGHT }}
      transition={{ type: "spring", stiffness: 120, damping: 18 }}
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
                    {Array.from({ length: WAVE_BAR_COUNT }, (_, index) => (
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
                  title="Cancel voice typing"
                  aria-label="Cancel voice typing"
                  onClick={(event) => {
                    event.stopPropagation();
                    stopVoice();
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
                        variants={{
                          initial: {},
                          animate: { transition: { staggerChildren: 0.025 } },
                          exit: { transition: { staggerChildren: 0.015, staggerDirection: -1 } },
                        }}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                      >
                        {PLACEHOLDERS[placeholderIndex].split("").map((char, index) => (
                          <motion.span
                            key={`${placeholderIndex}-${index}`}
                            variants={{
                              initial: { opacity: 0, filter: "blur(12px)", y: 10 },
                              animate: {
                                opacity: 1,
                                filter: "blur(0px)",
                                y: 0,
                                transition: {
                                  opacity: { duration: 0.25 },
                                  filter: { duration: 0.4 },
                                  y: { type: "spring", stiffness: 80, damping: 20 },
                                },
                              },
                              exit: {
                                opacity: 0,
                                filter: "blur(12px)",
                                y: -10,
                                transition: {
                                  opacity: { duration: 0.2 },
                                  filter: { duration: 0.3 },
                                  y: { type: "spring", stiffness: 80, damping: 20 },
                                },
                              },
                            }}
                          >
                            {char === " " ? "\u00A0" : char}
                          </motion.span>
                        ))}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>

          <button
            className={`pulse-ai-icon-btn mic ${listening ? "active" : ""}`}
            title={listening ? "Stop voice input" : "Voice input"}
            type="button"
            tabIndex={0}
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
            hidden: { opacity: 0, y: 16, pointerEvents: "none", transition: { duration: 0.22 } },
            visible: { opacity: 1, y: 0, pointerEvents: "auto", transition: { duration: 0.32, delay: 0.06 } },
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
              onThinkChange?.(!thinkActive);
            }}
          >
            <Lightbulb size={16} />
            Think
          </button>

          <motion.button
            className={`pulse-ai-mode-chip deep ${deepSearchActive ? "on" : ""}`}
            title="Deep Search: compare more products, services, and offers"
            type="button"
            aria-pressed={deepSearchActive}
            initial={false}
            animate={{
              width: deepSearchActive ? 128 : 36,
              paddingLeft: deepSearchActive ? 10 : 9,
            }}
            onClick={(event) => {
              event.stopPropagation();
              onDeepSearchChange?.(!deepSearchActive);
            }}
          >
            <Globe size={16} />
            <motion.span initial={false} animate={{ opacity: deepSearchActive ? 1 : 0 }}>
              Deep Search
            </motion.span>
          </motion.button>

          {(thinkActive || deepSearchActive) && (
            <span className="pulse-ai-mode-hint">
              {thinkActive && deepSearchActive
                ? "Step-by-step + deeper catalog match"
                : thinkActive
                  ? "Step-by-step reasoning on"
                  : "Deep catalog & service search on"}
            </span>
          )}
        </motion.div>

        {voiceError ? <div className="pulse-ai-voice-error">{voiceError}</div> : null}
      </div>
    </motion.div>
  );
}

export default AIChatInput;
