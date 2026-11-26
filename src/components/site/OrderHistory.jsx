import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, CreditCard, ListOrdered, MessageCircle, ReceiptText, X } from "lucide-react";
import { apiRequest } from "../../api/client";
import { formatINR } from "../../utils/productPricing";
import { PAYMENT_RECOVERY_URL, savePaymentRecovery } from "../../utils/orderPayment";
import { WhatsAppOtpModal } from "./WhatsAppOtpModal";
import "./OrderHistory.css";

const PAYMENT_LABELS = {
  paid: "Paid", failed: "Payment unsuccessful", pending: "Awaiting payment", refunded: "Refunded", cod: "Cash on delivery",
};

function orderDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(date)
    : "Date unavailable";
}

function PaymentBadge({ status }) {
  return <span className={`order-history-badge is-${status}`}>{PAYMENT_LABELS[status] || "Unknown"}</span>;
}

function OrderHistoryRow({ order, onOpen }) {
  const items = order.items || [];
  return (
    <li>
      <button className="order-history-row" type="button" onClick={onOpen} aria-label={`View order ${order.orderId}`}>
        <span className="order-history-row-top">
          <span>
            <strong>{order.orderId}</strong>
            <span className="order-history-meta"><CalendarDays size={14} /> {orderDate(order.placedAt)}</span>
          </span>
          <span className="order-history-row-price">
            <strong>{formatINR(order.total)}</strong>
            <PaymentBadge status={order.paymentStatus} />
          </span>
          <ChevronRight className="order-history-chevron" size={18} aria-hidden="true" />
        </span>
        <span className="order-history-preview">
          {items.slice(0, 2).map((item, index) => (
            <span key={item._id || index}>
              <span>{item.productName}{item.variantSummary && <small>{item.variantSummary}</small>}</span>
              <span>× {item.quantity}</span>
            </span>
          ))}
          {items.length > 2 && <small>+ {items.length - 2} more</small>}
        </span>
        <span className="order-history-meta"><ReceiptText size={14} /> {order.invoiceNumber || (order.paymentStatus === "paid" ? "Invoice pending" : "No invoice")}</span>
      </button>
    </li>
  );
}

function OrderDetailsSheet({ order, onClose, onPay, busy, message, renderDetails }) {
  const dialog = useRef(null);
  const pointer = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = oldOverflow;
      if (element.open && typeof element.close === "function") element.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="shop-filter-sheet order-history-sheet"
      aria-labelledby="order-history-detail"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="order-history-grip" aria-hidden="true"
        onPointerDown={(event) => { pointer.current = event.clientY; event.currentTarget.setPointerCapture?.(event.pointerId); }}
        onPointerUp={(event) => {
          if (pointer.current !== null && event.clientY - pointer.current > 45) onClose();
          pointer.current = null;
        }}
        onPointerCancel={() => { pointer.current = null; }}
      ><div className="shop-filter-sheet-handle" /></div>
      <header className="shop-filter-sheet-header">
        <div>
          <p className="shop-filter-sheet-kicker">Order details</p>
          <h3 id="order-history-detail">{order.orderId}</h3>
        </div>
        <button className="shop-filter-sheet-close" type="button" onClick={onClose} aria-label="Close order details"><X size={18} /></button>
      </header>
      <div className="shop-filter-sheet-body">
        <div className="order-history-sheet-meta">
          <PaymentBadge status={order.paymentStatus} />
          {order.invoiceNumber && <span className="order-history-meta"><ReceiptText size={14} /> {order.invoiceNumber}</span>}
        </div>
        {renderDetails(order)}
      </div>
      {(order.canPay || message) && (
        <footer className="shop-filter-sheet-footer order-history-sheet-footer">
          {message && <p role="status">{message}</p>}
          {order.canPay && <button type="button" className="shop-filter-sheet-apply" disabled={busy} onClick={onPay}>
            <CreditCard size={18} /> {busy ? "Checking payment…" : `Pay now · ${formatINR(order.total)}`}
          </button>}
        </footer>
      )}
    </dialog>
  );
}

const SESSION_KEY = "prakash.orderHistory";

function readSession() {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(SESSION_KEY));
    if (saved?.challengeId && saved?.verifiedToken && saved.expiresAt > Date.now()) return saved;
  } catch {
    // Storage can be unavailable in embedded browsers.
  }
  return null;
}

function saveSession(credentials) {
  try {
    if (credentials) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(credentials));
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Keep verification in memory when storage is unavailable.
  }
}

function request(path, credentials, data = {}) {
  return apiRequest(path, {
    method: "POST", cache: "no-store", timeout: 45000,
    body: JSON.stringify({ challengeId: credentials.challengeId, verifiedToken: credentials.verifiedToken, ...data }),
  }).then((response) => response.data);
}

