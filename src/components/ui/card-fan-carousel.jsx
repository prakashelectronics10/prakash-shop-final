import { useState, useEffect, useRef, useCallback } from "react";
import gsap from "gsap";
import "./card-fan-carousel.css";

const MAX_VISIBLE = 7;
const HALF = 3;

/* Unique zIndexes (never tie left/right) so overlaps always stack front→back from center. */
const FAN_POSITIONS = [
  { rot: -21, scale: 0.7756, x: -30, y: 7.3, zIndex: 4 },
  { rot: -14, scale: 0.8498, x: -22, y: 4.0, zIndex: 6 },
  { rot: -7, scale: 0.9346, x: -11, y: 1.3, zIndex: 8 },
  { rot: 0, scale: 1.0, x: 0, y: 0.0, zIndex: 20 },
  { rot: 7, scale: 0.9346, x: 11, y: 1.3, zIndex: 7 },
  { rot: 14, scale: 0.8498, x: 22, y: 4.0, zIndex: 5 },
  { rot: 21, scale: 0.7756, x: 30, y: 7.3, zIndex: 3 },
];

function getResponsiveMultiplier(width) {
  if (width < 480) return 0.28;
  if (width < 640) return 0.38;
  if (width < 768) return 0.5;
  if (width < 1024) return 0.75;
  return 1.0;
}

function getHeightMultiplier(width) {
  let idealPx;
  if (width < 480) idealPx = 22 * 16;
  else if (width < 640) idealPx = 26 * 16;
  else if (width < 768) idealPx = 28 * 16;
  else if (width < 1024) idealPx = 34 * 16;
  else idealPx = 38 * 16;

  const available = window.innerHeight * 0.7;
  if (available >= idealPx) return 1;
  return available / idealPx;
}

function getSlotConfig(totalCards, slot) {
  if (totalCards >= MAX_VISIBLE) return FAN_POSITIONS[slot];
  const center = totalCards >> 1;
  const distance = totalCards > 1 ? (slot - center) / center : 0;
  const absDistance = Math.abs(distance);
  const sideBias = slot < center ? -1 : slot > center ? 1 : 0;
  return {
    rot: distance * 21,
    scale: 1.0 - 0.2244 * absDistance * absDistance,
    x: distance * 30,
    y: absDistance * absDistance * 7.3,
    zIndex: 20 - Math.abs(slot - center) * 2 + sideBias,
  };
}

const ARROW_CLASSES =
  "relative flex items-center justify-center rounded-full border-[1.5px] border-white/10 bg-white/5 backdrop-blur-[16px] text-white/55 cursor-pointer shrink-0 z-30 outline-none shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-white/25 hover:text-white/80 active:opacity-70 transition-colors duration-300 before:content-[''] before:absolute before:inset-[3px] before:rounded-full before:border before:border-white/[0.04] before:pointer-events-none";

