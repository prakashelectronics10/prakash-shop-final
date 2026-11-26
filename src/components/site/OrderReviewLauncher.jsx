import { useState } from "react";
import { Star } from "lucide-react";
import { ReviewSheet } from "./ProductReviewsSection";

function productKey(product) {
  return `${product.sourceType}:${product.productId}`;
}

export function OrderReviewLauncher({ order, autoOpen = false }) {
  const products = order.reviewItems || [];
  const [sequence, setSequence] = useState(() => autoOpen && products.length ? products : null);
  const [position, setPosition] = useState(0);
  const [finished, setFinished] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const remaining = products.filter((product) => !finished.includes(productKey(product)));
  const current = sequence?.[position];

  function advance() {
    if (position + 1 < sequence.length) setPosition(position + 1);
    else setSequence(null);
  }

  return (
    <>
      {remaining.length > 0 && <button className="order-review-launch" type="button" onClick={() => { setPosition(0); setSequence(remaining); }}>
        <Star size={17} aria-hidden="true" /> {remaining.length === 1 ? "Review your product" : "Review your products"}
        {remaining.length > 1 && <span>{remaining.length}</span>}
      </button>}
      {submitted && !current && <p className="order-review-feedback" role="status">Thanks! Your review was submitted for approval.</p>}
      {current && <ReviewSheet key={productKey(current)}
        endpoint={`/product-reviews/public/${current.sourceType}/${encodeURIComponent(current.productId)}`}
        productName={current.productName} productImageUrl={current.productImageUrl} verifiedOrderId={order.orderId}
        sequence={{ position: position + 1, total: sequence.length, onSkip: advance }} onClose={() => setSequence(null)}
        onSubmitted={({ alreadySubmitted } = {}) => {
          setFinished((previous) => [...previous, productKey(current)]);
          if (!alreadySubmitted) setSubmitted(true);
          advance();
        }} />}
    </>
  );
}
