import { ArrowLeft, ArrowRight, Minus, PackageCheck, PackageSearch, Plus, ShoppingBag, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { cartStockMessage, getCartStockLimit, useCart } from "../../context/CartContext";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";
import { OptimizedImage } from "./OptimizedImage";
import { CANONICAL_WIRING_PARTS_PATH } from "../../utils/routes";
import { setAppliedCouponCode } from "../../utils/coupons";
import { useOrderQuote } from "../../hooks/useOrderQuote";
import { formatINR } from "../../utils/productPricing";

function lineTotal(item) {
  const price = Number(item.price);
  return Number.isFinite(price) ? price * Number(item.quantity || 1) : null;
}

export function CartPage() {
  const { items, totals, increment, decrement, removeItem } = useCart();
  const { quote, loading: chargesLoading, error: quoteError, refresh, payload } = useOrderQuote(items);
  const additionalCharges = quote?.additionalCharges || [];
  const quotedItems = quote?.items || [];
  const estimatedTotal = quote?.total;

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
              {items.map((item, index) => {
                const quoteItem = quotedItems[index];
                const hasDiscount = Number(quoteItem?.discountAmount || 0) > 0;
                const unitPrice = quoteItem?.discountedUnitPrice ?? item.price;
                const quotedLineTotal = quoteItem?.discountedLineTotal ?? lineTotal(item);
                return (
                <article className={`cart-item-card ${hasDiscount ? "has-coupon-discount" : ""}`} key={item.cartId}>
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
                    <div className="cart-item-price">
                      {hasDiscount && <del>{formatINR(quoteItem.unitPrice)}</del>}
                      <strong>{formatINR(unitPrice)}</strong>
                      {hasDiscount && <small>{quoteItem.couponCode} applied</small>}
                    </div>
                    {payload.items[index]?.couponCode && <button className="cart-coupon-remove" type="button" onClick={() => setAppliedCouponCode("", item)}>Remove coupon {payload.items[index].couponCode}</button>}
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
                    <div className="cart-line-price">
                      {hasDiscount && <del>{formatINR(quoteItem.lineTotal)}</del>}
                      <strong className="cart-line-total">{quotedLineTotal === null ? "Request price" : formatINR(quotedLineTotal)}</strong>
                    </div>
                    <button className="cart-remove-button" type="button" onClick={() => removeItem(item.cartId)}>
                      <Trash2 size={16} /> Remove
                    </button>
                  </div>
                </article>
                );
              })}
            </div>

            <aside className="cart-summary">
              <p className="parts-kicker">Order Summary</p>
              <div>
                <span>Items</span>
                <strong>{totals.quantity}</strong>
              </div>
              <div>
                <span>Subtotal</span>
                <strong>{quote ? formatINR(quote.discountedSubtotal) : chargesLoading ? "Calculating…" : "Unavailable"}</strong>
              </div>
              {quote?.discountTotal > 0 && <small className="cart-discount-included">Coupon savings included in product prices.</small>}
              {chargesLoading ? (
                <div className="cart-summary-charge-loading"><span>Additional charges</span><strong>Calculating…</strong></div>
              ) : additionalCharges.map((charge) => (
                <div key={charge._id || charge.slug || charge.name}>
                  <span>{charge.name}</span>
                  <strong className={Number(charge.amount || 0) === 0 ? "cart-summary-free" : ""}>{Number(charge.amount || 0) === 0 ? "Free" : formatINR(charge.amount)}</strong>
                </div>
              ))}
              <div className="cart-summary-total">
                <span>Estimated total</span>
                <strong>{quote ? formatINR(estimatedTotal) : chargesLoading ? "Calculating…" : "Unavailable"}</strong>
              </div>
              {quoteError && <p className="cart-quote-error" role="alert">{quoteError} <button type="button" onClick={refresh}>Retry</button></p>}
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