export default function SocialCards({ cards = [], renderCard, className = "" }) {
  const containerRef = useRef(null);
  const isAnimating = useRef(false);
  const hasEntered = useRef(false);
  const directionRef = useRef(null);
  const prevVisible = useRef(new Set());

  const totalCards = cards.length;
  const needsPagination = totalCards > MAX_VISIBLE;
  const [centerIndex, setCenterIndex] = useState(
    needsPagination ? HALF : totalCards >> 1,
  );

  const getVisibleMap = useCallback(
    (center) => {
      const map = new Map();
      if (!needsPagination) {
        cards.forEach((_, i) => map.set(i, i));
        return map;
      }
      for (let slot = 0; slot < MAX_VISIBLE; slot++) {
        map.set(((center + slot - HALF) % totalCards + totalCards) % totalCards, slot);
      }
      return map;
    },
    [totalCards, needsPagination, cards],
  );

  const cycle = useCallback(
    (direction) => {
      if (isAnimating.current || !needsPagination) return;
      isAnimating.current = true;
      directionRef.current = direction;
      setCenterIndex((prev) =>
        direction === "right"
          ? (prev + 1) % totalCards
          : (prev - 1 + totalCards) % totalCards,
      );
    },
    [totalCards, needsPagination],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !totalCards) return undefined;

    const cardElements = Array.from(container.querySelectorAll(".fan-card"));
    if (!cardElements.length) return undefined;

    const visibleMap = getVisibleMap(centerIndex);
    const previouslyVisible = prevVisible.current;
    const direction = directionRef.current;
    const isFirstMount = !hasEntered.current;
    const multiplier = getResponsiveMultiplier(window.innerWidth);
    const hMult = getHeightMultiplier(window.innerWidth);
    const slotCount = needsPagination ? MAX_VISIBLE : totalCards;
    const config = (slot) => getSlotConfig(slotCount, slot);

    if (isFirstMount) isAnimating.current = true;

    let completedCount = 0;
    const visibleCount = visibleMap.size;
    const onCardDone = () => {
      if (++completedCount >= visibleCount) {
        isAnimating.current = false;
        if (isFirstMount) hasEntered.current = true;
      }
    };

    const ctx = gsap.context(() => {
      cardElements.forEach((card, cardIndex) => {
        const slot = visibleMap.get(cardIndex);
        const wasVisible = previouslyVisible.has(cardIndex);

        if (slot !== undefined) {
          const { x, y, rot, scale, zIndex } = config(slot);
          /* Set zIndex immediately — never tween it (mid-tween stacking glitches). */
          gsap.set(card, { zIndex });
          const target = {
            x: `${x * multiplier}rem`,
            y: `${y * hMult}rem`,
            rotation: rot,
            scale,
            opacity: 1,
            force3D: true,
          };

          if (isFirstMount) {
            gsap.set(card, {
              x: 0,
              y: `${12 * hMult}rem`,
              rotation: 0,
              scale: 0.5,
              opacity: 0,
              zIndex,
            });
            gsap.to(card, {
              ...target,
              duration: 1.2,
              ease: "elastic.out(1.05,.78)",
              delay: 0.2 + slot * 0.06,
              onComplete: onCardDone,
            });
          } else if (!wasVisible) {
            const enterX = direction === "right" ? 40 : -40;
            gsap.set(card, {
              x: `${enterX}rem`,
              y: `${y * hMult}rem`,
              rotation: direction === "right" ? 30 : -30,
              scale: 0.5,
              opacity: 0,
              zIndex,
            });
            gsap.to(card, {
              ...target,
              duration: 0.6,
              ease: "power2.out",
              onComplete: onCardDone,
            });
          } else {
            gsap.to(card, {
              ...target,
              duration: 0.5,
              ease: "power2.out",
              onComplete: onCardDone,
            });
          }
        } else if (wasVisible) {
          const exitX = direction === "right" ? -40 : 40;
          gsap.set(card, { zIndex: 0 });
          gsap.to(card, {
            x: `${exitX}rem`,
            opacity: 0,
            scale: 0.5,
            rotation: direction === "right" ? -30 : 30,
            duration: 0.4,
            ease: "power2.in",
          });
        } else if (isFirstMount) {
          gsap.set(card, { opacity: 0, scale: 0.3, x: 0, y: 0, zIndex: 0 });
        }
      });
    }, container);

    prevVisible.current = new Set(visibleMap.keys());

    const visibleEntries = [];
    cardElements.forEach((el, i) => {
      const slot = visibleMap.get(i);
      if (slot !== undefined) visibleEntries.push({ el, slot });
    });
    visibleEntries.sort((a, b) => a.slot - b.slot);

    let activeSlot = null;
    let leaveTimer = null;
    const centerSlot = visibleEntries.length >> 1;

    const updateHoverLayout = (hoveredSlot) => {
      const mult = getResponsiveMultiplier(window.innerWidth);
      const hM = getHeightMultiplier(window.innerWidth);

      visibleEntries.forEach(({ el, slot }) => {
        const base = config(slot);
        let targetX = base.x * mult;
        let targetY = base.y * hM;
        let targetRot = base.rot;
        let targetScale = base.scale;
        let delay = 0;

        let targetZ = base.zIndex;

        if (hoveredSlot !== null) {
          const distance = Math.abs(slot - hoveredSlot);
          delay = distance * 0.02;

          if (slot === hoveredSlot) {
            targetY -= 2.5 * hM;
            targetScale *= 1.08;
            targetZ = 100;
          } else {
            const normalized = centerSlot > 0 ? (slot - centerSlot) / centerSlot : 0;
            const pushStrength =
              8 * (1 - Math.abs(normalized)) * (1 + 0.2 * Math.max(0, 3 - distance));

            if (slot < hoveredSlot) {
              targetX -= pushStrength * mult;
              targetRot -= 3 / (distance + 1);
            } else {
              targetX += pushStrength * mult;
              targetRot += 3 / (distance + 1);
            }

            if (slot === visibleEntries.length - 1 && hoveredSlot < centerSlot) {
              targetY -= 1 * hM;
            }
            if (slot === 0 && hoveredSlot > centerSlot) {
              targetY -= 1 * hM;
            }
          }
        } else {
          delay = Math.abs(slot - centerSlot) * 0.02;
        }

        gsap.set(el, { zIndex: targetZ });
        gsap.to(el, {
          x: `${targetX}rem`,
          y: `${targetY}rem`,
          rotation: targetRot,
          scale: targetScale,
          duration: 0.5,
          delay,
          ease: "elastic.out(1,.75)",
          overwrite: "auto",
          force3D: true,
        });
      });
    };

    const enterHandlers = visibleEntries.map(({ el, slot }) => {
      const handler = () => {
        if (isAnimating.current) return;
        if (leaveTimer) {
          clearTimeout(leaveTimer);
          leaveTimer = null;
        }
        if (activeSlot !== slot) {
          activeSlot = slot;
          updateHoverLayout(slot);
        }
      };
      el.addEventListener("mouseenter", handler);
      return { el, handler };
    });

    const onMouseLeave = () => {
      if (isAnimating.current) return;
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        activeSlot = null;
        updateHoverLayout(null);
      }, 50);
    };
    container.addEventListener("mouseleave", onMouseLeave);

    const onResize = () => {
      if (!isAnimating.current) updateHoverLayout(activeSlot);
    };
    window.addEventListener("resize", onResize);

    return () => {
      enterHandlers.forEach(({ el, handler }) =>
        el.removeEventListener("mouseenter", handler),
      );
      container.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", onResize);
      if (leaveTimer) clearTimeout(leaveTimer);
      ctx.revert();
    };
  }, [centerIndex, totalCards, getVisibleMap, needsPagination]);

  useEffect(() => {
    if (!totalCards) return;
    setCenterIndex((prev) => {
      if (needsPagination) return Math.min(prev, totalCards - 1);
      return totalCards >> 1;
    });
  }, [totalCards, needsPagination]);

  if (!totalCards) return null;

  const chevron = (direction) => (
    <svg
      className="relative z-[2] h-4 w-4 md:h-5 md:w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points={direction === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
    </svg>
  );

  return (
    <section
      className={`relative z-20 flex w-full flex-col items-center px-2 py-4 sm:px-4 md:px-8 lg:py-8 ${className}`}
    >
      <div className="flex w-full max-w-[90rem] items-center justify-center">
        <div
          ref={containerRef}
          className="fan-layout relative flex w-full max-w-[80rem] items-center justify-center"
        >
          {cards.map((card, index) => {
            const content = renderCard ? (
              renderCard(card, index)
            ) : (
              <div className="relative h-full w-full overflow-hidden">
                <img
                  src={card.imgUrl}
                  loading="lazy"
                  alt={card.alt || `Card ${index + 1}`}
                  className="absolute inset-0 z-10 h-full w-full object-cover"
                  draggable={false}
                />
              </div>
            );

            if (card.linkUrl) {
              return (
                <a
                  key={card.id || card.linkUrl || index}
                  href={card.linkUrl}
                  target={card.linkUrl.startsWith("http") ? "_blank" : undefined}
                  rel={card.linkUrl.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="fan-card block cursor-pointer"
                  aria-label={card.alt || card.title || `Card ${index + 1}`}
                >
                  {content}
                </a>
              );
            }

            return (
              <div key={card.id || index} className="fan-card">
                {content}
              </div>
            );
          })}
        </div>
      </div>

      {needsPagination ? (
        <div className="z-30 mt-4 flex items-center justify-center gap-4 md:mt-6">
          <button
            type="button"
            className={`${ARROW_CLASSES} h-10 w-10 md:h-12 md:w-12`}
            onClick={() => cycle("left")}
            aria-label="Previous"
          >
            {chevron("left")}
          </button>
          <div className="flex items-center gap-2">
            {cards.map((card, i) => (
              <span
                key={card.id || i}
                className={`h-2 w-2 rounded-full transition-all duration-300 ${
                  i === centerIndex ? "scale-[1.3] bg-white/80" : "bg-white/15"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            className={`${ARROW_CLASSES} h-10 w-10 md:h-12 md:w-12`}
            onClick={() => cycle("right")}
            aria-label="Next"
          >
            {chevron("right")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
