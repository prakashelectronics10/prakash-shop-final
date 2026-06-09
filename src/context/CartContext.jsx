import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const SCIENCE_PROJECTS_CATEGORY = "Science Projects and Parts";

const CART_STORAGE_KEY = "prakash:guest-cart:v1";
const MAX_QUANTITY = 99;

const CartContext = createContext(null);

function safeString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampQuantity(value, maxQuantity = MAX_QUANTITY) {
  const parsed = Number.parseInt(value, 10);
  const cap = Number.isFinite(maxQuantity) ? Math.max(1, maxQuantity) : MAX_QUANTITY;
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(cap, Math.max(1, parsed));
}

function isUnavailable(availability = "") {
  return String(availability || "").toLowerCase().includes("out of stock");
}

export function getCartStockLimit(item = {}) {
  if (isUnavailable(item.availability)) return 0;
  const parsed = Number.parseInt(
    item.stockQuantity ?? item.availableQuantity ?? item.quantityAvailable ?? item.stock ?? (!item.cartId ? item.quantity : undefined),
    10,
  );
  if (!Number.isFinite(parsed)) return MAX_QUANTITY;
  return Math.min(MAX_QUANTITY, Math.max(0, parsed));
}

export function cartStockMessage(item = {}) {
  const limit = getCartStockLimit(item);
  if (limit < 1) return "This product is out of stock.";
  return `Only ${limit} item${limit > 1 ? "s" : ""} available.`;
}

function isProjectPart(product = {}, overrides = {}) {
  const type = safeString(overrides.sourceType || product.sourceType || product.sourceCollection).toLowerCase();
  return type.includes("project-part") || type.includes("project_parts") || type.includes("project-parts");
}

function storageRead() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(CART_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(sanitizeCartItem).filter(Boolean) : [];
  } catch (_error) {
    return [];
  }
}

function storageWrite(items) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch (_error) {
    // Session storage can be unavailable in restrictive browser modes.
  }
}

