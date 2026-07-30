import { useState } from "react";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { useCart } from "../../context/CartContext";
import { CANONICAL_WIRING_PARTS_PATH } from "../../utils/routes";

function routeLowerFloatingActionCount() {
  if (typeof window === "undefined") return 0;
  const path = window.location.pathname;
  const page = new URLSearchParams(window.location.search).get("page");
  // Shop / wiring pages stack WhatsApp + Pulse AI (same as homepage).
  const hasTwoKnownFloatingActions = (
    path === "/" ||
    path === "/products" ||
    path.startsWith("/product-detail/") ||
    path === CANONICAL_WIRING_PARTS_PATH ||
    path === `${CANONICAL_WIRING_PARTS_PATH}/product-detail` ||
    page === "products" ||
    page === "projects-parts" ||
    page === "project-part-detail"
  );
  return hasTwoKnownFloatingActions ? 2 : 0;
}

function cartPositionClass(count) {
  if (count >= 2) return "floating-cart-link--raised";
  if (count === 1) return "floating-cart-link--single";
  return "floating-cart-link--bottom";
}

export function CartFloatingButton() {
  const { totals } = useCart();
  const isCartPage = typeof window !== "undefined" && window.location.pathname === "/cart";
  const [lowerFloatingActionCount] = useState(routeLowerFloatingActionCount);

  if (!totals.quantity || isCartPage) return null;

  return (
    <a
      className={`floating-cart-link ${cartPositionClass(lowerFloatingActionCount)}`}
      href="/cart"
      aria-label={`Go to cart with ${totals.quantity} items`}
    >
      <span className="floating-cart-icon">
        <ShoppingCart size={19} />
        <small>{totals.quantity}</small>
      </span>
      <span>Go to Cart</span>
      <ArrowRight size={18} />
    </a>
  );
}
