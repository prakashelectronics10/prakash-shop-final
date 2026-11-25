const crypto = require("crypto");
const { resolveProductPricing } = require("./productPricing");
const { availableStockQuantity, normalizeStockQuantity } = require("./inventory");

const DISPLAY_TYPES = ["auto", "image_text", "color_text", "text"];
const HEX_COLOUR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function createVariantId(prefix = "v") {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function cleanText(value, fallback = "", max = 120) {
  return String(value ?? fallback).replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanHexColour(value) {
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

function sortedOptionIds(optionIds = []) {
  return [...new Set((optionIds || []).map((id) => String(id || "").trim()).filter(Boolean))].sort();
}

function optionIdsKey(optionIds = []) {
  return sortedOptionIds(optionIds).join("|");
}

function productHasVariants(product = {}) {
  return Boolean(product?.hasVariants) && Array.isArray(product?.variantGroups) && product.variantGroups.length > 0;
}

function sortedGroups(product = {}) {
  return [...(product.variantGroups || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

function sortedOptions(group = {}) {
  return [...(group.options || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

function findOption(product, optionId) {
  const id = String(optionId || "").trim();
  if (!id) return null;
  for (const group of product.variantGroups || []) {
    const option = (group.options || []).find((item) => String(item.id) === id);
    if (option) return { group, option };
  }
  return null;
}

function findCombinationById(product, combinationId) {
  const id = String(combinationId || "").trim();
  if (!id) return null;
  return (product.variantCombinations || []).find((item) => String(item.id) === id) || null;
}

function findCombinationByOptionIds(product, optionIds = []) {
  const key = optionIdsKey(optionIds);
  if (!key) return null;
  return (product.variantCombinations || []).find((item) => optionIdsKey(item.optionIds) === key) || null;
}

function resolveOptionDisplayType(group = {}, option = {}) {
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

function selectionLabels(product, optionIds = []) {
  const labels = [];
  for (const group of sortedGroups(product)) {
    const selected = sortedOptions(group).find((option) => optionIds.includes(String(option.id)));
    if (selected) {
      labels.push({ groupId: group.id, groupName: group.name, optionId: selected.id, label: selected.label });
    }
  }
  return labels;
}

function formatVariantSummary(product, optionIds = []) {
  return selectionLabels(product, optionIds)
    .map((item) => `${item.groupName}: ${item.label}`)
    .join(", ");
}

function optionPriceAdjustments(product, optionIds = []) {
  return optionIds.reduce((sum, optionId) => {
    const found = findOption(product, optionId);
    const adjustment = toFiniteOrNull(found?.option?.priceAdjustment);
    return sum + (adjustment || 0);
  }, 0);
}

function resolveVariantPricing(product = {}, combination = null) {
  const base = resolveProductPricing(product);
  if (!combination) return base;

  const absolute = toFiniteOrNull(combination.price);
  if (absolute !== null && absolute >= 0) {
    const mrp = base.mrp !== null && base.mrp > absolute ? base.mrp : absolute;
    return {
      ...base,
      price: absolute,
      mrp,
      showMrp: mrp !== null && mrp > absolute,
    };
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

function resolveVariantStock(product = {}, combination = null) {
  if (!productHasVariants(product)) {
    return availableStockQuantity(product, "quantity");
  }
  if (!combination || combination.isAvailable === false) return 0;
  if (/out of stock|not available/i.test(String(product.availability || ""))) return 0;
  if (combination.stock === null || combination.stock === undefined || combination.stock === "") {
    return availableStockQuantity(product, "quantity");
  }
  return normalizeStockQuantity(combination.stock, 0);
}

function resolveVariantAvailability(product = {}, combination = null) {
  const stock = resolveVariantStock(product, combination);
  if (!productHasVariants(product)) return product.availability || "In Stock";
  if (!combination || combination.isAvailable === false || stock < 1) return "Out of Stock";
  if (stock <= 3) return "Low Stock";
  return "In Stock";
}

function resolveVariantImage(product = {}, combination = null, optionIds = []) {
  if (combination?.imageUrl) return combination.imageUrl;
  const ids = combination?.optionIds || optionIds;
  for (const group of sortedGroups(product)) {
    const selected = (group.options || []).find((option) => ids.includes(String(option.id)) && option.imageUrl);
    if (selected?.imageUrl) return selected.imageUrl;
  }
  return product.imageUrl || "";
}

function resolveVariantSku(product = {}, combination = null) {
  if (combination?.sku) return String(combination.sku).trim().toUpperCase();
  return String(product.sku || "").trim().toUpperCase();
}

function defaultOptionIds(product = {}) {
  const ids = [];
  for (const group of sortedGroups(product)) {
    const options = sortedOptions(group);
    const preferred = options.find((option) => option.isDefault) || options[0];
    if (preferred?.id) ids.push(String(preferred.id));
  }
  return ids;
}

function resolveSelectedCombination(product = {}, { combinationId = "", optionIds = [] } = {}) {
  if (!productHasVariants(product)) return null;
  if (combinationId) {
    const byId = findCombinationById(product, combinationId);
    if (byId) return byId;
  }
  const selectedIds = sortedOptionIds(optionIds.length ? optionIds : defaultOptionIds(product));
  const byOptions = findCombinationByOptionIds(product, selectedIds);
  if (byOptions && (optionIds.length || resolveVariantStock(product, byOptions) > 0)) return byOptions;
  const available = (product.variantCombinations || []).find((item) => item.isAvailable !== false && resolveVariantStock(product, item) > 0);
  return available || byOptions || product.variantCombinations?.[0] || null;
}

function cartesianGroups(groups = []) {
  if (!groups.length) return [[]];
  return groups.reduce((acc, group) => {
    const options = sortedOptions(group);
    if (!options.length) return acc;
    const next = [];
    for (const prefix of acc) {
      for (const option of options) {
        next.push([...prefix, String(option.id)]);
      }
    }
    return next;
  }, [[]]);
}

function sanitizeVariantOption(raw = {}, index = 0, existingId = "") {
  const label = cleanText(raw.label, `Option ${index + 1}`, 80);
  if (!label) return null;
  return {
    id: cleanText(raw.id, existingId || createVariantId("opt"), 64) || createVariantId("opt"),
    label,
    imageUrl: cleanText(raw.imageUrl, "", 2048),
    imagePublicId: cleanText(raw.imagePublicId, "", 256),
    colour: cleanHexColour(raw.colour),
    priceAdjustment: toFiniteOrNull(raw.priceAdjustment),
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index,
    isDefault: Boolean(raw.isDefault),
  };
}

function sanitizeVariantGroup(raw = {}, index = 0) {
  const name = cleanText(raw.name, `Variant ${index + 1}`, 60);
  if (!name) return null;
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .map((option, optionIndex) => sanitizeVariantOption(option, optionIndex))
    .filter(Boolean)
    .slice(0, 40);
  if (!options.length) return null;
  let defaultSeen = false;
  const normalizedOptions = options.map((option) => {
    if (option.isDefault && !defaultSeen) {
      defaultSeen = true;
      return option;
    }
    return { ...option, isDefault: false };
  });
  if (!defaultSeen && normalizedOptions[0]) normalizedOptions[0].isDefault = true;
  return {
    id: cleanText(raw.id, createVariantId("grp"), 64) || createVariantId("grp"),
    name,
    displayType: DISPLAY_TYPES.includes(raw.displayType) ? raw.displayType : "auto",
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index,
    options: normalizedOptions,
  };
}

function sanitizeVariantCombination(raw = {}, index = 0, validOptionIds = new Set()) {
  const optionIds = sortedOptionIds(raw.optionIds).filter((id) => validOptionIds.has(id));
  if (!optionIds.length) return null;
  return {
    id: cleanText(raw.id, createVariantId("cmb"), 64) || createVariantId("cmb"),
    optionIds,
    sku: cleanText(raw.sku, "", 64).toUpperCase(),
    price: toFiniteOrNull(raw.price),
    priceAdjustment: toFiniteOrNull(raw.priceAdjustment),
    stock: raw.stock === "" || raw.stock === null || raw.stock === undefined
      ? null
      : normalizeStockQuantity(raw.stock, 0),
    isAvailable: raw.isAvailable !== false,
    imageUrl: cleanText(raw.imageUrl, "", 2048),
    imagePublicId: cleanText(raw.imagePublicId, "", 256),
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index,
  };
}

function ensureCombinationsCoverGroups(groups = [], combinations = []) {
  const expectedKeys = new Set(cartesianGroups(groups).map((ids) => optionIdsKey(ids)));
  const byKey = new Map(combinations.map((item) => [optionIdsKey(item.optionIds), item]));
  const ensured = [];
  let index = 0;
  for (const key of expectedKeys) {
    const optionIds = key.split("|").filter(Boolean);
    const existing = byKey.get(key);
    if (existing) {
      ensured.push({ ...existing, optionIds, sortOrder: index });
    } else {
      ensured.push({
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
      });
    }
    index += 1;
  }
  return ensured;
}

function sanitizeProductVariants(input = {}, { autoFillCombinations = true } = {}) {
  const hasVariants = Boolean(input.hasVariants);
  if (!hasVariants) {
    return {
      hasVariants: false,
      variantGroups: [],
      variantCombinations: [],
    };
  }

  const groups = (Array.isArray(input.variantGroups) ? input.variantGroups : [])
    .map((group, index) => sanitizeVariantGroup(group, index))
    .filter(Boolean)
    .slice(0, 8);

  if (!groups.length) {
    return {
      hasVariants: false,
      variantGroups: [],
      variantCombinations: [],
    };
  }

  const validOptionIds = new Set();
  groups.forEach((group) => group.options.forEach((option) => validOptionIds.add(String(option.id))));

  let combinations = (Array.isArray(input.variantCombinations) ? input.variantCombinations : [])
    .map((item, index) => sanitizeVariantCombination(item, index, validOptionIds))
    .filter(Boolean);

  if (autoFillCombinations) {
    combinations = ensureCombinationsCoverGroups(groups, combinations);
  }

  const seenSku = new Set();
  combinations = combinations.map((item, index) => {
    let sku = item.sku;
    if (sku) {
      if (seenSku.has(sku)) sku = `${sku}-${index + 1}`;
      seenSku.add(sku);
    }
    return { ...item, sku, sortOrder: index };
  });

  return {
    hasVariants: true,
    variantGroups: groups,
    variantCombinations: combinations,
  };
}

function collectVariantImagePublicIds(product = {}) {
  const ids = [];
  for (const group of product.variantGroups || []) {
    for (const option of group.options || []) {
      if (option.imagePublicId) ids.push(option.imagePublicId);
    }
  }
  for (const combination of product.variantCombinations || []) {
    if (combination.imagePublicId) ids.push(combination.imagePublicId);
  }
  return ids;
}

function assertOrderableVariant(product, { combinationId = "", optionIds = [], quantity = 1 } = {}) {
  if (!productHasVariants(product)) return null;
  if (!Array.isArray(optionIds)) {
    const error = new Error("Please reselect a valid product variant");
    error.statusCode = 400;
    throw error;
  }
  const combination = combinationId
    ? findCombinationById(product, combinationId)
    : optionIds.length
      ? findCombinationByOptionIds(product, optionIds)
      : resolveSelectedCombination(product);
  if (!combination || (optionIds.length && optionIdsKey(combination.optionIds) !== optionIdsKey(optionIds))) {
    const error = new Error("Please reselect a valid product variant");
    error.statusCode = 400;
    throw error;
  }
  if (combination.isAvailable === false) {
    const error = new Error(`${product.name} variant is not available`);
    error.statusCode = 409;
    throw error;
  }
  const stock = resolveVariantStock(product, combination);
  if (stock < quantity) {
    const error = new Error(`${product.name} has only ${stock} item${stock === 1 ? "" : "s"} available for the selected variant`);
    error.statusCode = 409;
    throw error;
  }
  const pricing = resolveVariantPricing(product, combination);
  if (!Number.isFinite(pricing.price) || pricing.price <= 0) {
    const error = new Error(`${product.name} does not have an online purchase price for the selected variant`);
    error.statusCode = 409;
    throw error;
  }
  return {
    combination,
    pricing,
    stock,
    availability: resolveVariantAvailability(product, combination),
    imageUrl: resolveVariantImage(product, combination),
    sku: resolveVariantSku(product, combination),
    summary: formatVariantSummary(product, combination.optionIds),
    selections: selectionLabels(product, combination.optionIds),
  };
}

function buildVariantShareQuery(combinationId = "") {
  const id = cleanText(combinationId, "", 64);
  return id ? `v=${encodeURIComponent(id)}` : "";
}

module.exports = {
  DISPLAY_TYPES,
  assertOrderableVariant,
  buildVariantShareQuery,
  collectVariantImagePublicIds,
  createVariantId,
  defaultOptionIds,
  findCombinationById,
  findCombinationByOptionIds,
  findOption,
  formatVariantSummary,
  optionIdsKey,
  productHasVariants,
  resolveOptionDisplayType,
  resolveSelectedCombination,
  resolveVariantAvailability,
  resolveVariantImage,
  resolveVariantPricing,
  resolveVariantSku,
  resolveVariantStock,
  sanitizeProductVariants,
  selectionLabels,
  sortedGroups,
  sortedOptions,
  sortedOptionIds,
};
