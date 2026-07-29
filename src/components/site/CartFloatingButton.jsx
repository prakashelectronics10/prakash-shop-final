import { useLayoutEffect, useState } from "react";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { useCart } from "../../context/CartContext";
import { CANONICAL_WIRING_PARTS_PATH } from "../../utils/routes";

function productDetailWithoutLowerActions() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/product-detail/");
}

function routeLowerFloatingActionCount() {
  if (typeof window === "undefined") return 0;
  if (productDetailWithoutLowerActions()) return 0;
  const path = window.location.pathname;
  const page = new URLSearchParams(window.location.search).get("page");
  const hasOneKnownFloatingAction = (
    path === "/" ||
    path === "/products" ||
    path === CANONICAL_WIRING_PARTS_PATH ||
    path === `${CANONICAL_WIRING_PARTS_PATH}/product-detail` ||
    page === "products" ||
    page === "projects-parts" ||
    page === "project-part-detail"
  );
  return hasOneKnownFloatingAction ? 1 : 0;
}

function domLowerFloatingActionCount() {
  if (typeof document === "undefined") return 0;
  const homeActions = document.querySelectorAll(".home-floating-actions .home-floating-button").length;
  const pageActions = document.querySelectorAll(".science-ai-float").length;
  return homeActions + pageActions;
}

function cartPositionClass(count) {
  if (count >= 2) return "floating-cart-link--raised";
  if (count === 1) return "floating-cart-link--single";
  return "floating-cart-link--bottom";
}

export function CartFloatingButton() {
  const { totals } = useCart();
  const isCartPage = typeof window !== "undefined" && window.location.pathname === "/cart";
  const [lowerFloatingActionCount, setLowerFloatingActionCount] = useState(routeLowerFloatingActionCount);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return undefined;
    const checkFloatingActions = () => {
      if (productDetailWithoutLowerActions()) {
        setLowerFloatingActionCount(0);
        return;
      }
      setLowerFloatingActionCount(Math.max(routeLowerFloatingActionCount(), domLowerFloatingActionCount()));
    };

    checkFloatingActions();
    const observer = new MutationObserver(checkFloatingActions);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", checkFloatingActions);
    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", checkFloatingActions);
    };
  }, []);

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
