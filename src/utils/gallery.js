export function normalizeGalleryItems(section = {}) {
  return (section.items || [])
    .filter((item) => item && item.isActive !== false)
    .map((item) => ({
      ...item,
      src: item.imageUrl || item.src || item.url,
      label: item.label || item.title || item.alt || "Gallery image",
      description: item.description || item.desc || "",
      size: item.size || item.imageSize || "square",
    }))
    .filter((item) => item.src);
}

export const GALLERY_RATIO_PRESETS = [
  ["1:1", "Square"],
  ["4:3", "Standard"],
  ["3:2", "Landscape"],
  ["16:9", "Wide"],
  ["21:9", "Panoramic"],
  ["4:5", "Portrait"],
  ["2:3", "Tall"],
  ["9:16", "Vertical"],
];

export const GALLERY_DESKTOP_QUERY = "(min-width: 768px)";
const LEGACY_RATIOS = new Map([
  ["portrait", "4:5"], ["landscape", "3:2"], ["wide", "16:9"], ["tall", "2:3"], ["banner", "3:1"],
]);

function parseRatio(value) {
  const match = /^(\d{1,6}(?:\.\d{1,4})?)\s*[:/]\s*(\d{1,6}(?:\.\d{1,4})?)$/.exec(String(value || "").trim());
  if (!match) return "";
  const ratio = Number(match[1]) / Number(match[2]);
  return ratio >= 0.4 && ratio <= 3 ? `${Number(match[1])}:${Number(match[2])}` : "";
}

export function galleryAspectRatio(item) {
  const saved = parseRatio(item.aspectRatio);
  if (saved) return saved;
  const span = String(item.span || "");
  if (/\bcol-span-4\b/.test(span)) return "3:1";
  if (/\bcol-span-3\b/.test(span)) return "21:9";
  if (/\bcol-span-2\b/.test(span)) return /\brow-span-2\b/.test(span) ? "4:3" : "16:9";
  if (/\brow-span-2\b/.test(span)) return "2:3";
  return LEGACY_RATIOS.get(item.size || item.imageSize) || "1:1";
}

export function galleryRatioValue(aspectRatio) {
  const [width, height] = aspectRatio.split(":").map(Number);
  return width / height;
}

export function galleryRatioFromResize(width, height) {
  const scaled = Math.round(Math.min(3, Math.max(0.4, width / height)) * 100);
  const preset = GALLERY_RATIO_PRESETS.find(([ratio]) => Math.round(galleryRatioValue(ratio) * 100) === scaled);
  return preset?.[0] || `${scaled}:100`;
}

export function galleryRows(items, mode) {
  const target = mode === "desktop" ? 4.25 : 2.1;
  const maxItems = mode === "desktop" ? 6 : 4;
  const tiles = items.map((item, index) => ({ item, index, ratio: galleryRatioValue(galleryAspectRatio(item)) }));
  const best = Array(tiles.length + 1);
  best[tiles.length] = { cost: 0, end: tiles.length };

  // Choose row breaks together so an early break does not strand a narrow last tile.
  for (let start = tiles.length - 1; start >= 0; start -= 1) {
    let totalRatio = 0;
    for (let end = start + 1; end <= Math.min(tiles.length, start + maxItems); end += 1) {
      totalRatio += tiles[end - 1].ratio;
      const narrowSingleTileCost = end === start + 1 && totalRatio < target ? 0.25 : 0;
      const cost = Math.log(totalRatio / target) ** 2 + narrowSingleTileCost + best[end].cost;
      if (!best[start] || cost < best[start].cost) best[start] = { cost, end };
    }
  }

  const rows = [];
  for (let start = 0; start < tiles.length; start = best[start].end) {
    rows.push(tiles.slice(start, best[start].end));
  }
  return rows;
}

export function moveGalleryItem(items, id, targetId) {
  const from = items.findIndex((item) => item.id === id);
  const to = items.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return items;
  const ordered = [...items];
  const [item] = ordered.splice(from, 1);
  ordered.splice(to, 0, item);
  return ordered;
}

export function galleryItemsForSave(items) {
  return items
    .filter((item) => item.imageUrl || item.src || item.url || item.label)
    .map((item, index) => ({ ...item, aspectRatio: galleryAspectRatio(item), displayOrder: index + 1 }));
}
