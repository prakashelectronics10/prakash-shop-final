import { useEffect, useRef, useState } from "react";
import { useSiteData } from "../../context/SiteDataContext";

function Counter({ to, suffix }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    const target = Number(to || 0);
    const node = ref.current;
    if (!node) return undefined;

    const format = (value) => `${Math.floor(value).toLocaleString("en-IN")}${suffix || ""}`;
    const finish = () => {
      const text = format(target);
      node.textContent = text;
      setDisplay(text);
    };
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      finish();
      return undefined;
    }

    let frame = 0;
    let startTime = 0;
    const run = (time) => {
      if (!startTime) startTime = time;
      const progress = Math.min(1, (time - startTime) / 950);
      const eased = 1 - Math.pow(1 - progress, 3);
      // Update the DOM directly during the animation to avoid React re-renders on scroll.
      node.textContent = format(target * eased);
      if (progress < 1) {
        frame = window.requestAnimationFrame(run);
      } else {
        setDisplay(format(target));
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        frame = window.requestAnimationFrame(run);
      },
      { rootMargin: "80px 0px", threshold: 0.2 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [to, suffix]);

  return <span ref={ref}>{display}</span>;
}

export function Stats({ sectionId = "stats" }) {
  const { content } = useSiteData();
  const stats = content.stats?.items || [];

  if (!stats.length) return null;

  return (
    <section id={sectionId || undefined} className="site-section relative">
      <div className="mx-auto max-w-7xl px-4">
        <div className="relative overflow-hidden rounded-3xl glass-strong border-glow p-8 md:p-12 shadow-elegant">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-gradient-primary opacity-30 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
          <div className="relative grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="text-center"
              >
                <div className="font-display text-4xl font-bold text-gradient md:text-5xl">
                  <Counter to={s.value} suffix={s.suffix} />
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
