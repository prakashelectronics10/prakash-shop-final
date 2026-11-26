import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import toast from "react-hot-toast";
import { RatingStars } from "../components/ui/StarRate";
import ReviewWhatsAppSettings from "./ReviewWhatsAppSettings";
import "./ProductReviewsModule.css";

const initialFilters = { product: "", status: "", read: "", from: "", to: "" };
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
});

export default function ProductReviewsModule({ apiFetch }) {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [products, setProducts] = useState([]);
  const [result, setResult] = useState({ items: [], total: 0, pages: 0 });
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [listError, setListError] = useState("");
  const [productsError, setProductsError] = useState("");
  const [actionError, setActionError] = useState("");
  const saving = useRef(false);

  useEffect(() => {
    let current = true;
    setProductsError("");
    apiFetch("/product-reviews/admin/products", { cache: "no-store" }).then(({ data }) => {
      if (!Array.isArray(data)) throw new Error("Missing review products");
      if (current) setProducts(data);
    }).catch(() => {
      if (current) setProductsError("Couldn’t load the product filter. Refresh to try again.");
    });
    return () => { current = false; };
  }, [apiFetch, revision]);

  useEffect(() => {
    let current = true;
    const { product, ...otherFilters } = filters;
    const query = new URLSearchParams({ page: String(page) });
    if (product) {
      const [sourceType, productId] = product.split("/");
      query.set("sourceType", sourceType);
      query.set("productId", productId);
    }
    Object.entries(otherFilters).forEach(([name, value]) => { if (value) query.set(name, value); });
    setLoading(true);
    setListError("");
    apiFetch(`/product-reviews/admin?${query}`, { cache: "no-store" }).then(({ data }) => {
      if (!current) return;
      if (!Array.isArray(data?.items)) throw new Error("Couldn’t load reviews.");
      const lastPage = Math.max(1, data.pages);
      if (page > lastPage) setPage(lastPage);
      else setResult(data);
    }).catch((error) => {
      if (current) setListError(error.message || "Couldn’t load reviews.");
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [apiFetch, filters, page, revision]);

  function apply(event) {
    event.preventDefault();
    setActionError("");
    setPage(1);
    setFilters({ ...draft });
  }

  function reset() {
    setActionError("");
    setDraft(initialFilters);
    setPage(1);
    setFilters(initialFilters);
  }

  async function update(item, body) {
    if (saving.current) return;
    saving.current = true;
    setSavingId(item._id);
    setActionError("");
    try {
      await apiFetch(`/product-reviews/admin/${item._id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.success(body.status ? `Review ${body.status}` : `Review marked ${body.read ? "read" : "unread"}`);
      setRevision((current) => current + 1);
    } catch (error) {
      setActionError(error.message || "Couldn’t update the review.");
    } finally {
      saving.current = false;
      setSavingId("");
    }
  }

  return (
    <section className="admin-product-reviews" aria-labelledby="admin-product-reviews-title">
      <header className="admin-product-reviews-head">
        <div>
          <h2 id="admin-product-reviews-title">Ratings and reviews</h2>
          <p className="muted">Approved reviews appear on the product page and count toward its rating.</p>
        </div>
        <button type="button" className="ghost-button" onClick={() => setRevision((current) => current + 1)} disabled={loading}><RefreshCw size={16} /> Refresh</button>
      </header>
      <ReviewWhatsAppSettings apiFetch={apiFetch} />
      <form className="admin-review-filters glass-panel" onSubmit={apply}>
        <label>Product<select value={draft.product} onChange={(event) => setDraft({ ...draft, product: event.target.value })}>
          <option value="">All products</option>
          {products.map((product) => (
            <option key={`${product.sourceType}/${product.productId}`} value={`${product.sourceType}/${product.productId}`}>
              {product.name} ({product.sourceType === "project-part" ? "Wiring" : "Shop"})
            </option>
          ))}
        </select></label>
        <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
          <option value="">All statuses</option><option value="pending">Pending</option>
          <option value="approved">Approved</option><option value="declined">Declined</option>
        </select></label>
        <label>Read status<select value={draft.read} onChange={(event) => setDraft({ ...draft, read: event.target.value })}>
          <option value="">All reviews</option><option value="unread">Unread</option><option value="read">Read</option>
        </select></label>
        <label>From<input type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
        <label>To<input type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
        <div className="admin-review-actions"><button type="submit" className="primary-button">Apply filters</button><button type="button" className="ghost-button" onClick={reset}>Reset</button></div>
      </form>

      {productsError && <p className="orders-error" role="alert">{productsError}</p>}
      {listError && <p className="orders-error" role="alert">{listError}</p>}
      {actionError && <p className="orders-error" role="alert">{actionError}</p>}
      {loading ? <p className="muted" role="status">Loading reviews…</p> : !listError && (
        <>
          <p className="muted" role="status">{result.total.toLocaleString("en-IN")} {result.total === 1 ? "review" : "reviews"}</p>
          {result.items.length === 0 ? <p className="admin-review-empty glass-panel">No reviews match these filters.</p> : (
            <div className="admin-review-list">
              {result.items.map((item) => (
                <article className="admin-review-card glass-panel" key={item._id}>
                  <div className="admin-review-card-heading">
                    <div>
                      <h3>{item.productName}</h3>
                      <p className="muted"><span>Order {item.orderId}</span> <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time></p>
                    </div>
                    <div className="admin-review-badges">
                      <span data-status={item.status}>{item.status}</span>
                      {!item.readAt && <span data-status="unread">Unread</span>}
                    </div>
                  </div>
                  <RatingStars value={item.rating} />
                  {item.review ? <p className="admin-review-text">{item.review}</p> : <p className="muted">Rating only</p>}
                  <div className="admin-review-actions" aria-label="Review actions">
                    {item.status !== "approved" && <button type="button" className="primary-button" disabled={Boolean(savingId)} onClick={() => update(item, { status: "approved" })}><Check size={16} /> Approve</button>}
                    {item.status !== "declined" && <button type="button" className="ghost-button admin-review-decline" disabled={Boolean(savingId)} onClick={() => update(item, { status: "declined" })}><X size={16} /> Decline</button>}
                    <button type="button" className="ghost-button" disabled={Boolean(savingId)} onClick={() => update(item, { read: !item.readAt })}>Mark as {item.readAt ? "unread" : "read"}</button>
                    {savingId === item._id && <span className="muted" role="status">Saving…</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
          {result.pages > 1 && <nav className="admin-review-pages" aria-label="Review pages">
            <button type="button" className="ghost-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {result.pages}</span>
            <button type="button" className="ghost-button" disabled={page >= result.pages} onClick={() => setPage(page + 1)}>Next</button>
          </nav>}
        </>
      )}
    </section>
  );
}
