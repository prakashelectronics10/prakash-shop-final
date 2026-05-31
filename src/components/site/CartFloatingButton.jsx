import { ArrowRight, ShoppingCart } from "lucide-react";
import { useCart } from "../../context/CartContext";

export function CartFloatingButton() {
  const { totals } = useCart();
  const isCartPage = typeof window !== "undefined" && window.location.pathname === "/cart";

  if (!totals.quantity || isCartPage) return null;

  return (
    <a className="floating-cart-link" href="/cart" aria-label={`Go to cart with ${totals.quantity} items`}>
      <span className="floating-cart-icon">
        <ShoppingCart size={19} />
        <small>{totals.quantity}</small>
      </span>
      <span>Go to Cart</span>
      <ArrowRight size={18} />
    </a>
  );
}
