import { useEffect, useState } from "react";
import { Ban, Check, Clock3, PackageCheck, Search, Truck, WalletCards } from "lucide-react";
import { apiRequest } from "../../api/client";
import { formatINR } from "../../utils/productPricing";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { OptimizedImage } from "./OptimizedImage";
import "./OrderExperience.css";

const STEPS = [
  { key: "confirmed", title: "Order confirmed", detail: "Payment received and order accepted", icon: Check },
  { key: "shipped", title: "Shipped", detail: "Your products are on their way", icon: PackageCheck },
  { key: "out_for_delivery", title: "Out for delivery", detail: "Your order is with the delivery partner", icon: Truck },
  { key: "delivered", title: "Delivered", detail: "Order delivered successfully", icon: Check },
];

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function OrderResult({ order, onOrderChange }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelForm, setCancelForm] = useState({ phone: "", reason: "" });
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const activeIndex = order.orderStatus === "cancelled" ? -1 : STEPS.findIndex((step) => step.key === order.orderStatus);
  const chargeRows = Array.isArray(order.additionalCharges) && order.additionalCharges.length
    ? order.additionalCharges
    : [{ name: "Delivery charge", slug: "delivery-charge", amount: order.deliveryCharge || 0 }];
  const cancellationStatus = order.cancellationRequest?.status || "none";
  const requestCancellation = async (event) => {
    event.preventDefault();
    setCancelBusy(true);
    setCancelError("");
    try {
      const response = await apiRequest(`/orders/track/${encodeURIComponent(order.orderId)}/cancellation`, {
        method: "POST",
        body: JSON.stringify(cancelForm),
      });
      onOrderChange(response.data);
      setCancelOpen(false);
    } catch (requestError) {
      setCancelError(requestError.message || "Cancellation request could not be submitted");
    } finally {
      setCancelBusy(false);
    }
  };
  return (
    <section className="tracking-result">
      <header className="tracking-order-head">
        <div><p className="order-kicker">Order details</p><h2>{order.orderId}</h2><span>Placed {formatDate(order.placedAt)}</span></div>
        <strong className={`tracking-status-pill ${order.orderStatus}`}>{order.orderStatus.replaceAll("_", " ")}</strong>
      </header>

      <div className="tracking-products">
        <h3>Items in your order</h3>
        {order.items.map((item) => (
          <a href={`/product/${encodeURIComponent(item.productSlug || item.productId)}`} key={`${item.productId}-${item.productName}`}>
            <div>{item.productImageUrl ? <OptimizedImage src={item.productImageUrl} alt={item.productName} width={84} height={84} /> : <PackageCheck size={30} />}</div>
            <span><strong>{item.productName}</strong><small>{item.productCategory}</small><em>{formatINR(item.unitPrice)} × {item.quantity}</em></span>
            <b>{formatINR(item.lineTotal)}</b>
          </a>
        ))}
      </div>

      <div className="tracking-bottom-grid">
        <section className="order-progress-card">
          <h3>Order progress</h3>
          {order.orderStatus === "cancelled" ? (
            <div className="cancelled-order-note">
              <strong>This order has been cancelled.</strong>
              <span>{order.refund?.status === "processed" ? "Your refund has been processed." : order.refund?.status === "failed" ? "The refund needs administrator attention. Please contact the shop with your Order ID." : "Your refund has been initiated and normally appears in 5–7 working days."}</span>
            </div>
          ) : (
            <ol className="order-timeline">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                const complete = index <= activeIndex;
                const current = index === activeIndex;
                return (
                  <li className={`${complete ? "complete" : ""} ${current ? "current" : ""}`} key={step.key}>
                    <span>{complete ? <Check size={16} /> : <Icon size={16} />}</span>
                    <div><small>{complete ? formatDate(index === activeIndex ? order.statusUpdatedAt : order.placedAt) : "Pending"}</small><strong>{step.title}</strong><p>{step.detail}</p></div>
                  </li>
                );
              })}
            </ol>
          )}
          {order.orderStatus === "confirmed" && cancellationStatus === "none" && (
            <button className="order-cancel-request-button" type="button" onClick={() => setCancelOpen(true)}><Ban size={17} /> Request cancellation</button>
          )}
          {["requested", "processing"].includes(cancellationStatus) && (
            <div className="order-cancel-state"><strong>Cancellation requested</strong><span>An administrator will review it before shipping.</span></div>
          )}
          {cancellationStatus === "rejected" && order.orderStatus === "confirmed" && (
            <div className="order-cancel-state rejected"><strong>Cancellation was not approved</strong><span>{order.cancellationRequest?.adminNote || "Contact the shop if you need help."}</span></div>
          )}
        </section>
        <aside className="tracking-summary-card">
          <h3><WalletCards size={20} /> Order summary</h3>
          <p><span>Items</span><strong>{order.itemCount}</strong></p>
          <p><span>Subtotal</span><strong>{formatINR(order.subtotal)}</strong></p>
          {order.coupon && Number(order.discountTotal || 0) > 0 && <p><span>Coupon {order.coupon.code}</span><strong>−{formatINR(order.discountTotal)}</strong></p>}
          {chargeRows.map((charge) => (
            <p key={charge.slug || charge.name}>
              <span>{charge.name}</span>
              <strong>{Number(charge.amount || 0) ? formatINR(charge.amount) : "Free"}</strong>
            </p>
          ))}
          <p className="tracking-total"><span>Paid total</span><strong>{formatINR(order.total)}</strong></p>
          <small><Check size={15} /> Payment verified</small>
        </aside>
      </div>
      {cancelOpen && (
        <div className="order-cancel-layer" role="presentation">
          <button type="button" className="order-cancel-backdrop" aria-label="Close cancellation form" onClick={() => setCancelOpen(false)} />
          <form className="order-cancel-dialog" onSubmit={requestCancellation} role="dialog" aria-modal="true" aria-label="Request order cancellation">
            <p className="order-kicker">Before shipping</p>
            <h3>Request cancellation</h3>
            <p>This request must be approved by an administrator. Once shipped, the order cannot be cancelled.</p>
            <label><span>Order phone number</span><input type="tel" inputMode="numeric" value={cancelForm.phone} onChange={(event) => setCancelForm({ ...cancelForm, phone: event.target.value })} placeholder="10-digit mobile number" required /></label>
            <label><span>Reason</span><textarea rows="4" maxLength="500" value={cancelForm.reason} onChange={(event) => setCancelForm({ ...cancelForm, reason: event.target.value })} placeholder="Tell us why you need to cancel" required /></label>
            {cancelError && <small role="alert">{cancelError}</small>}
            <div><button type="button" className="secondary" onClick={() => setCancelOpen(false)}>Keep order</button><button type="submit" disabled={cancelBusy}>{cancelBusy ? "Submitting…" : "Submit request"}</button></div>
          </form>
        </div>
      )}
    </section>
  );
}

