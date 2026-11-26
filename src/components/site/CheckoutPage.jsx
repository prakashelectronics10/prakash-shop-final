import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BadgePercent, Check, Copy, CreditCard, LockKeyhole, MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest, apiUrl } from "../../api/client";
import { useCart } from "../../context/CartContext";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { OptimizedImage } from "./OptimizedImage";
import { clearAppliedCouponCode } from "../../utils/coupons";
import { useOrderQuote } from "../../hooks/useOrderQuote";
import { formatINR } from "../../utils/productPricing";
import {
  getPaymentStatus, loadRazorpayCheckout, openRazorpayCheckout, PAYMENT_RECOVERY_URL, readPaymentRecovery,
  reportFailedPayment, savePaymentRecovery, verifyCheckoutPayment,
} from "../../utils/orderPayment";
import "./OrderExperience.css";

const REQUIRED_FIELD_ORDER = ["name", "phone", "whatsappNumber", "address", "pincode"];

async function copyOrderId(orderId, automatic = false) {
  try {
    await navigator.clipboard.writeText(orderId);
    toast.success(automatic ? "Order ID copied to your clipboard" : "Order ID copied");
  } catch (_error) {
    toast.success(`Order confirmed: ${orderId}`);
  }
}

function QuoteValue({ value, loading, label }) {
  if (value !== undefined && value !== null) return formatINR(value);
  if (!loading) return "Unavailable";
  return <span className="order-quote-value-skeleton" role="status" aria-label={`Calculating ${label}`} />;
}

