const DISPLAY_TYPES = ["auto", "image_text", "color_text", "text"];
const HEX_COLOUR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function createVariantId(prefix = "v") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value, fallback = "", max = 120) {
  return String(value ?? fallback).replace(/\s+/g, " ").trim().slice(0, max);
}

export function cleanHexColour(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  return HEX_COLOUR.test(withHash) ? withHash.toUpperCase() : "";
}

function toFiniteOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function sortedOptionIds(optionIds = []) {
  return [...new Set((optionIds || []).map((id) => String(id || "").trim()).filter(Boolean))].sort();
}

export function optionIdsKey(optionIds = []) {
  return sortedOptionIds(optionIds).join("|");
}

export function productHasVariants(product = {}) {
  return Boolean(product?.hasVariants) && Array.isArray(product?.variantGroups) && product.variantGroups.length > 0;
}

export function sortedGroups(product = {}) {
  return [...(product.variantGroups || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export function sortedOptions(group = {}) {
  return [...(group.options || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export function findCombinationById(product, combinationId) {
  const id = String(combinationId || "").trim();
  if (!id) return null;
  return (product.variantCombinations || []).find((item) => String(item.id) === id) || null;
}

export function findCombinationByOptionIds(product, optionIds = []) {
  const key = optionIdsKey(optionIds);
  if (!key) return null;
  return (product.variantCombinations || []).find((item) => optionIdsKey(item.optionIds) === key) || null;
}

export function resolveOptionDisplayType(group = {}, option = {}) {
  const requested = DISPLAY_TYPES.includes(group.displayType) ? group.displayType : "auto";
  const hasImage = Boolean(cleanText(option.imageUrl));
  const hasColour = Boolean(cleanHexColour(option.colour));
  if (requested === "image_text") return hasImage ? "image_text" : "text";
  if (requested === "color_text") return hasColour ? "color_text" : "text";
  if (requested === "text") return "text";
  if (hasImage) return "image_text";
  if (hasColour) return "color_text";
  return "text";
}

export function selectionLabels(product, optionIds = []) {
  const labels = [];
  for (const group of sortedGroups(product)) {
    const selected = sortedOptions(group).find((option) => optionIds.includes(String(option.id)));
    if (selected) {
      labels.push({
        groupId: group.id,
        groupName: group.name,
        optionId: selected.id,
        label: selected.label,
      });
    }
  }
  return labels;
}

export function formatVariantSummary(product, optionIds = []) {
  return selectionLabels(product, optionIds)
    .map((item) => `${item.groupName}: ${item.label}`)
    .join(", ");
}

function optionPriceAdjustments(product, optionIds = []) {
  return optionIds.reduce((sum, optionId) => {
    for (const group of product.variantGroups || []) {
      const option = (group.options || []).find((item) => String(item.id) === String(optionId));
      if (option) {
        const adjustment = toFiniteOrNull(option.priceAdjustment);
        return sum + (adjustment || 0);
      }
    }
    return sum;
  }, 0);
}

export function resolveVariantPricing(product = {}, combination = null, resolveProductPricing) {
  const base = typeof resolveProductPricing === "function"
    ? resolveProductPricing(product)
    : {
      mrp: toFiniteOrNull(product.mrp),
      price: toFiniteOrNull(product.price),
      discountPercent: toFiniteOrNull(product.discountPercent),
    };
  if (!combination) return base;

  const absolute = toFiniteOrNull(combination.price);
  if (absolute !== null && absolute >= 0) {
    const mrp = base.mrp !== null && base.mrp > absolute ? base.mrp : absolute;
    return { ...base, price: absolute, mrp, showMrp: mrp !== null && mrp > absolute };
  }

  const combinationAdjustment = toFiniteOrNull(combination.priceAdjustment) || 0;
  const optionAdjustment = optionPriceAdjustments(product, combination.optionIds || []);
  const nextPrice = Math.max(0, Math.round((base.price || 0) + combinationAdjustment + optionAdjustment));
  const mrp = base.mrp !== null && base.mrp > nextPrice ? base.mrp : (base.mrp ?? nextPrice);
  return {
    ...base,
    price: nextPrice,
    mrp,
    showMrp: mrp !== null && nextPrice !== null && mrp > nextPrice,
  };
}

export function resolveVariantStock(product = {}, combination = null) {
  if (!productHasVariants(product)) {
    const parsed = Number.parseInt(product.stockQuantity ?? product.quantity ?? product.stock, 10);
    if (/out of stock|not available/i.test(String(product.availability || ""))) return 0;
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  if (!combination || combination.isAvailable === false) return 0;
  if (combination.stock === null || combination.stock === undefined || combination.stock === "") {
    const parsed = Number.parseInt(product.quantity ?? product.stock ?? product.stockQuantity ?? 1, 10);
    if (/out of stock|not available/i.test(String(product.availability || ""))) return 0;
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  if (/out of stock|not available/i.test(String(product.availability || ""))) return 0;
  const stock = Number.parseInt(combination.stock, 10);
  return Number.isFinite(stock) ? Math.max(0, Math.min(9999, stock)) : 0;
}

export function resolveVariantAvailability(product = {}, combination = null) {
  const stock = resolveVariantStock(product, combination);
  if (!productHasVariants(product)) return product.availability || "In Stock";
  if (!combination || combination.isAvailable === false || stock < 1) return "Out of Stock";
  if (stock <= 3) return "Low Stock";
  return "In Stock";
}

export function resolveVariantImage(product = {}, combination = null, optionIds = []) {
  if (combination?.imageUrl) return combination.imageUrl;
  const ids = combination?.optionIds || optionIds;
  for (const group of sortedGroups(product)) {
    const selected = (group.options || []).find((option) => ids.map(String).includes(String(option.id)) && option.imageUrl);
    if (selected?.imageUrl) return selected.imageUrl;
  }
  return "";
}

export function resolveVariantSku(product = {}, combination = null) {
  if (combination?.sku) return String(combination.sku).trim().toUpperCase();
  return String(product.sku || "").trim().toUpperCase();
}

export function defaultOptionIds(product = {}) {
  const ids = [];
  for (const group of sortedGroups(product)) {
    const options = sortedOptions(group);
    const preferred = options.find((option) => option.isDefault) || options[0];
    if (preferred?.id) ids.push(String(preferred.id));
  }
  return ids;
}

export function resolveSelectedCombination(product = {}, { combinationId = "", optionIds = [] } = {}) {
  if (!productHasVariants(product)) return null;
  if (combinationId) {
    const byId = findCombinationById(product, combinationId);
    if (byId) return byId;
  }
  const selectedIds = sortedOptionIds(optionIds.length ? optionIds : defaultOptionIds(product));
  const byOptions = findCombinationByOptionIds(product, selectedIds);
  if (byOptions && (optionIds.length || resolveVariantStock(product, byOptions) > 0)) return byOptions;
  const available = (product.variantCombinations || []).find((item) => (
    item.isAvailable !== false && resolveVariantStock(product, item) > 0
  ));
  return available || byOptions || product.variantCombinations?.[0] || null;
}

export function findCombinationForOption(product, optionId, currentOptionIds = [], { availableOnly = true } = {}) {
  const option = String(optionId);
  const selected = new Set(currentOptionIds.map(String));
  let best = null;
  let bestScore = -1;

  for (const combination of product.variantCombinations || []) {
    const ids = (combination.optionIds || []).map(String);
    if (!ids.includes(option) || (availableOnly && resolveVariantStock(product, combination) < 1)) continue;
    const score = ids.filter((id) => selected.has(id)).length;
    if (score <= bestScore) continue;
    best = combination;
    bestScore = score;
  }
  return best;
}

export function readVariantIdFromLocation(search = "") {
  if (typeof window === "undefined" && !search) return "";
  const params = new URLSearchParams(search || window.location.search);
  return String(params.get("v") || params.get("variant") || "").trim();
}

export function buildVariantSharePath(basePath, combinationId = "") {
  const id = cleanText(combinationId, "", 64);
  if (!id) return basePath;
  const joiner = basePath.includes("?") ? "&" : "?";
  return `${basePath}${joiner}v=${encodeURIComponent(id)}`;
}

export function emptyVariantState() {
  return {
    hasVariants: false,
    variantGroups: [],
    variantCombinations: [],
  };
}

function cartesianGroups(groups = []) {
  if (!groups.length) return [[]];
  return groups.reduce((acc, group) => {
    const options = sortedOptions(group);
    if (!options.length) return acc;
    const next = [];
    for (const prefix of acc) {
      for (const option of options) next.push([...prefix, String(option.id)]);
    }
    return next;
  }, [[]]);
}

export function ensureCombinationsFromGroups(groups = [], combinations = []) {
  const expected = cartesianGroups(groups);
  const byKey = new Map(combinations.map((item) => [optionIdsKey(item.optionIds), item]));
  return expected.map((optionIds, index) => {
    const existing = byKey.get(optionIdsKey(optionIds));
    if (existing) return { ...existing, optionIds, sortOrder: index };
    return {
      id: createVariantId("cmb"),
      optionIds,
      sku: "",
      price: null,
      priceAdjustment: null,
      stock: null,
      isAvailable: true,
      imageUrl: "",
      imagePublicId: "",
      sortOrder: index,
    };
  });
}

export { DISPLAY_TYPES };
