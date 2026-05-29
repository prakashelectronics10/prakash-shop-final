const MAX_STOCK_QUANTITY = 9999;

function normalizeStockQuantity(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_STOCK_QUANTITY, Math.max(1, parsed));
}

function isOutOfStock(product = {}) {
  return String(product.availability || "").toLowerCase().includes("out of stock");
}

function availableStockQuantity(product = {}, field = "quantity") {
  if (isOutOfStock(product)) return 0;
  const parsed = Number.parseInt(product[field] ?? product.stock ?? product.quantity, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(MAX_STOCK_QUANTITY, Math.max(0, parsed));
}

module.exports = {
  MAX_STOCK_QUANTITY,
  availableStockQuantity,
  isOutOfStock,
  normalizeStockQuantity,
};