function sourceKey(product = {}, overrides = {}) {
  const projectPart = isProjectPart(product, overrides);
  return safeString(
    overrides.sourceType || product.sourceType || product.sourceCollection,
    projectPart ? "project-part" : "shop-product",
  )
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function createCartProduct(product = {}, overrides = {}) {
  const projectPart = isProjectPart(product, overrides);
  const sourceType = sourceKey(product, overrides);
  const sourceId = safeString(
    overrides.sourceId ||
      product.sourceId ||
      product.productId ||
      product._id ||
      product.id ||
      product.slug ||
      product.name,
  );
  const rawCategory = safeString(overrides.productCategory || overrides.category || product.productCategory || product.category);
  const originalCategory = safeString(overrides.originalCategory || product.originalCategory || (projectPart ? rawCategory : ""));
  const category = projectPart ? SCIENCE_PROJECTS_CATEGORY : safeString(rawCategory, "Electronics");
  const name = safeString(overrides.productName || overrides.name || product.productName || product.name, "Product");
  const cartId = `${sourceType}:${sourceId || name.toLowerCase().replace(/\s+/g, "-")}`;
  const availability = safeString(overrides.availability || product.availability, "Available");
  const rawStockQuantity =
    overrides.stockQuantity ??
    overrides.availableQuantity ??
    overrides.quantityAvailable ??
    product.stockQuantity ??
    product.availableQuantity ??
    product.quantityAvailable ??
    product.stock ??
    (!product.cartId ? product.quantity : undefined);
  const stockQuantity = getCartStockLimit({ stockQuantity: rawStockQuantity, availability });
  const rawCartQuantity = overrides.cartQuantity ?? overrides.itemQuantity ?? overrides.quantity ?? (product.cartId ? product.quantity : 1);

  return {
    cartId,
    sourceType,
    sourceId,
    productId: safeString(overrides.productId || product.productId || product._id || product.id || sourceId),
    productSlug: safeString(overrides.productSlug || product.productSlug || product.slug),
    productName: name,
    productCategory: category,
    originalCategory,
    productImageUrl: safeString(overrides.productImageUrl || overrides.imageUrl || product.productImageUrl || product.imageUrl),
    productDescription: safeString(
      overrides.productDescription ||
        overrides.description ||
        product.productDescription ||
        product.shortDescription ||
        product.description,
    ),
    availability,
    stockQuantity,
    availableQuantity: stockQuantity,
    price: safeNumber(overrides.price ?? product.price),
    quantity: clampQuantity(rawCartQuantity, stockQuantity || 1),
    addedAt: overrides.addedAt || product.addedAt || new Date().toISOString(),
  };
}

function sanitizeCartItem(item) {
  if (!item || typeof item !== "object") return null;
  const normalized = createCartProduct(item, item);
  if (!normalized.productName) return null;
  if (getCartStockLimit(normalized) < 1) return null;
  return normalized;
}

export function cartItemToBookingProduct(item) {
  const normalized = createCartProduct(item, item);
  return {
    productId: normalized.productId,
    productSlug: normalized.productSlug,
    productName: normalized.productName,
    productCategory: normalized.productCategory,
    originalCategory: normalized.originalCategory,
    productImageUrl: normalized.productImageUrl,
    productDescription: normalized.productDescription,
    price: normalized.price,
    quantity: normalized.quantity,
    stockQuantity: normalized.stockQuantity,
    sourceType: normalized.sourceType,
    sourceId: normalized.sourceId,
  };
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(storageRead);

  useEffect(() => {
    storageWrite(items);
  }, [items]);

  const addItem = useCallback((product, overrides = {}) => {
    const nextItem = createCartProduct(product, overrides);
    const limit = getCartStockLimit(nextItem);
    if (limit < 1) {
      return { item: nextItem, status: "blocked", message: cartStockMessage(nextItem) };
    }

    const found = items.find((item) => item.cartId === nextItem.cartId);
    const requestedQuantity = (found?.quantity || 0) + nextItem.quantity;
    const nextQuantity = clampQuantity(requestedQuantity, limit);
    const nextCartItem = {
      ...(found || nextItem),
      ...nextItem,
      addedAt: found?.addedAt || nextItem.addedAt,
      quantity: nextQuantity,
    };

    setItems((current) => {
      if (found) {
        return current.map((item) => (item.cartId === nextItem.cartId ? nextCartItem : item));
      }
      return [nextCartItem, ...current];
    });

    return {
      item: nextCartItem,
      status: requestedQuantity > limit ? "limited" : "added",
      message: requestedQuantity > limit ? cartStockMessage(nextCartItem) : "",
    };
  }, [items]);

  const updateQuantity = useCallback((cartId, quantity) => {
    const found = items.find((item) => item.cartId === cartId);
    const limit = found ? getCartStockLimit(found) : MAX_QUANTITY;
    const nextQuantity = clampQuantity(quantity, limit);
    setItems((current) =>
      current.map((item) =>
        item.cartId === cartId ? { ...item, quantity: nextQuantity } : item,
      ),
    );
    return {
      status: Number(quantity) > limit ? "limited" : "updated",
      message: Number(quantity) > limit ? cartStockMessage(found) : "",
    };
  }, [items]);

  const increment = useCallback((cartId) => {
    const found = items.find((item) => item.cartId === cartId);
    if (!found) return { status: "missing", message: "" };
    const limit = getCartStockLimit(found);
    if (found.quantity >= limit) {
      return { status: "limited", message: cartStockMessage(found) };
    }
    setItems((current) =>
      current.map((item) =>
        item.cartId === cartId ? { ...item, quantity: clampQuantity(item.quantity + 1, limit) } : item,
      ),
    );
    return { status: "updated", message: "" };
  }, [items]);

  const decrement = useCallback((cartId) => {
    const found = items.find((item) => item.cartId === cartId);
    if (!found) return { status: "missing", message: "" };
    if (found.quantity <= 1) {
      return { status: "minimum", message: "Minimum quantity is 1." };
    }
    setItems((current) =>
      current.map((item) =>
        item.cartId === cartId ? { ...item, quantity: clampQuantity(item.quantity - 1, getCartStockLimit(item)) } : item,
      ),
    );
    return { status: "updated", message: "" };
  }, [items]);

  const removeItem = useCallback((cartId) => {
    setItems((current) => current.filter((item) => item.cartId !== cartId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const getQuantity = useCallback((product, overrides = {}) => {
    const probe = createCartProduct(product, overrides);
    return items.find((item) => item.cartId === probe.cartId)?.quantity || 0;
  }, [items]);

  const totals = useMemo(() => {
    const quantity = items.reduce((sum, item) => sum + clampQuantity(item.quantity, getCartStockLimit(item) || 1), 0);
    const amount = items.reduce((sum, item) => {
      const price = safeNumber(item.price);
      return price === null ? sum : sum + price * clampQuantity(item.quantity, getCartStockLimit(item) || 1);
    }, 0);
    return { quantity, amount };
  }, [items]);

  const value = useMemo(
    () => ({
      items,
      totals,
      addItem,
      updateQuantity,
      increment,
      decrement,
      removeItem,
      clearCart,
      getQuantity,
    }),
    [addItem, clearCart, decrement, getQuantity, increment, items, removeItem, totals, updateQuantity],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }
  return context;
}