function OrderSuccess({ order }) {
  useEffect(() => {
    if (!order.invoiceDownloadUrl) return;
    const link = document.createElement("a");
    link.href = `${apiUrl(order.invoiceDownloadUrl)}?theme=blue`;
    link.download = `Invoice-${order.orderId}.pdf`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [order.invoiceDownloadUrl, order.orderId]);

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
          {order.invoiceDownloadUrl && <a href={`${apiUrl(order.invoiceDownloadUrl)}?theme=blue`} download={`Invoice-${order.orderId}.pdf`}>Download invoice</a>}
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
  const [form, setForm] = useState({ name: "", phone: "", whatsappNumber: "", address: "", pincode: "", landmark: "", message: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [recovery, setRecovery] = useState(readPaymentRecovery);
  const [paymentState, setPaymentState] = useState(recovery ? "checking" : "");
  const initialRecovery = useRef(recovery);
  const booted = useRef(false);
  const checking = useRef(false);
  const finished = useRef(false);
  const captureReported = useRef(Boolean(recovery?.awaitingConfirmation));
  const fieldRefs = {
    name: useRef(null),
    phone: useRef(null),
    whatsappNumber: useRef(null),
    address: useRef(null),
    pincode: useRef(null),
  };
  const { quote, loading: chargesLoading, error: chargesError, payload, refresh: loadAdditionalCharges } = useOrderQuote(items);
  const [paymentQuote, setPaymentQuote] = useState(null);
  const currentQuote = paymentQuote || quote;
  const additionalCharges = currentQuote?.additionalCharges || [];
  const quotedItems = currentQuote?.items || [];
  const checkoutTotal = currentQuote?.total;
  const discountTotal = currentQuote?.discountTotal || 0;
  const paymentLabel = chargesLoading
    ? "Calculating total…"
    : busy
      ? "Opening secure payment…"
      : chargesError || !currentQuote
        ? "Pricing unavailable"
        : `Pay ${formatINR(checkoutTotal)}`;

  useEffect(() => { setPaymentQuote(null); }, [quote]);

  useEffect(() => {
    if (!items.length && !confirmedOrder && !recovery) window.location.replace("/cart");
  }, [confirmedOrder, items.length, recovery]);

  const completePayment = useCallback((order, payment) => {
    if (finished.current) return;
    finished.current = true;
    if (order.paymentStatus === "refunded") {
      setPaymentState("refunded");
      return;
    }
    setConfirmedOrder(order);
    if (payment.clearCart) {
      clearCart();
      clearAppliedCouponCode();
    }
    savePaymentRecovery(payment);
    void copyOrderId(order.orderId, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [clearCart]);

  const checkPayment = useCallback(async (payment, resume = false) => {
    if (checking.current || finished.current) return false;
    checking.current = true;
    setPaymentState("checking");
    try {
      const status = await getPaymentStatus(payment, resume);
      if (finished.current) return false;
      if (status.order) completePayment(status.order, payment);
      else if (status.processing || captureReported.current) setPaymentState("processing");
      else setPaymentState("unpaid");
      return !status.order && !status.processing && !captureReported.current;
    } catch (error) {
      if (finished.current) return false;
      if (resume) toast.error(error.message || "Unable to resume payment");
      setPaymentState("unavailable");
      return false;
    } finally {
      checking.current = false;
    }
  }, [completePayment]);

  useEffect(() => {
    if (!recovery || confirmedOrder || !["processing", "unavailable"].includes(paymentState)) return undefined;
    const timer = window.setTimeout(() => { void checkPayment(recovery); }, 8000);
    return () => window.clearTimeout(timer);
  }, [recovery, confirmedOrder, paymentState, checkPayment]);

  const focusFirstInvalidField = (errors) => {
    const firstKey = REQUIRED_FIELD_ORDER.find((key) => errors[key]);
    const field = firstKey ? fieldRefs[firstKey]?.current : null;
    if (!field) return;
    field.focus({ preventScroll: true });
    field.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const update = (key, value) => {
    let nextValue = value;
    if (key === "pincode") nextValue = value.replace(/\D/g, "").slice(0, 6);
    if (key === "phone" || key === "whatsappNumber") nextValue = value.replace(/\D/g, "").slice(0, 10);
    setForm((current) => ({ ...current, [key]: nextValue }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  };

  const validate = () => {
    const errors = {};
    if (form.name.trim().length < 2) errors.name = "Enter your full name";
    if (!/^[6-9]\d{9}$/.test(form.phone)) errors.phone = "Enter a valid 10-digit phone number";
    if (!/^[6-9]\d{9}$/.test(form.whatsappNumber)) errors.whatsappNumber = "Enter a valid 10-digit WhatsApp number";
    if (form.address.trim().length < 8) errors.address = "Enter your complete delivery address";
    if (!/^\d{6}$/.test(form.pincode)) errors.pincode = "Enter exactly 6 digits";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      focusFirstInvalidField(errors);
      return false;
    }
    return true;
  };

  const launchPayment = useCallback(async (payment, clearCartOnSuccess) => {
    await loadRazorpayCheckout();
    const saved = savePaymentRecovery(payment, { clearCart: clearCartOnSuccess });
    window.history.replaceState(window.history.state, "", PAYMENT_RECOVERY_URL);
    setRecovery(saved);
    setPaymentState("opening");
    let callbackReceived = false;
    try {
      openRazorpayCheckout(payment, {
        onDismiss: () => {
          setBusy(false);
          if (!callbackReceived) void checkPayment(saved);
        },
        onFailed: () => {
          if (!callbackReceived) void reportFailedPayment(saved).catch(() => {});
          toast.error("The payment attempt was declined. You can retry from the payment window.");
        },
        onCaptured: async (response) => {
          callbackReceived = true;
          captureReported.current = true;
          setBusy(false);
          const pending = savePaymentRecovery(payment, { clearCart: clearCartOnSuccess, awaitingConfirmation: true });
          setRecovery(pending);
          setPaymentState("checking");
          try {
            completePayment(await verifyCheckoutPayment(payment, response), pending);
          } catch (_error) {
            await checkPayment(pending);
          }
        },
      });
    } catch (error) {
      setPaymentState("unpaid");
      throw error;
    }
  }, [checkPayment, completePayment]);

  useEffect(() => {
    if (booted.current || !initialRecovery.current) return;
    booted.current = true;
    const payment = initialRecovery.current;
    if (!payment.startPayment) {
      void checkPayment(payment);
      return;
    }
    const saved = savePaymentRecovery(payment);
    setRecovery(saved);
    setBusy(true);
    void checkPayment(saved).then((canPay) => {
      if (canPay) return launchPayment(saved, false);
      setBusy(false);
      return undefined;
    }).catch((error) => {
      setBusy(false);
      toast.error(error.message || "Unable to open payment");
    });
  }, [checkPayment, launchPayment]);

  const beginPayment = async (event) => {
    event.preventDefault();
    if (!items.length || chargesLoading || chargesError || !quote || !validate() || busy) return;
    setBusy(true);
    try {
      await loadRazorpayCheckout();
      const created = await apiRequest("/orders/payment", {
        method: "POST",
        cache: "no-store",
        body: JSON.stringify({ customer: form, ...payload }),
      });
      setPaymentQuote(created.data);
      await launchPayment(created.data, true);
    } catch (error) {
      setBusy(false);
      toast.error(error.message || "Unable to start payment");
    }
  };

  const retryPayment = async () => {
    if (busy || recovery.awaitingConfirmation) return;
    setBusy(true);
    try {
      if (await checkPayment(recovery, true)) await launchPayment(recovery, recovery.clearCart);
      else setBusy(false);
    } catch (error) {
      setBusy(false);
      toast.error(error.message || "Unable to open payment");
    }
  };

  if (confirmedOrder) {
    return <div className="App order-page"><Navbar /><OrderSuccess order={confirmedOrder} /><Footer /></div>;
  }

  if (recovery) {
    const canRetry = paymentState === "unpaid" && !recovery.awaitingConfirmation;
    const canCheck = !["checking", "opening", "refunded"].includes(paymentState);
    return (
      <div className="App order-page">
        <Navbar />
        <main className="order-success-page">
          <section className="order-success-card" aria-live="polite">
            <span className="order-success-icon"><CreditCard size={30} /></span>
            <p className="order-kicker">Order {recovery.orderId}</p>
            <h1>{{
              checking: "Checking payment", opening: "Secure payment", processing: "Payment confirmation pending",
              unpaid: "Continue your payment", unavailable: "Payment status unavailable", refunded: "Payment refunded",
            }[paymentState]}</h1>
            <p>{{
              checking: "We’re checking the payment status with Razorpay.",
              opening: "Complete your payment in the Razorpay window.",
              processing: "Razorpay is confirming your payment. You can refresh this page without losing your order.",
              unpaid: "You can pay for this same order without creating another one.",
              unavailable: "We couldn’t check your payment right now. If you were charged, check the status again before paying.",
              refunded: "This order has been refunded. View your order for details.",
            }[paymentState]}</p>
            <div className="order-success-actions order-recovery-actions">
              {canRetry && <button type="button" disabled={busy} onClick={retryPayment}>Pay {formatINR(recovery.amount / 100)}</button>}
              {canCheck && <button type="button" disabled={busy} onClick={() => checkPayment(recovery)}>Check payment status</button>}
              <a href={paymentState === "refunded" ? `/orders?id=${encodeURIComponent(recovery.orderId)}` : "/orders"} className="secondary">Track orders</a>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  if (!items.length) {
    return null;
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
          <p>Complete your delivery details, then pay securely with Razorpay.</p>
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
                <input ref={fieldRefs.name} autoComplete="name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Your full name" aria-invalid={Boolean(fieldErrors.name)} />
                {fieldErrors.name && <small>{fieldErrors.name}</small>}
              </label>
              <label className="checkout-field">
                <span>Phone number *</span>
                <input ref={fieldRefs.phone} inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength="10" autoComplete="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="10-digit mobile number" aria-invalid={Boolean(fieldErrors.phone)} />
                {fieldErrors.phone && <small>{fieldErrors.phone}</small>}
              </label>
              <label className="checkout-field">
                <span>WhatsApp number *</span>
                <input
                  ref={fieldRefs.whatsappNumber}
                  inputMode="numeric"
                  pattern="[6-9][0-9]{9}"
                  maxLength="10"
                  autoComplete="tel"
                  value={form.whatsappNumber}
                  onChange={(e) => update("whatsappNumber", e.target.value)}
                  placeholder="10-digit WhatsApp number"
                  aria-invalid={Boolean(fieldErrors.whatsappNumber)}
                />
                {fieldErrors.whatsappNumber && <small>{fieldErrors.whatsappNumber}</small>}
              </label>
              <label className="checkout-field checkout-field-wide">
                <span>Complete address *</span>
                <textarea ref={fieldRefs.address} rows="3" autoComplete="street-address" value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="House / shop no., street, area and city" aria-invalid={Boolean(fieldErrors.address)} />
                {fieldErrors.address && <small>{fieldErrors.address}</small>}
              </label>
              <label className="checkout-field">
                <span>Pincode *</span>
                <input ref={fieldRefs.pincode} inputMode="numeric" pattern="[0-9]{6}" maxLength="6" autoComplete="postal-code" value={form.pincode} onChange={(e) => update("pincode", e.target.value)} placeholder="6-digit pincode" aria-invalid={Boolean(fieldErrors.pincode)} />
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
              {items.map((item, index) => {
                const quoteItem = quotedItems[index];
                const itemQuoteReady = Boolean(quoteItem);
                const hasDiscount = Number(quoteItem?.discountAmount || 0) > 0;
                return (
                <article className={hasDiscount ? "has-coupon-discount" : ""} key={item.cartId}>
                  <div className="checkout-summary-thumbnail product-order-thumbnail">
                    {item.productImageUrl ? (
                      <OptimizedImage src={item.productImageUrl} alt={item.productName} width={160} />
                    ) : <PackageCheck size={24} aria-hidden="true" />}
                  </div>
                  <span>
                    <strong>{item.productName}</strong>
                    {item.variantSummary ? <small>{item.variantSummary}</small> : null}
                    <small className="checkout-item-unit-price">
                      {itemQuoteReady ? <>
                        {hasDiscount && <del>{formatINR(quoteItem.unitPrice)}</del>}
                        <span>{formatINR(quoteItem.discountedUnitPrice)} × {item.quantity}</span>
                      </> : <span><QuoteValue loading={chargesLoading} label={`the price for ${item.productName}`} /></span>}
                    </small>
                    {hasDiscount && <small>{quoteItem.couponCode} applied</small>}
                  </span>
                  <b className="checkout-item-line-price">
                    {itemQuoteReady && hasDiscount && <del>{formatINR(quoteItem.lineTotal)}</del>}
                    <span><QuoteValue value={quoteItem?.discountedLineTotal} loading={chargesLoading} label={`the line total for ${item.productName}`} /></span>
                  </b>
                </article>
                );
              })}
            </div>
            <div className="checkout-totals">
              <p><span>Subtotal</span><strong><QuoteValue value={currentQuote?.discountedSubtotal} loading={chargesLoading} label="the subtotal" /></strong></p>
              {additionalCharges.map((charge) => (
                <p key={charge._id || charge.slug || charge.name}>
                  <span>{charge.name}</span>
                  <strong className={Number(charge.amount || 0) === 0 ? "free-label" : ""}>
                    {Number(charge.amount || 0) === 0 ? "Free" : formatINR(charge.amount)}
                  </strong>
                </p>
              ))}
              <p className="checkout-grand-total"><span>Total</span><strong><QuoteValue value={checkoutTotal} loading={chargesLoading} label="the total" /></strong></p>
            </div>
            {discountTotal > 0 && <p className="checkout-coupon-notice success"><BadgePercent size={15} /> Coupon savings included in product prices.</p>}
            {chargesError && (
              <div className="checkout-charge-error" role="alert">
                <span>{chargesError}</span>
                <button type="button" onClick={loadAdditionalCharges}>Retry</button>
              </div>
            )}
            <button className="checkout-pay-button" type="submit" disabled={busy || chargesLoading || Boolean(chargesError) || !currentQuote}>
              {paymentLabel}
            </button>
            <small className="checkout-final-sale-note">Please confirm the product, quantity, price, and delivery details before paying. Once placed, the order is final—no cancellation, return, or refund, except where required by law. <a href="/return-refund-policy">View policy</a></small>
            <small className="checkout-secure-note"><ShieldCheck size={15} /> Secured by Razorpay. UPI, cards, netbanking and supported payment methods are available in the payment window.</small>
          </aside>
        </form>
      </main>
      <Footer />
    </div>
  );
}