export function OrderHistory({ renderDetails }) {
  const [expanded, setExpanded] = useState(false);
  const [number, setNumber] = useState("");
  const [otpOpen, setOtpOpen] = useState(false);
  const [auth, setAuth] = useState(null);
  const [orders, setOrders] = useState([]);
  const [cursor, setCursor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [paying, setPaying] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const authRef = useRef(null);
  const paymentTask = useRef(null);

  const closeDetails = useCallback(() => {
    paymentTask.current = null;
    setSelected(null);
    setPaying(false);
  }, []);

  const revoke = useCallback(() => {
    saveSession(null);
    authRef.current = null;
    setAuth(null);
    setOrders([]);
    setCursor("");
    setLoading(false);
    closeDetails();
  }, [closeDetails]);

  useEffect(() => {
    if (!auth) return undefined;
    const timeout = window.setTimeout(() => {
      revoke();
      setError("Your verification expired. Request a new code to view orders.");
    }, Math.max(0, auth.expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [auth, revoke]);

  const loadOrders = useCallback(async (credentials, after = "") => {
    setLoading(true);
    setError("");
    try {
      const page = await request("/orders/history", credentials, { cursor: after });
      if (authRef.current !== credentials) return;
      setOrders((previous) => after ? [...previous, ...page.orders] : page.orders);
      setCursor(page.nextCursor);
    } catch (err) {
      if (authRef.current === credentials) {
        if (err.status === 401) revoke();
        setError(err.message || "Order history could not be loaded.");
      }
    } finally {
      if (authRef.current === credentials) setLoading(false);
    }
  }, [revoke]);

  const onVerified = useCallback((credentials) => {
    const session = {
      challengeId: credentials.challengeId,
      verifiedToken: credentials.verifiedToken,
      expiresAt: credentials.expiresAt || Date.now() + (credentials.expiresInMs || 15 * 60 * 1000),
    };
    saveSession(session);
    authRef.current = session;
    setAuth(session);
    setExpanded(true);
    setOtpOpen(false);
    void loadOrders(session);
  }, [loadOrders]);

  useEffect(() => {
    const stored = readSession();
    if (stored) onVerified(stored);
  }, [onVerified]);

  const pay = async () => {
    if (!auth || !selected || paymentTask.current) return;
    const task = {};
    paymentTask.current = task;
    setPaying(true);
    setPaymentMessage("");
    try {
      const result = await request(`/orders/history/${encodeURIComponent(selected.orderId)}/pay`, auth);
      if (paymentTask.current !== task) return;
      if (result.paymentUrl) {
        window.location.assign(result.paymentUrl);
        return;
      }
      if (result.razorpayOrderId) {
        savePaymentRecovery(result, { startPayment: true });
        window.location.assign(PAYMENT_RECOVERY_URL);
        return;
      }
      if (result.order) {
        setSelected((current) => current?.orderId === result.order.orderId
          ? { ...current, ...result.order, placedAt: current.placedAt, canPay: false } : current);
        void loadOrders(auth);
      } else {
        setPaymentMessage(result.processing
          ? "Razorpay is confirming your payment. Check again in a moment before retrying."
          : "This order is no longer eligible for payment.");
      }
    } catch (err) {
      if (paymentTask.current === task) {
        if (err.status === 401) {
          revoke();
          setError(err.message);
        } else setPaymentMessage(err.message || "Payment could not be started.");
      }
    } finally {
      if (paymentTask.current === task) {
        paymentTask.current = null;
        setPaying(false);
      }
    }
  };

  return (
    <section className="order-history" aria-label="Order history">
      <button type="button" className="order-history-trigger" aria-expanded={expanded} aria-controls="verified-order-history"
        onClick={() => setExpanded(!expanded)}>
        <ListOrdered size={18} /> View all orders <ChevronRight size={16} aria-hidden="true" />
      </button>
      {expanded && <div id="verified-order-history" className="order-history-panel">
        {auth ? (
          <>
            <header className="order-history-header">
              <h2>Your orders</h2>
              <button type="button" onClick={() => { revoke(); setNumber(""); setError(""); }}>Change number</button>
            </header>
            <ul className="order-history-list">
              {orders.map((order) => <OrderHistoryRow key={order.orderId} order={order}
                onOpen={() => { setPaymentMessage(""); setSelected(order); }} />)}
            </ul>
            {!loading && !error && !orders.length && <p>No orders were found for this WhatsApp number.</p>}
            {loading && <p role="status">Loading orders…</p>}
            {error && <p role="alert">{error}</p>}
            {!loading && (cursor || error) && <button type="button" className="order-history-trigger"
              onClick={() => loadOrders(auth, cursor)}>{error ? "Try again" : "Load more orders"}</button>}
          </>
        ) : (
          <form className="order-history-number-form" onSubmit={(event) => {
            event.preventDefault();
            if (/^[6-9]\d{9}$/.test(number)) setOtpOpen(true);
            else setError("Enter a valid 10-digit WhatsApp number.");
          }}>
            <label htmlFor="order-history-number">WhatsApp number</label>
            <div>
              <span aria-hidden="true">+91</span>
              <input id="order-history-number" type="tel" inputMode="numeric" autoComplete="tel-national" value={number}
                onChange={(event) => { setNumber(event.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }} />
              <button type="submit"><MessageCircle size={17} /> Send code</button>
            </div>
            {error && <p role="alert">{error}</p>}
          </form>
        )}
      </div>}
      <WhatsAppOtpModal open={otpOpen} purpose="order-history" whatsappNumber={number} onClose={() => setOtpOpen(false)} onVerified={onVerified} />
      {selected && <OrderDetailsSheet order={selected} onClose={closeDetails}
        onPay={pay} busy={paying} message={paymentMessage} renderDetails={renderDetails} />}
    </section>
  );
}
