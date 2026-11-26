import { Star } from "lucide-react";
import "./ProductRatingBadge.css";

export function ProductRatingBadge({ summary }) {
  if (!summary?.total || !Number.isFinite(summary.average) || summary.average < 1 || summary.average > 5) return null;
  const rating = summary.average.toFixed(1);
  const count = summary.total.toLocaleString("en-IN");

  return (
    <span className="product-rating-badge" role="img" aria-label={`${rating} out of 5 from ${count} ${summary.total === 1 ? "rating" : "ratings"}`}>
      <Star size={13} fill="currentColor" aria-hidden="true" />
      <span aria-hidden="true">{rating} · {count}</span>
    </span>
  );
}
