import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Minus, PackageCheck, PackageSearch, Plus, ShoppingBag, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import { cartStockMessage, getCartStockLimit, useCart } from "../../context/CartContext";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";
import { OptimizedImage } from "./OptimizedImage";
import { CANONICAL_WIRING_PARTS_PATH } from "../../utils/routes";

function priceLabel(price) {
  return price === null || price === undefined || price === "" ? "Price on request" : `Rs. ${Number(price).toLocaleString("en-IN")}`;
}

function lineTotal(item) {
  const price = Number(item.price);
  return Number.isFinite(price) ? price * Number(item.quantity || 1) : null;
}

export function CartPage() {
  const { items, totals, increment, decrement, removeItem } = useCart();
  const [additionalCharges, setAdditionalCharges] = useState([]);
  const [chargesLoading, setChargesLoading] = useState(true);
  const additionalTotal = useMemo(
    () => additionalCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0),
    [additionalCharges],
  );
  const estimatedTotal = Number(totals.amount || 0) + additionalTotal;

  useEffect(() => {
    let active = true;
    apiRequest("/orders/charges", { cache: "no-store" })
      .then((response) => { if (active) setAdditionalCharges(Array.isArray(response.data) ? response.data : []); })
      .catch(() => {})
      .finally(() => { if (active) setChargesLoading(false); });
    return () => { active = false; };
  }, []);

  const showCartNotice = (result) => {
    if (!result?.message) return;
    toast.error(result.message, { id: "cart-quantity-limit" });
  };

  const openCheckout = () => {
    if (items.length) window.location.href = "/checkout";
  };

  return (
    <div className="App project-parts-page cart-page">
      <Navbar />
      <main>
        <section className="cart-hero">
          <div className="cart-hero-inner">
            <div className="cart-hero-topline">
              <a className="detail-back-link" href="/products">
                <ArrowLeft size={18} /> Continue shopping
              </a>
              <p className="parts-kicker"><ShoppingBag size={16} /> Guest session cart</p>
            </div>
            <div className="cart-hero-title-block">
              <h1>Cart</h1>
              <p>Your cart stays available during this browser session and clears automatically when the session ends.</p>
            </div>
          </div>
        </section>

        {!items.length ? (
          <section className="cart-empty-panel">
            <PackageSearch size={48} />
            <h2>Your cart is empty</h2>
            <p>Browse shop products or wiring accessories and add items instantly without login.</p>
            <div className="cart-empty-actions">
              <a href="/products">Browse Products</a>
              <a href={CANONICAL_WIRING_PARTS_PATH}>Wiring Accessories</a>
              <a className="cart-track-order-link" href="/orders">
                <PackageCheck size={18} /> Track Your Order
              </a>
            </div>
          </section>
        ) : (
          <section className="cart-layout">
            <div className="cart-items-stack">
              {items.map((item) => (
                <article className="cart-item-card" key={item.cartId}>
                  <div className="cart-item-image">
                    {item.productImageUrl ? (
                      <OptimizedImage
                        src={item.productImageUrl}
                        alt={item.productName}
                        width={180}
                        height={180}
                        sizes="(min-width: 900px) 180px, 34vw"
                      />
                    ) : (
                      <PackageSearch size={40} />
                    )}
                  </div>
                  <div className="cart-item-content">
                    <span>{item.productCategory}</span>
                    <h2>{item.productName}</h2>
                    {item.originalCategory && <small>Original category: {item.originalCategory}</small>}
                    <p>{item.productDescription || "Available at Prakash Electronics."}</p>
                    <strong>{priceLabel(item.price)}</strong>
                    <small className="cart-stock-text">{cartStockMessage(item)}</small>
                  </div>
                  <div className="cart-item-actions">
                    <div className="qty-control" aria-label={`Quantity for ${item.productName}`}>
                      <button
                        type="button"
                        onClick={() => showCartNotice(decrement(item.cartId))}
                        aria-label="Decrease quantity"
                        disabled={Number(item.quantity || 1) <= 1}
                      >
                        <Minus size={16} />
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => showCartNotice(increment(item.cartId))}
                        aria-label="Increase quantity"
                        disabled={Number(item.quantity || 1) >= getCartStockLimit(item)}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <strong className="cart-line-total">{lineTotal(item) === null ? "Request price" : priceLabel(lineTotal(item))}</strong>
                    <button className="cart-remove-button" type="button" onClick={() => removeItem(item.cartId)}>
                      <Trash2 size={16} /> Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <aside className="cart-summary">
              <p className="parts-kicker">Order Summary</p>
              <div>
                <span>Items</span>
                <strong>{totals.quantity}</strong>
              </div>
              <div>
                <span>Subtotal</span>
                <strong>{totals.amount ? priceLabel(totals.amount) : "Price on request"}</strong>
              </div>
              {chargesLoading ? (
                <div className="cart-summary-charge-loading"><span>Additional charges</span><strong>Calculating…</strong></div>
              ) : additionalCharges.map((charge) => (
                <div key={charge._id || charge.slug || charge.name}>
                  <span>{charge.name}</span>
                  <strong className={Number(charge.amount || 0) === 0 ? "cart-summary-free" : ""}>{Number(charge.amount || 0) === 0 ? "Free" : priceLabel(charge.amount)}</strong>
                </div>
              ))}
              <div className="cart-summary-total">
                <span>Estimated total</span>
                <strong>{totals.amount ? priceLabel(estimatedTotal) : "Price on request"}</strong>
              </div>
              <button type="button" onClick={openCheckout}>
                Checkout <ArrowRight size={18} />
              </button>
              <a className="cart-summary-track" href="/orders">
                <PackageCheck size={17} /> Track Your Order <ArrowRight size={16} />
              </a>
            </aside>
          </section>
        )}
      </main>
      {items.length > 0 && (
        <button className="cart-book-all-float" type="button" onClick={openCheckout}>
          <ShoppingBag size={18} />
          <span>Checkout</span>
          <ArrowRight size={18} />
        </button>
      )}
      <Footer />
    </div>
  );
}
