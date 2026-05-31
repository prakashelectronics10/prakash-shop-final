import { motion, useInView, useMotionValue, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useSiteData } from "../../context/SiteDataContext";

function Counter({ to, suffix }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!inView) return undefined;
    const controls = animate(mv, Number(to || 0), { duration: 2, ease: "easeOut" });
    const unsub = mv.on("change", (v) => setDisplay(Math.floor(v).toLocaleString()));
    return () => {
      controls.stop();
      unsub();
    };
  }, [inView, to, mv]);

  return <span ref={ref}>{display}{suffix}</span>;
}

export function Stats({ sectionId = "stats" }) {
  const { content } = useSiteData();
  const stats = content.stats?.items || [];

  if (!stats.length) return null;

  return (
    <section id={sectionId || undefined} className="relative py-20">
      <div className="mx-auto max-w-7xl px-4">
        <div className="relative overflow-hidden rounded-3xl glass-strong border-glow p-8 md:p-12 shadow-elegant">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-gradient-primary opacity-30 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
          <div className="relative grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="text-center"
              >
                <div className="font-display text-4xl font-bold text-gradient md:text-5xl">
                  <Counter to={s.value} suffix={s.suffix} />
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
