import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Check, ChevronRight, Edit3, LoaderCircle, PackageCheck, Plus, ReceiptIndianRupee, Search, ShoppingBag, Trash2, Truck, X } from "lucide-react";
import "./OrdersModule.css";

const STATUS_OPTIONS = [
  ["confirmed", "Confirmed"],
  ["shipped", "Shipped"],
  ["out_for_delivery", "Out for delivery"],
  ["delivered", "Delivered"],
  ["cancelled", "Cancelled"],
];

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function labelStatus(value) {
  return STATUS_OPTIONS.find(([key]) => key === value)?.[1] || value;
}

function orderChargeRows(order) {
  if (Array.isArray(order?.additionalCharges) && order.additionalCharges.length) return order.additionalCharges;
  return [{ name: "Delivery charge", slug: "delivery-charge", amount: order?.deliveryCharge || 0 }];
}

export default function OrdersModule({ apiFetch }) {
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ search: "", from: "", to: "" });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [chargesOpen, setChargesOpen] = useState(false);
  const [charges, setCharges] = useState([]);
  const [chargesLoading, setChargesLoading] = useState(false);
  const [chargeError, setChargeError] = useState("");
  const [chargeEditor, setChargeEditor] = useState(null);
  const [chargeForm, setChargeForm] = useState({ name: "", amount: "", isActive: true });
  const [chargeSaving, setChargeSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(async (nextPage = 1, append = false) => {
    const id = ++requestId.current;
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(nextPage), limit: "20" });
      if (applied.search) query.set("search", applied.search);
      if (applied.from) query.set("from", applied.from);
      if (applied.to) query.set("to", applied.to);
      const response = await apiFetch(`/orders/admin?${query}`);
      if (requestId.current !== id) return;
      const result = response.data;
      setOrders((current) => append ? [...current, ...result.items] : result.items);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setPage(nextPage);
    } catch (requestError) {
      if (requestId.current === id) setError(requestError.message || "Orders could not be loaded");
    } finally {
      if (requestId.current === id) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [apiFetch, applied]);

  useEffect(() => { load(1, false); }, [load]);

  useEffect(() => {
    if (!selected && !chargesOpen && !chargeEditor && !deleteTarget) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event) => {
      if (event.key !== "Escape") return;
      if (deleteTarget) setDeleteTarget(null);
      else if (chargeEditor) setChargeEditor(null);
      else if (chargesOpen) setChargesOpen(false);
      else setSelected(null);
    };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [selected, chargesOpen, chargeEditor, deleteTarget]);

  const applyFilters = (event) => {
    event.preventDefault();
    setApplied({ search: filters.search.trim(), from: filters.from, to: filters.to });
  };

  const resetFilters = () => {
    const empty = { search: "", from: "", to: "" };
    setFilters(empty);
    setApplied(empty);
  };

  const updateStatus = async (orderStatus) => {
    if (!selected || saving || orderStatus === selected.orderStatus) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/orders/admin/${selected._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ orderStatus }),
      });
      setSelected(response.data);
      setOrders((current) => current.map((order) => order._id === response.data._id ? response.data : order));
    } catch (requestError) {
      setError(requestError.message || "Status could not be updated");
    } finally {
      setSaving(false);
    }
  };

  const resolveCancellation = async (decision) => {
    if (!selected || saving) return;
    const message = decision === "accept"
      ? "Accept this cancellation and initiate the full Razorpay refund?"
      : "Reject this cancellation request?";
    if (!window.confirm(message)) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/orders/admin/${selected._id}/cancellation`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      setSelected(response.data);
      setOrders((current) => current.map((order) => order._id === response.data._id ? response.data : order));
    } catch (requestError) {
      setError(requestError.message || "Cancellation request could not be updated");
    } finally {
      setSaving(false);
    }
  };

  const loadCharges = async () => {
    setChargesLoading(true);
    setChargeError("");
    try {
      const response = await apiFetch("/orders/admin/charges");
      setCharges(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setChargeError(requestError.message || "Additional charges could not be loaded");
    } finally {
      setChargesLoading(false);
    }
  };

  const openCharges = () => {
    setChargesOpen(true);
    loadCharges();
  };

  const openChargeEditor = (charge = null) => {
    setChargeEditor(charge ? { mode: "edit", charge } : { mode: "create", charge: null });
    setChargeForm({
      name: charge?.name || "",
      amount: Number.isFinite(charge?.amount) ? String(charge.amount) : "",
      isActive: charge?.isActive !== false,
    });
    setChargeError("");
  };

  const saveCharge = async (event) => {
    event.preventDefault();
    if (chargeSaving) return;
    setChargeSaving(true);
    setChargeError("");
    try {
      const editing = chargeEditor?.mode === "edit";
      const systemCharge = Boolean(chargeEditor?.charge?.isSystem);
      const response = await apiFetch(
        editing ? `/orders/admin/charges/${chargeEditor.charge._id}` : "/orders/admin/charges",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(systemCharge
            ? { amount: chargeForm.amount }
            : { name: chargeForm.name.trim(), amount: chargeForm.amount, isActive: chargeForm.isActive }),
        },
      );
      setCharges((current) => editing
        ? current.map((charge) => charge._id === response.data._id ? response.data : charge)
        : [...current, response.data]);
      setChargeEditor(null);
    } catch (requestError) {
      setChargeError(requestError.message || "Additional charge could not be saved");
    } finally {
      setChargeSaving(false);
    }
  };

  const deleteCharge = async () => {
    if (!deleteTarget || chargeSaving) return;
    setChargeSaving(true);
    setChargeError("");
    try {
      await apiFetch(`/orders/admin/charges/${deleteTarget._id}`, { method: "DELETE" });
      setCharges((current) => current.filter((charge) => charge._id !== deleteTarget._id));
      setDeleteTarget(null);
    } catch (requestError) {
      setChargeError(requestError.message || "Additional charge could not be deleted");
    } finally {
      setChargeSaving(false);
    }
  };

  return (
    <section className="orders-admin-page">
      <div className="orders-admin-head glass-panel">
        <div><p className="eyebrow">Paid customer orders</p><h2>Orders</h2><span>{total} confirmed payment{total === 1 ? "" : "s"}</span></div>
        <div className="orders-admin-head-actions">
          <button type="button" onClick={openCharges}><ReceiptIndianRupee size={18} /> Manage Additional Charges</button>
          <ShoppingBag size={30} />
        </div>
      </div>

      <form className="orders-filter-bar glass-panel" onSubmit={applyFilters}>
        <label className="orders-search"><Search size={17} /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search name, phone, Order ID or payment ID" /></label>
        <label><CalendarDays size={16} /><span>From</span><input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label><CalendarDays size={16} /><span>To</span><input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <button type="submit">Apply</button>
        <button type="button" className="orders-reset" onClick={resetFilters}>Reset</button>
      </form>

      {error && <div className="orders-error" role="alert">{error}</div>}
      <div className="orders-list glass-panel">
        {loading ? (
          <div className="orders-state"><LoaderCircle className="orders-spinner" /><p>Loading orders…</p></div>
        ) : !orders.length ? (
          <div className="orders-state"><PackageCheck size={42} /><h3>No orders found</h3><p>Try a different search term or date range.</p></div>
        ) : (
          orders.map((order) => (
            <button className="order-list-row" type="button" key={order._id} onClick={() => setSelected(order)}>
              <span className="order-list-thumb">{order.items?.[0]?.productImageUrl ? <img src={order.items[0].productImageUrl} alt="" /> : <PackageCheck size={24} />}</span>
              <span className="order-list-primary"><strong>{order.customer?.name}</strong><small>{order.customer?.phone} · {order.orderId}</small></span>
              <span className="order-list-meta"><strong>{money(order.total)}</strong><small>{order.itemCount} items · {dateTime(order.paidAt)}</small></span>
              <span className={`admin-order-status ${order.orderStatus}`}>{labelStatus(order.orderStatus)}</span>
              <ChevronRight size={19} />
            </button>
          ))
        )}
        {hasMore && !loading && <button className="orders-load-more" type="button" disabled={loadingMore} onClick={() => load(page + 1, true)}>{loadingMore ? <><LoaderCircle className="orders-spinner" /> Loading…</> : `Load more (${orders.length} of ${total})`}</button>}
      </div>

      {selected && (
        <div className="order-drawer-layer" role="presentation">
          <button className="order-drawer-backdrop" type="button" aria-label="Close order details" onClick={() => setSelected(null)} />
          <aside className="order-admin-drawer" role="dialog" aria-modal="true" aria-label={`Order ${selected.orderId}`}>
            <header><div><p className="eyebrow">Order details</p><h2>{selected.orderId}</h2><span>{dateTime(selected.paidAt)}</span></div><button type="button" onClick={() => setSelected(null)} aria-label="Close"><X size={20} /></button></header>

            <section className="drawer-order-items">
              <h3>Items ({selected.itemCount})</h3>
              {selected.items.map((item) => (
                <a href={`/product/${encodeURIComponent(item.productSlug || item.productId)}`} target="_blank" rel="noreferrer" key={`${item.productId}-${item.productName}`}>
                  <span>{item.productImageUrl ? <img src={item.productImageUrl} alt={item.productName} /> : <PackageCheck size={24} />}</span>
                  <div><strong>{item.productName}</strong><small>{item.productCategory}</small><em>{money(item.unitPrice)} × {item.quantity}</em></div>
                  <b>{money(item.lineTotal)}</b>
                </a>
              ))}
            </section>

            {selected.cancellationRequest?.status && selected.cancellationRequest.status !== "none" && (
              <section className={`drawer-cancellation-request ${selected.cancellationRequest.status}`}>
                <div><AlertTriangle size={19} /><span><strong>Cancellation {selected.cancellationRequest.status}</strong><small>{dateTime(selected.cancellationRequest.requestedAt)}</small></span></div>
                <p>{selected.cancellationRequest.reason || "No reason provided."}</p>
                {selected.cancellationRequest.adminNote && <small>{selected.cancellationRequest.adminNote}</small>}
                {selected.cancellationRequest.status === "requested" && (
                  <div className="drawer-cancellation-actions">
                    <button type="button" className="secondary" disabled={saving} onClick={() => resolveCancellation("reject")}><X size={16} /> Reject</button>
                    <button type="button" disabled={saving} onClick={() => resolveCancellation("accept")}><Check size={16} /> Accept &amp; refund</button>
                  </div>
                )}
                {selected.cancellationRequest.status === "accepted" && <small>Refund: {selected.refund?.status || "processing"} · {money(selected.refund?.amount || selected.total)}</small>}
              </section>
            )}

            <section className="drawer-status-control">
              <label htmlFor="admin-order-status"><Truck size={18} /> Customer-visible status</label>
              <select id="admin-order-status" value={selected.orderStatus} disabled={saving} onChange={(e) => updateStatus(e.target.value)}>
                {STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <small>{saving ? "Updating status…" : "Changes appear immediately on the customer's tracking page."}</small>
            </section>

            <section className="drawer-detail-grid">
              <div><span>Customer</span><strong>{selected.customer?.name}</strong></div>
              <div><span>Phone</span><strong>{selected.customer?.phone}</strong></div>
              <div className="wide"><span>Address</span><strong>{selected.customer?.address}</strong></div>
              <div><span>Pincode</span><strong>{selected.customer?.pincode}</strong></div>
              <div><span>Landmark</span><strong>{selected.customer?.landmark || "Not provided"}</strong></div>
              <div className="wide"><span>Message</span><strong>{selected.customer?.message || "No message"}</strong></div>
              <div><span>Razorpay Order</span><strong>{selected.razorpayOrderId}</strong></div>
              <div><span>Payment ID</span><strong>{selected.razorpayPaymentId}</strong></div>
            </section>

            <section className="drawer-order-total">
              <p><span>Subtotal</span><strong>{money(selected.subtotal)}</strong></p>
              {selected.coupon && Number(selected.discountTotal || 0) > 0 && <p><span>Coupon {selected.coupon.code}</span><strong>−{money(selected.discountTotal)}</strong></p>}
              {orderChargeRows(selected).map((charge) => (
                <p key={charge.slug || charge.name}><span>{charge.name}</span><strong>{Number(charge.amount || 0) ? money(charge.amount) : "Free"}</strong></p>
              ))}
              <p><span>Paid total</span><strong>{money(selected.total)}</strong></p>
            </section>
          </aside>
        </div>
      )}

      {chargesOpen && (
        <div className="order-drawer-layer charges-drawer-layer" role="presentation">
          <button className="order-drawer-backdrop" type="button" aria-label="Close additional charges" onClick={() => setChargesOpen(false)} />
          <aside className="order-admin-drawer charges-admin-drawer" role="dialog" aria-modal="true" aria-label="Manage additional charges">
            <header>
              <div><p className="eyebrow">Checkout pricing</p><h2>Additional charges</h2><span>Changes apply to new payment orders.</span></div>
              <button type="button" onClick={() => setChargesOpen(false)} aria-label="Close"><X size={20} /></button>
            </header>
            <button className="add-charge-button" type="button" onClick={() => openChargeEditor()}><Plus size={18} /> Add new Additional charge</button>
            {chargeError && !chargeEditor && !deleteTarget && <div className="orders-error" role="alert">{chargeError}</div>}
            <div className="charges-admin-list">
              {chargesLoading ? (
                <div className="charges-admin-state"><LoaderCircle className="orders-spinner" /> Loading charges…</div>
              ) : charges.map((charge) => (
                <article className="charge-admin-card" key={charge._id}>
                  <span className="charge-admin-icon"><ReceiptIndianRupee size={20} /></span>
                  <div>
                    <span className="charge-admin-name"><strong>{charge.name}</strong>{charge.isSystem && <em>Protected</em>}</span>
                    <small>{charge.isActive ? "Shown in checkout" : "Hidden from checkout"}</small>
                  </div>
                  <strong className={Number(charge.amount || 0) === 0 ? "charge-free" : ""}>{Number(charge.amount || 0) === 0 ? "Free" : money(charge.amount)}</strong>
                  <div className="charge-admin-actions">
                    <button type="button" onClick={() => openChargeEditor(charge)} aria-label={`Edit ${charge.name}`}><Edit3 size={16} /></button>
                    {!charge.isSystem && <button className="danger" type="button" onClick={() => setDeleteTarget(charge)} aria-label={`Delete ${charge.name}`}><Trash2 size={16} /></button>}
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </div>
      )}

      {chargeEditor && (
        <div className="charge-modal-layer" role="presentation">
          <button className="charge-modal-backdrop" type="button" aria-label="Close charge editor" onClick={() => setChargeEditor(null)} />
          <form className="charge-modal" onSubmit={saveCharge} role="dialog" aria-modal="true" aria-label={chargeEditor.mode === "edit" ? "Edit additional charge" : "Add additional charge"}>
            <header><div><p className="eyebrow">{chargeEditor.mode === "edit" ? "Update charge" : "New charge"}</p><h3>{chargeEditor.charge?.isSystem ? "Delivery charge" : chargeEditor.mode === "edit" ? "Edit additional charge" : "Add additional charge"}</h3></div><button type="button" onClick={() => setChargeEditor(null)} aria-label="Close"><X size={19} /></button></header>
            {chargeEditor.charge?.isSystem && <p className="system-charge-note">Delivery charge is protected. Its name cannot be changed and it cannot be deleted. Leave the amount blank to offer free delivery.</p>}
            <label><span>Charge name</span><input value={chargeForm.name} disabled={Boolean(chargeEditor.charge?.isSystem)} onChange={(e) => setChargeForm({ ...chargeForm, name: e.target.value })} placeholder="e.g. Handling charge" required /></label>
            <label><span>Charge amount (₹) <em>Blank means Free</em></span><input type="number" min="0" max="1000000" step="0.01" inputMode="decimal" value={chargeForm.amount} onChange={(e) => setChargeForm({ ...chargeForm, amount: e.target.value })} placeholder="Free" /></label>
            {!chargeEditor.charge?.isSystem && <label className="charge-active-toggle"><input type="checkbox" checked={chargeForm.isActive} onChange={(e) => setChargeForm({ ...chargeForm, isActive: e.target.checked })} /><span><strong>Show in checkout</strong><small>Inactive charges remain saved but are not applied.</small></span></label>}
            {chargeError && <div className="orders-error" role="alert">{chargeError}</div>}
            <footer><button type="button" className="secondary" onClick={() => setChargeEditor(null)}>Cancel</button><button type="submit" disabled={chargeSaving}>{chargeSaving ? <LoaderCircle className="orders-spinner" /> : null}{chargeEditor.mode === "edit" ? "Save changes" : "Add charge"}</button></footer>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="charge-modal-layer" role="presentation">
          <button className="charge-modal-backdrop" type="button" aria-label="Cancel delete" onClick={() => setDeleteTarget(null)} />
          <section className="charge-modal charge-delete-modal" role="alertdialog" aria-modal="true" aria-label="Delete additional charge">
            <span className="charge-delete-icon"><Trash2 size={23} /></span>
            <h3>Delete “{deleteTarget.name}”?</h3>
            <p>This removes it from future checkouts. Existing paid orders keep their original charge details.</p>
            {chargeError && <div className="orders-error" role="alert">{chargeError}</div>}
            <footer><button type="button" className="secondary" onClick={() => setDeleteTarget(null)}>Keep charge</button><button type="button" className="danger" disabled={chargeSaving} onClick={deleteCharge}>{chargeSaving ? "Deleting…" : "Delete charge"}</button></footer>
          </section>
        </div>
      )}
    </section>
  );
}
