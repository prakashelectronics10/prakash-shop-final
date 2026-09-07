import { useMemo } from "react";
import { useSiteData } from "../../context/SiteDataContext";
import { CircularTestimonials } from "../ui/CircularTestimonials";

function firstImage(item = {}) {
  return item.originalUrl || item.imageUrl || item.src || item.url || "";
}

export function AboutStoryShowcase() {
  const { content } = useSiteData();
  const section = content.aboutShowcase || {};
  const items = useMemo(() => {
    const managedItems = (Array.isArray(section.items) ? section.items : [])
      .filter((item) => item?.isActive !== false)
      .map((item) => ({
        name: item.name || item.title || "Prakash Electronics",
        designation: item.designation || item.role || "Customer story",
        quote: item.quote || item.text || item.description || "",
        src: firstImage(item),
      }))
      .filter((item) => item.src && (item.name || item.quote));
    if (managedItems.length) return managedItems;

    const gallery = Array.isArray(content.gallery?.items) ? content.gallery.items : [];
    const imageFor = (terms, fallbackIndex) => {
      const match = gallery.find((item) => terms.some((term) => `${item.label || ""} ${item.caption || ""}`.toLowerCase().includes(term)));
      return firstImage(match || gallery[fallbackIndex]);
    };
    return [
      {
        name: "Prakash Electronics",
        designation: "Local electronics specialists",
        quote: "Experienced diagnostics, practical advice, and tested repair work for everyday electronics and appliances.",
        src: imageFor(["founder", "prakash mahto"], 0),
      },
      {
        name: "Workshop service",
        designation: "Repair and maintenance",
        quote: "Each repair begins with the actual fault, followed by a clear recommendation and careful workmanship.",
        src: imageFor(["workshop", "repair"], 1),
      },
      {
        name: "Product support",
        designation: "Sales and guidance",
        quote: "Customers can compare useful electronics, electrical accessories, and compatible parts with direct local support.",
        src: imageFor(["sales", "shop"], 2),
      },
    ].filter((item) => item.src);
  }, [content.gallery, section.items]);

  if (!items.length) return null;

  return (
    <section className="about-story-showcase" aria-label="Prakash Electronics stories">
      <div className="internal-page-section-head">
        <p className="internal-page-kicker">{section.eyebrow || "Our story"}</p>
        <h2>{section.title || "Experience built around"} <span>{section.highlight || "real service"}</span></h2>
        <p>{section.description || "A closer look at the people, work, and practical support behind Prakash Electronics."}</p>
      </div>
      <CircularTestimonials testimonials={items} autoplay={section.autoplay !== false} />
    </section>
  );
}
