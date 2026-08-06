export function normalizeGalleryItems(section = {}) {
  return (section.items || [])
    .filter((item) => item.isActive !== false)
    .map((item) => ({
      ...item,
      src: item.src || item.imageUrl || item.url,
      label: item.label || item.title || item.alt || "Gallery image",
      description: item.description || item.desc || "",
      size: item.size || item.imageSize || "square",
    }))
    .filter((item) => item.src);
}

export function gallerySizeClass(size) {
  return (
    {
      portrait: "md:row-span-2",
      landscape: "md:col-span-2",
      wide: "md:col-span-2",
      tall: "md:row-span-2",
      banner: "md:col-span-4",
      square: "",
    }[size] || ""
  );
}