export function OrderTrackingPage() {
  const queryId = new URLSearchParams(window.location.search).get("id") || "";
  const [orderId, setOrderId] = useState(queryId.toUpperCase());
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const findOrder = async (event) => {
    event?.preventDefault();
    const value = orderId.trim().toUpperCase();
    if (!value) return setError("Enter your Order ID");
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest(`/orders/track/${encodeURIComponent(value)}`, { cache: "no-store" });
      setOrder(response.data);
      window.history.replaceState({}, "", `/orders?id=${encodeURIComponent(value)}`);
    } catch (requestError) {
      setOrder(null);
      setError(requestError.message || "Order not found");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (queryId) findOrder();
    // Query ID is intentionally loaded only once on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="App order-page">
      <Navbar />
      <main className="order-tracking-page">
        <header className="tracking-hero">
          <p className="order-kicker"><Clock3 size={15} /> Live order tracking</p>
          <h1>Track your order</h1>
          <p>Enter the Order ID you received after payment to see products, payment summary and the latest delivery status.</p>
          <form onSubmit={findOrder}>
            <label htmlFor="order-id">Order ID</label>
            <div><input id="order-id" value={orderId} onChange={(e) => setOrderId(e.target.value.toUpperCase())} placeholder="PE-YYYYMMDD-XXXXXXXXXXXX" autoComplete="off" /><button type="submit" disabled={busy}><Search size={18} /> {busy ? "Finding…" : "Track order"}</button></div>
            {error && <small role="alert">{error}</small>}
          </form>
        </header>
        {order && <OrderResult order={order} onOrderChange={setOrder} />}
      </main>
      <Footer />
    </div>
  );
}
