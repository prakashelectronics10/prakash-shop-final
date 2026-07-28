import { ArrowLeft, ArrowRight, Minus, PackageSearch, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useState } from "react";
import { cartItemToBookingProduct, cartStockMessage, getCartStockLimit, useCart } from "../../context/CartContext";
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
  const [notice, setNotice] = useState("");

  const showCartNotice = (result) => {
    if (!result?.message) return;
    setNotice(result.message);
    window.setTimeout(() => setNotice(""), 3200);
  };

  const bookAllProducts = () => {
    if (!items.length) return;
    sessionStorage.setItem("selectedCartBooking", JSON.stringify({
      bookingSource: "cart",
      products: items.map(cartItemToBookingProduct),
      createdAt: new Date().toISOString(),
    }));
    window.location.href = "/booking?source=cart";
  };

  return (
    <div className="App project-parts-page cart-page">
      <Navbar />
      <main>
        <section className="cart-hero">
          <div>
            <a className="detail-back-link" href="/products">
              <ArrowLeft size={18} /> Continue shopping
            </a>
            <p className="parts-kicker"><ShoppingBag size={16} /> Guest session cart</p>
            <h1>Cart</h1>
            <p>Your cart stays available during this browser session and clears automatically after the browser session ends.</p>
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
            </div>
          </section>
        ) : (
          <section className="cart-layout">
            <div className="cart-items-stack">
              {notice && <div className="cart-stock-notice">{notice}</div>}
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
                <span>Estimated total</span>
                <strong>{totals.amount ? priceLabel(totals.amount) : "Price on request"}</strong>
              </div>
              <button type="button" onClick={bookAllProducts}>
                Book All Products <ArrowRight size={18} />
              </button>
            </aside>
          </section>
        )}
      </main>
      {items.length > 0 && (
        <button className="cart-book-all-float" type="button" onClick={bookAllProducts}>
          <ShoppingBag size={18} />
          <span>Book All Products</span>
          <ArrowRight size={18} />
        </button>
      )}
      <Footer />
    </div>
  );
}
