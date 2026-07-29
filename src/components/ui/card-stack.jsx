"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, SquareArrowOutUpRight } from "lucide-react";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

const NAV_ARROW_CLASSES =
  "relative flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-white/10 bg-white/5 text-white/55 shadow-[0_4px_20px_rgba(0,0,0,0.35)] outline-none backdrop-blur-[16px] transition-colors duration-300 before:pointer-events-none before:absolute before:inset-[3px] before:rounded-full before:border before:border-white/[0.04] before:content-[''] hover:border-white/25 hover:text-white/85 active:opacity-70 disabled:pointer-events-none disabled:opacity-35";

function wrapIndex(n, len) {
  if (len <= 0) return 0;
  return ((n % len) + len) % len;
}

/** Minimal signed offset from active index to i, with wrapping (for loop behavior). */
function signedOffset(i, active, len, loop) {
  const raw = i - active;
  if (!loop || len <= 1) return raw;

  const alt = raw > 0 ? raw - len : raw + len;
  return Math.abs(alt) < Math.abs(raw) ? alt : raw;
}

export function CardStack({
  items = [],
  initialIndex = 0,
  maxVisible = 7,

  cardWidth = 520,
  cardHeight = 320,

  overlap = 0.48,
  spreadDeg = 48,

  perspectivePx = 1100,
  depthPx = 140,
  tiltXDeg = 12,

  activeLiftPx = 22,
  activeScale = 1.03,
  inactiveScale = 0.94,

  springStiffness = 160,
  springDamping = 30,
  springMass = 1.05,
  /** When set, uses a cinematic tween instead of a spring (more polished auto-slide). */
  slideDuration = 0,
  slideEase = [0.22, 1, 0.36, 1],

  loop = true,
  autoAdvance = false,
  intervalMs = 4200,
  pauseOnHover = true,

  showDots = true,
  showArrows = true,
  className,

  onChangeIndex,
  renderCard,
}) {
  const reduceMotion = useReducedMotion();
  const len = items.length;

  const [active, setActive] = React.useState(() => wrapIndex(initialIndex, len));
  const [cardsHovering, setCardsHovering] = React.useState(false);

  const activeRef = React.useRef(active);
  const userPausedRef = React.useRef(false);
  const resumeTimerRef = React.useRef(null);

  React.useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const pauseAutoAfterUserAction = React.useCallback(() => {
    userPausedRef.current = true;
    if (resumeTimerRef.current) {
      window.clearTimeout(resumeTimerRef.current);
    }
    resumeTimerRef.current = window.setTimeout(() => {
      userPausedRef.current = false;
    }, Math.max(intervalMs * 2, 6000));
  }, [intervalMs]);

  React.useEffect(
    () => () => {
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current);
      }
    },
    [],
  );

  React.useEffect(() => {
    setActive((a) => wrapIndex(a, len));
  }, [len]);

  React.useEffect(() => {
    if (!len) return;
    onChangeIndex?.(active, items[active]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const maxOffset = Math.max(0, Math.floor(maxVisible / 2));

  const cardSpacing = Math.max(10, Math.round(cardWidth * (1 - overlap)));
  const stepDeg = maxOffset > 0 ? spreadDeg / maxOffset : 0;

  const canGoPrev = loop || active > 0;
  const canGoNext = loop || active < len - 1;

  const prev = React.useCallback(() => {
    if (!len) return;
    if (!loop && activeRef.current <= 0) return;
    pauseAutoAfterUserAction();
    setActive((a) => wrapIndex(a - 1, len));
  }, [len, loop, pauseAutoAfterUserAction]);

  const nextWithUserPause = React.useCallback(() => {
    if (!len) return;
    if (!loop && activeRef.current >= len - 1) return;
    pauseAutoAfterUserAction();
    setActive((a) => wrapIndex(a + 1, len));
  }, [len, loop, pauseAutoAfterUserAction]);

  const goToIndex = React.useCallback(
    (index) => {
      if (!len) return;
      pauseAutoAfterUserAction();
      setActive(wrapIndex(index, len));
    },
    [len, pauseAutoAfterUserAction],
  );

  const onKeyDown = (e) => {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") nextWithUserPause();
  };

  React.useEffect(() => {
    if (!autoAdvance) return undefined;
    if (reduceMotion) return undefined;
    if (!len || len <= 1) return undefined;

    const tick = () => {
      if (pauseOnHover && cardsHovering) return;
      if (userPausedRef.current) return;
      if (!loop && activeRef.current >= len - 1) return;
      setActive((a) => wrapIndex(a + 1, len));
    };

    const id = window.setInterval(tick, Math.max(700, intervalMs));
    return () => window.clearInterval(id);
  }, [
    autoAdvance,
    intervalMs,
    cardsHovering,
    pauseOnHover,
    reduceMotion,
    len,
    loop,
  ]);

  if (!len) return null;

  const activeItem = items[active];
  const useTween = typeof slideDuration === "number" && slideDuration > 0;
  const cardTransition = reduceMotion
    ? { duration: 0.01 }
    : useTween
      ? {
          duration: slideDuration,
          ease: slideEase,
        }
      : {
          type: "spring",
          stiffness: springStiffness,
          damping: springDamping,
          mass: springMass,
        };

  return (
    <div className={cn("w-full", className)}>
      <div
        className="relative w-full outline-none"
        style={{ height: Math.max(320, cardHeight + 80) }}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseEnter={() => setCardsHovering(true)}
        onMouseLeave={() => setCardsHovering(false)}
        onFocus={() => setCardsHovering(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setCardsHovering(false);
          }
        }}
        role="region"
        aria-roledescription="carousel"
        aria-label="Card stack"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-6 mx-auto hidden h-48 w-[70%] rounded-full bg-black/5 blur-3xl md:block dark:bg-white/5"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto hidden h-40 w-[76%] rounded-full bg-black/10 blur-3xl md:block dark:bg-black/30"
          aria-hidden="true"
        />

        <div
          className="absolute inset-0 flex items-end justify-center"
          style={{ perspective: `${perspectivePx}px` }}
        >
          <AnimatePresence initial={false}>
            {items.map((item, i) => {
              const off = signedOffset(i, active, len, loop);
              const abs = Math.abs(off);
              const visible = abs <= maxOffset;

              if (!visible) return null;

              const rotateZ = off * stepDeg;
              const x = off * cardSpacing;
              const y = abs * 10;
              const z = -abs * depthPx;

              const isActive = off === 0;
              const scale = isActive ? activeScale : inactiveScale;
              const lift = isActive ? -activeLiftPx : 0;
              const rotateX = isActive ? 0 : tiltXDeg;
              const zIndex = 100 - abs;

              const dragProps = isActive
                ? {
                    drag: "x",
                    dragConstraints: { left: 0, right: 0 },
                    dragElastic: 0.18,
                    onDragEnd: (_e, info) => {
                      if (reduceMotion) return;
                      const travel = info.offset.x;
                      const v = info.velocity.x;
                      const threshold = Math.min(160, cardWidth * 0.22);

                      if (travel > threshold || v > 650) prev();
                      else if (travel < -threshold || v < -650) nextWithUserPause();
                    },
                  }
                : {};

              return (
                <motion.div
                  key={item.id}
                  className={cn(
                    "absolute bottom-0 overflow-hidden rounded-2xl border-4 border-black/10 shadow-xl dark:border-white/10",
                    "will-change-transform select-none",
                    isActive
                      ? "cursor-grab active:cursor-grabbing"
                      : "cursor-pointer",
                  )}
                  style={{
                    width: cardWidth,
                    height: cardHeight,
                    zIndex,
                    transformStyle: "preserve-3d",
                  }}
                  initial={
                    reduceMotion
                      ? false
                      : {
                          opacity: 0,
                          y: y + 28,
                          x,
                          rotateZ,
                          rotateX,
                          scale: scale * 0.96,
                        }
                  }
                  animate={{
                    opacity: 1,
                    x,
                    y: y + lift,
                    rotateZ,
                    rotateX,
                    scale,
                  }}
                  exit={
                    reduceMotion
                      ? undefined
                      : {
                          opacity: 0,
                          scale: inactiveScale * 0.92,
                          transition: {
                            duration: useTween ? Math.min(0.45, slideDuration * 0.55) : 0.35,
                            ease: "easeOut",
                          },
                        }
                  }
                  transition={cardTransition}
                  onClick={() => goToIndex(i)}
                  {...dragProps}
                >
                  <div
                    className="h-full w-full"
                    style={{
                      transform: `translateZ(${z}px)`,
                      transformStyle: "preserve-3d",
                    }}
                  >
                    {renderCard ? (
                      renderCard(item, { active: isActive })
                    ) : (
                      <DefaultFanCard item={item} active={isActive} />
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {showDots || showArrows ? (
        <div className="z-30 mt-4 flex w-full items-center justify-center gap-2.5 px-1 sm:mt-6 sm:gap-4">
          {showArrows ? (
            <button
              type="button"
              className={cn(NAV_ARROW_CLASSES, "h-9 w-9 sm:h-10 sm:w-10 md:h-12 md:w-12")}
              onClick={prev}
              disabled={!canGoPrev}
              aria-label="Previous card"
            >
              <ChevronLeft className="relative z-[2] h-4 w-4 sm:h-[18px] sm:w-[18px] md:h-5 md:w-5" strokeWidth={2.5} />
            </button>
          ) : null}

          {showDots ? (
            <div
              className="flex max-w-[min(100%,14rem)] flex-wrap items-center justify-center gap-1.5 sm:max-w-[18rem] sm:gap-2"
              role="tablist"
              aria-label="Card pagination"
            >
              {items.map((it, idx) => {
                const on = idx === active;
                return (
                  <button
                    key={it.id}
                    type="button"
                    role="tab"
                    onClick={() => goToIndex(idx)}
                    className={cn(
                      "h-2 w-2 rounded-full transition-all duration-300 sm:h-2.5 sm:w-2.5",
                      on
                        ? "scale-[1.3] bg-white/85 shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
                        : "bg-white/25 hover:bg-white/45",
                    )}
                    aria-label={`Go to ${it.title || `card ${idx + 1}`}`}
                    aria-selected={on}
                    aria-current={on ? "true" : undefined}
                  />
                );
              })}
            </div>
          ) : null}

          {showArrows ? (
            <button
              type="button"
              className={cn(NAV_ARROW_CLASSES, "h-9 w-9 sm:h-10 sm:w-10 md:h-12 md:w-12")}
              onClick={nextWithUserPause}
              disabled={!canGoNext}
              aria-label="Next card"
            >
              <ChevronRight className="relative z-[2] h-4 w-4 sm:h-[18px] sm:w-[18px] md:h-5 md:w-5" strokeWidth={2.5} />
            </button>
          ) : null}

          {activeItem?.href ? (
            <a
              href={activeItem.href}
              target={activeItem.href.startsWith("http") ? "_blank" : undefined}
              rel={activeItem.href.startsWith("http") ? "noreferrer" : undefined}
              className="ml-0.5 text-white/55 transition hover:text-white/90 sm:ml-1"
              aria-label={activeItem.ctaLabel || "Open link"}
            >
              <SquareArrowOutUpRight className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DefaultFanCard({ item }) {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        {item.imageSrc ? (
          <img
            src={item.imageSrc}
            alt={item.title}
            className="h-full w-full object-cover"
            draggable={false}
            loading="eager"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary text-sm text-muted-foreground">
            No image
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

      <div className="relative z-10 flex h-full flex-col justify-end p-5">
        {item.tag ? (
          <span className="mb-2 w-fit rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90">
            {item.tag}
          </span>
        ) : null}
        <div className="truncate text-lg font-semibold text-white">{item.title}</div>
        {item.description ? (
          <div className="mt-1 line-clamp-2 text-sm text-white/80">{item.description}</div>
        ) : null}
      </div>
    </div>
  );
}
