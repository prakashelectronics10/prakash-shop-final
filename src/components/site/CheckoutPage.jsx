import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, CreditCard, LockKeyhole, MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import { useCart } from "../../context/CartContext";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { OptimizedImage } from "./OptimizedImage";
import "./OrderExperience.css";

let razorpayScriptPromise;

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;
  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Secure payment window could not be loaded"));
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}

function formatINR(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

async function copyOrderId(orderId, automatic = false) {
  try {
    await navigator.clipboard.writeText(orderId);
    toast.success(automatic ? "Order ID copied to your clipboard" : "Order ID copied");
  } catch (_error) {
    toast.success(`Order confirmed: ${orderId}`);
  }
}

function OrderSuccess({ order }) {
  return (
    <main className="order-success-page">
      <section className="order-success-card">
        <span className="order-success-icon"><Check size={34} /></span>
        <p className="order-kicker">Payment successful</p>
        <h1>Your order is confirmed</h1>
        <p>Thank you, {order.customerName}. We have received your payment and started preparing your order.</p>
        <div className="order-success-id">
          <span>Order ID</span>
          <strong>{order.orderId}</strong>
          <button type="button" onClick={() => copyOrderId(order.orderId)}><Copy size={17} /> Copy</button>
        </div>
        <div className="order-success-meta">
          <span><PackageCheck size={18} /> {order.itemCount} items</span>
          <span><CreditCard size={18} /> {formatINR(order.total)} paid</span>
        </div>
        <div className="order-success-actions">
          <a href={`/orders?id=${encodeURIComponent(order.orderId)}`}>Track this order</a>
          <a href="/products" className="secondary">Continue shopping</a>
        </div>
        <small>Your Order ID has also been copied automatically. Keep it safe for tracking.</small>
      </section>
    </main>
  );
}

export function CheckoutPage() {
  const { items, totals, clearCart } = useCart();
  const [form, setForm] = useState({ name: "", phone: "", address: "", pincode: "", landmark: "", message: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [additionalCharges, setAdditionalCharges] = useState([]);
  const [chargesLoading, setChargesLoading] = useState(true);
  const [chargesError, setChargesError] = useState("");

  const pricedItems = useMemo(() => items.filter((item) => Number(item.price) > 0), [items]);
  const additionalChargesTotal = useMemo(
    () => Number(additionalCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0).toFixed(2)),
    [additionalCharges],
  );
  const checkoutTotal = Number((Number(totals.amount || 0) + additionalChargesTotal).toFixed(2));

  const loadAdditionalCharges = async () => {
    setChargesLoading(true);
    setChargesError("");
    try {
      const response = await apiRequest("/orders/charges", { cache: "no-store" });
      setAdditionalCharges(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setChargesError(error.message || "Additional charges could not be loaded");
    } finally {
      setChargesLoading(false);
    }
  };

  useEffect(() => { loadAdditionalCharges(); }, []);

  const update = (key, value) => {
    const nextValue = key === "pincode" ? value.replace(/\D/g, "").slice(0, 6) : value;
    setForm((current) => ({ ...current, [key]: nextValue }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  };

  const validate = () => {
    const errors = {};
    if (form.name.trim().length < 2) errors.name = "Enter your full name";
    if (!/^(?:\+91)?[6-9]\d{9}$/.test(form.phone.replace(/[\s-]/g, ""))) errors.phone = "Enter a valid 10-digit phone number";
    if (form.address.trim().length < 8) errors.address = "Enter your complete delivery address";
    if (!/^\d{6}$/.test(form.pincode)) errors.pincode = "Enter exactly 6 digits";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const beginPayment = async (event) => {
    event.preventDefault();
    if (!items.length || !validate()) return;
    if (pricedItems.length !== items.length) {
      toast.error("A cart item does not have an online price. Please remove it or contact the shop.");
      return;
    }
    setBusy(true);
    try {
      await loadRazorpayCheckout();
      const created = await apiRequest("/orders/payment", {
        method: "POST",
        cache: "no-store",
        body: JSON.stringify({
          customer: form,
          items: items.map(({ sourceType, sourceId, productId, productSlug, quantity }) => ({ sourceType, sourceId, productId, productSlug, quantity })),
        }),
      });
      const payment = created.data;
      if (Array.isArray(payment.additionalCharges)) setAdditionalCharges(payment.additionalCharges);
      const razorpay = new window.Razorpay({
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        name: "Prakash Electronics",
        description: `${items.length} product order`,
        image: `${window.location.origin}/logo192.png`,
        order_id: payment.razorpayOrderId,
        prefill: { name: form.name, contact: form.phone },
        notes: { orderId: payment.orderId },
        theme: { color: "#2563eb", backdrop_color: "rgba(15, 23, 42, 0.58)" },
        modal: { ondismiss: () => setBusy(false), escape: true, confirm_close: true },
        handler: async (response) => {
          try {
            const verified = await apiRequest("/orders/payment/verify", {
              method: "POST",
              cache: "no-store",
              body: JSON.stringify({
                orderId: payment.orderId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });
            clearCart();
            setConfirmedOrder(verified.data);
            await copyOrderId(verified.data.orderId, true);
            window.scrollTo({ top: 0, behavior: "smooth" });
          } catch (error) {
            toast.error(error.message || "Payment verification failed. Please contact support with your payment ID.");
          } finally {
            setBusy(false);
          }
        },
      });
      razorpay.on("payment.failed", (response) => {
        setBusy(false);
        toast.error(response.error?.description || "Payment failed. Please try again.");
      });
      razorpay.open();
    } catch (error) {
      setBusy(false);
      toast.error(error.message || "Unable to start payment");
    }
  };

  if (confirmedOrder) {
    return <div className="App order-page"><Navbar /><OrderSuccess order={confirmedOrder} /><Footer /></div>;
  }

  if (!items.length) {
    return (
      <div className="App order-page">
        <Navbar />
        <main className="checkout-empty">
          <PackageCheck size={48} />
          <h1>Your cart is empty</h1>
          <p>Add products to your cart before opening checkout.</p>
          <a href="/products">Browse products</a>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="App order-page">
      <Navbar />
      <main className="checkout-page-shell">
        <header className="checkout-heading">
          <div className="checkout-heading-pills">
            <a href="/cart"><ArrowLeft size={18} /> Back to cart</a>
            <p className="order-kicker"><LockKeyhole size={15} /> Secure checkout</p>
          </div>
          <h1>Delivery & payment</h1>
          <p>Complete your delivery details, review your products, then pay securely with Razorpay.</p>
        </header>

        <form className="checkout-layout" onSubmit={beginPayment} noValidate>
          <section className="checkout-form-card">
            <div className="checkout-card-title">
              <span><MapPin size={21} /></span>
              <div><h2>Delivery details</h2><p>Where should we deliver your order?</p></div>
            </div>
            <div className="checkout-form-grid">
              <label className="checkout-field">
                <span>Full name *</span>
                <input autoComplete="name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Your full name" aria-invalid={Boolean(fieldErrors.name)} />
                {fieldErrors.name && <small>{fieldErrors.name}</small>}
              </label>
              <label className="checkout-field">
                <span>Phone number *</span>
                <input inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="10-digit mobile number" aria-invalid={Boolean(fieldErrors.phone)} />
                {fieldErrors.phone && <small>{fieldErrors.phone}</small>}
              </label>
              <label className="checkout-field checkout-field-wide">
                <span>Complete address *</span>
                <textarea rows="3" autoComplete="street-address" value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="House / shop no., street, area and city" aria-invalid={Boolean(fieldErrors.address)} />
                {fieldErrors.address && <small>{fieldErrors.address}</small>}
              </label>
              <label className="checkout-field">
                <span>Pincode *</span>
                <input inputMode="numeric" pattern="[0-9]{6}" maxLength="6" autoComplete="postal-code" value={form.pincode} onChange={(e) => update("pincode", e.target.value)} placeholder="6-digit pincode" aria-invalid={Boolean(fieldErrors.pincode)} />
                {fieldErrors.pincode && <small>{fieldErrors.pincode}</small>}
              </label>
              <label className="checkout-field">
                <span>Landmark <em>Optional</em></span>
                <input value={form.landmark} onChange={(e) => update("landmark", e.target.value)} placeholder="Nearby landmark" />
              </label>
              <label className="checkout-field checkout-field-wide">
                <span>Message <em>Optional</em></span>
                <textarea rows="4" value={form.message} onChange={(e) => update("message", e.target.value)} placeholder="Delivery notes or anything we should know" />
              </label>
            </div>
          </section>

          <aside className="checkout-summary-card">
            <div className="checkout-card-title"><span><PackageCheck size={21} /></span><div><h2>Order summary</h2><p>{totals.quantity} items</p></div></div>
            <div className="checkout-summary-items">
              {items.map((item) => (
                <article key={item.cartId}>
                  <div>{item.productImageUrl ? <OptimizedImage src={item.productImageUrl} alt={item.productName} width={64} height={64} /> : <PackageCheck size={24} />}</div>
                  <span><strong>{item.productName}</strong><small>{formatINR(item.price)} × {item.quantity}</small></span>
                  <b>{formatINR(Number(item.price) * Number(item.quantity))}</b>
                </article>
              ))}
            </div>
            <div className="checkout-totals">
              <p><span>Subtotal</span><strong>{formatINR(totals.amount)}</strong></p>
              {additionalCharges.map((charge) => (
                <p key={charge._id || charge.slug || charge.name}>
                  <span>{charge.name}</span>
                  <strong className={Number(charge.amount || 0) === 0 ? "free-label" : ""}>
                    {Number(charge.amount || 0) === 0 ? "Free" : formatINR(charge.amount)}
                  </strong>
                </p>
              ))}
              <p className="checkout-grand-total"><span>Total</span><strong>{formatINR(checkoutTotal)}</strong></p>
            </div>
            {chargesError && (
              <div className="checkout-charge-error" role="alert">
                <span>{chargesError}</span>
                <button type="button" onClick={loadAdditionalCharges}>Retry</button>
              </div>
            )}
            <button className="checkout-pay-button" type="submit" disabled={busy || chargesLoading || Boolean(chargesError)}>
              {chargesLoading ? "Calculating total…" : busy ? "Opening secure payment…" : `Pay ${formatINR(checkoutTotal)}`}
            </button>
            <small className="checkout-secure-note"><ShieldCheck size={15} /> Secured by Razorpay. UPI, cards, netbanking and supported payment methods are available in the payment window.</small>
          </aside>
        </form>
      </main>
      <Footer />
    </div>
  );
}
