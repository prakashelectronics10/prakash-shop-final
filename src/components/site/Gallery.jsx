import { useState } from "react";
import { motion } from "framer-motion";
import { Expand } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { Lightbox } from "./Lightbox";

export function Gallery() {
  const { content } = useSiteData();
  const section = content.gallery || {};
  const items = (section.items || []).filter((item) => item.isActive !== false).map((item) => ({
    ...item,
    src: item.src || item.imageUrl || item.url,
    label: item.label || item.title || item.alt || "Gallery image",
    description: item.description || item.desc || "",
    size: item.size || item.imageSize || "square",
  }));
  const [active, setActive] = useState(null);

  if (!items.length) return null;

  return (
    <section id="gallery" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
            {section.eyebrow}
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl md:text-5xl">
            {section.title} <span className="text-gradient">{section.highlight}</span>
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4 md:auto-rows-[200px]">
          {items.map((it, i) => {
            const sizeClass = {
              portrait: "md:row-span-2",
              landscape: "md:col-span-2",
              wide: "md:col-span-2",
              tall: "md:row-span-2",
              banner: "md:col-span-4",
              square: "",
            }[it.size] || "";
            return (
            <motion.button
              type="button"
              key={`${it.label}-${i}`}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              onClick={() => setActive(i)}
              aria-label={`Open ${it.label} in lightbox`}
              className={`group relative cursor-zoom-in overflow-hidden rounded-2xl glass border-glow shadow-card text-left ${it.span || sizeClass}`}
            >
              <img
                src={it.src}
                alt={it.label}
                loading="lazy"
                decoding="async"
                width={800}
                height={800}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent opacity-90" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary shadow-glow">
                  <Expand className="h-5 w-5 text-primary-foreground" />
                </div>
              </div>
              <div className="absolute bottom-3 left-3 rounded-full glass-strong px-3 py-1 text-xs font-medium">
                {it.label}
              </div>
              {it.description ? (
                <div className="absolute bottom-12 left-3 right-3 hidden rounded-xl glass-strong px-3 py-2 text-xs text-muted-foreground md:block">
                  {it.description}
                </div>
              ) : null}
            </motion.button>
          );})}
        </div>
      </div>

      <Lightbox
        items={items}
        index={active}
        onClose={() => setActive(null)}
        onIndexChange={setActive}
      />
    </section>
  );
}
