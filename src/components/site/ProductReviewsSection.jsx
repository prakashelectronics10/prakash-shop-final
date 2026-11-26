import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, CheckCircle2, PackageCheck, ShieldCheck, Star, X } from "lucide-react";
import { apiRequest } from "../../api/client";
import { RatingStars, StarRate } from "../ui/StarRate";
import { OptimizedImage } from "./OptimizedImage";
import "./ProductReviewsSection.css";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

function RatingSummary({ summary }) {
  const average = summary.average.toFixed(1);
  return (
    <div className="product-rating-summary">
      <div className="product-rating-overall">
        <strong>{average}</strong>
        <RatingStars value={Number(average)} />
        <span>Based on {summary.total.toLocaleString("en-IN")} {summary.total === 1 ? "rating" : "ratings"}</span>
      </div>
      <div className="product-rating-breakdown" role="group" aria-label="Rating breakdown">
        {summary.distribution.map(({ rating, count }) => (
          <div className="product-rating-row" key={rating}>
            <span>{rating}<Star size={13} aria-hidden="true" /></span>
            <progress max={summary.total} value={count} aria-label={`${rating} star ratings`} />
            <span>{count.toLocaleString("en-IN")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReviewSheet({ endpoint, productName, productImageUrl, initialRating = 0, verifiedOrderId = "", sequence, onClose, onSubmitted }) {
  const dialogRef = useRef(null);
  const orderRef = useRef(null);
  const ratingRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(verifiedOrderId ? "review" : "order");
  const [orderId, setOrderId] = useState(verifiedOrderId);
  const [rating, setRating] = useState(initialRating);
  const [review, setReview] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const active = useRef(false);
  const requestPending = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const trigger = document.activeElement;
    active.current = true;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      active.current = false;
      dialog.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (step === "order") orderRef.current?.focus();
    else ratingRef.current?.querySelector('[tabindex="0"]')?.focus();
  }, [step]);

  async function submit(event) {
    event.preventDefault();
    if (requestPending.current) return;
    const verifying = step === "order";
    const code = orderId.trim();
    if (verifying && !/^[a-z\d-]{4,64}$/i.test(code)) {
      setError("Enter a valid Order ID.");
      orderRef.current?.focus();
      return;
    }
    if (!verifying && !rating) {
      setError("Choose a star rating to continue.");
      ratingRef.current?.querySelector('[tabindex="0"]')?.focus();
      return;
    }
    requestPending.current = true;
    setPending(true);
    setError("");
    try {
      await apiRequest(verifying ? `${endpoint}/verify` : endpoint, {
        method: "POST",
        cache: "no-store",
        body: JSON.stringify(verifying ? { orderId: code } : { orderId: code, rating, review }),
      });
      if (!active.current) return;
      if (verifying) setStep("review");
      else onSubmitted();
    } catch (requestError) {
      if (!active.current) return;
      if (!verifying && verifiedOrderId && requestError.status === 409) {
        onSubmitted({ alreadySubmitted: true });
        return;
      }
      if (!verifying && !verifiedOrderId && [404, 409].includes(requestError.status)) setStep("order");
      setError(requestError.message || "We couldn’t complete your request. Please try again.");
    } finally {
      requestPending.current = false;
      if (active.current) setPending(false);
    }
  }

  const verifying = step === "order";
  return createPortal(
    <dialog ref={dialogRef} className="shop-filter-sheet-root product-review-dialog" aria-labelledby="product-review-dialog-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <button type="button" className="shop-filter-sheet-backdrop" tabIndex={-1} aria-label="Close review form" onClick={onClose} />
      <motion.div className="shop-filter-sheet product-review-sheet" layout={reduceMotion ? false : "size"}
        transition={{ layout: { duration: 0.24, ease: "easeOut" } }}>
        <div className="shop-filter-sheet-handle" aria-hidden="true" />
        <header className="shop-filter-sheet-header">
          <div className="product-review-sheet-heading">
            {(productImageUrl || sequence) && <span className="product-review-sheet-thumbnail">
              {productImageUrl ? <OptimizedImage src={productImageUrl} alt="" width={64} height={64} decoding="async" /> : <PackageCheck size={24} aria-hidden="true" />}
            </span>}
            <div>
              {sequence && <p className="shop-filter-sheet-kicker">Product {sequence.position} of {sequence.total}</p>}
              <h3 id="product-review-dialog-title">Rate this product</h3>
              <p className="product-review-sheet-product">{productName}</p>
            </div>
          </div>
          <button type="button" className="shop-filter-sheet-close" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        <form className="product-review-form" onSubmit={submit} noValidate>
          <div className="shop-filter-sheet-body product-review-sheet-body">
            {verifying ? (
              <div className="product-review-field">
                <label htmlFor="product-review-order">Order ID</label>
                <input ref={orderRef} id="product-review-order" name="orderId" type="text" autoComplete="off" autoCapitalize="characters"
                  spellCheck={false} maxLength={64} placeholder="Enter your Order ID" value={orderId} disabled={pending}
                  aria-invalid={Boolean(error)} aria-describedby={error ? "product-review-error" : "product-review-order-hint"}
                  onChange={(event) => { setOrderId(event.target.value); setError(""); }} />
                {error && <p className="product-review-error" id="product-review-error" role="alert">{error}</p>}
                <p id="product-review-order-hint">You can find your Order ID in your order confirmation.</p>
              </div>
            ) : (
              <>
                <div className="product-review-verified">
                  <span><ShieldCheck size={18} aria-hidden="true" /> Order verified</span>
                  {!verifiedOrderId && <button type="button" disabled={pending} onClick={() => { setError(""); setStep("order"); }}>Change Order ID</button>}
                </div>
                <div ref={ratingRef}><StarRate value={rating} onChange={setRating} label="Your product rating" /></div>
                <div className="product-review-field">
                  <label htmlFor="product-review-text">Your review <span>(optional)</span></label>
                  <textarea id="product-review-text" rows={4} maxLength={1200} value={review} disabled={pending}
                    placeholder="What was your experience with this product?" onChange={(event) => setReview(event.target.value)} />
                  <p>Your first name and last initial appear with your approved rating.</p>
                  {error && <p className="product-review-error" role="alert">{error}</p>}
                </div>
              </>
            )}
          </div>
          <div className={`shop-filter-sheet-footer product-review-sheet-footer${sequence ? " has-skip" : ""}`}>
            {sequence && <button className="shop-filter-sheet-reset" type="button" disabled={pending} onClick={sequence.onSkip}>Skip for now</button>}
            <button className="shop-filter-sheet-apply" type="submit" disabled={pending}>
              {verifying ? (pending ? "Verifying…" : "Continue") : (pending ? "Submitting…" : sequence?.position < sequence?.total ? "Submit & next" : "Submit review")}
            </button>
          </div>
        </form>
      </motion.div>
    </dialog>, document.body,
  );
}

export function ProductReviewsSection({ product, sourceType = "shop-product" }) {
  const endpoint = `/product-reviews/public/${sourceType}/${encodeURIComponent(product._id || product.sourceId)}`;
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRating, setSelectedRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    apiRequest(`${endpoint}?page=${page}`, { cache: "no-store" }).then(({ data }) => {
      if (!current) return;
      if (!Array.isArray(data?.items) || !Array.isArray(data.distribution)) throw new Error("Missing review data");
      setSummary((previous) => ({
        ...data,
        items: page === 1 ? data.items : Array.from(new Map(
          [...(previous?.items || []), ...data.items].map((item) => [item._id, item]),
        ).values()),
      }));
    }).catch(() => {
      if (current) setError("Ratings couldn’t be loaded. Please try again.");
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [endpoint, page, retry]);

  return (
    <section className="product-reviews" aria-labelledby="product-reviews-title">
      <h2 id="product-reviews-title">Ratings and reviews</h2>
      <div className={`product-reviews-top${summary?.total ? " has-ratings" : ""}`}>
        {summary?.total > 0 && <RatingSummary summary={summary} />}
        <div className="product-reviews-rate">
          {summary && <h3>{summary.total ? "Rate this product" : "Be the first to rate the product"}</h3>}
          <StarRate value={selectedRating} label="Rate this product" opensDialog onChange={(rating) => { setSubmitted(false); setSelectedRating(rating); }} />
        </div>
      </div>
      {submitted && <p className="product-review-submitted" role="status"><CheckCircle2 size={18} aria-hidden="true" /> Thanks! Your review was submitted for approval.</p>}
      {summary?.items.length > 0 && (
        <div className="product-reviews-approved">
          <h3>Customer reviews</h3>
          <ul className="product-review-cards" aria-label="Customer reviews" tabIndex={0}>
            {summary.items.map((item) => (
              <li className="product-review-card" key={item._id}>
                <div className="product-review-card-meta">
                  <div className="product-review-card-author">
                    <strong>{item.displayName || "Customer"}</strong>
                    <span className="product-review-card-badge" title="Verified buyer">
                      <BadgeCheck size={18} aria-hidden="true" />
                      <span className="sr-only">Verified buyer</span>
                    </span>
                  </div>
                  <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
                </div>
                <RatingStars value={item.rating} />
                {item.review && <p>{item.review}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {loading && <p className="product-reviews-message" role="status">Loading ratings…</p>}
      {error && <div className="product-reviews-message" role="alert">{error} <button type="button" onClick={() => setRetry((current) => current + 1)}>Try again</button></div>}
      {summary?.hasMore && !error && !loading && (
        <button className="product-reviews-more" type="button" onClick={() => setPage((current) => current + 1)}>Load more reviews</button>
      )}
      {selectedRating > 0 && <ReviewSheet endpoint={endpoint} productName={product.name} productImageUrl={product.imageUrl} initialRating={selectedRating}
        onClose={() => setSelectedRating(0)} onSubmitted={() => { setSelectedRating(0); setSubmitted(true); }} />}
    </section>
  );
}
