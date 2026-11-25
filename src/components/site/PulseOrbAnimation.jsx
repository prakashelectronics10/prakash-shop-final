import { useEffect, useRef, useState } from "react";
import { LottieSvgAnimation } from "./LottieSvgAnimation";
import "./PulseOrbAnimation.css";

let heroAnimationPromise;

function loadHeroAnimation() {
  if (!heroAnimationPromise) {
    heroAnimationPromise = fetch("/hero.json", { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("Pulse AI animation is unavailable");
        return response.json();
      })
      .catch(() => {
        heroAnimationPromise = null;
        return null;
      });
  }
  return heroAnimationPromise;
}

export function PulseOrbAnimation({ className = "", deferUntilVisible = false }) {
  const containerRef = useRef(null);
  const [animationData, setAnimationData] = useState(null);
  const [isVisible, setIsVisible] = useState(!deferUntilVisible);

  useEffect(() => {
    let active = true;
    loadHeroAnimation().then((data) => {
      if (active) setAnimationData(data);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!deferUntilVisible) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, { rootMargin: "80px" });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [deferUntilVisible]);

  return (
    <div ref={containerRef} className={`pulse-orb-animation ${className}`.trim()} aria-hidden="true">
      {animationData && isVisible ? (
        <div className="pulse-orb-animation-frame">
          <LottieSvgAnimation data={animationData} title="Pulse AI" className="pulse-orb-animation-lottie" />
        </div>
      ) : <div className="pulse-orb-animation-fallback" />}
    </div>
  );
}
