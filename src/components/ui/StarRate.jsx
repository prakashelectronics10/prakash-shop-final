import { useState } from "react";
import { Star } from "lucide-react";
import "./StarRate.css";

const stars = [1, 2, 3, 4, 5];
const words = ["Tap a star to rate", "Not for me", "It was fine", "Good", "Really good", "Loved it"];

export function RatingStars({ value }) {
  return (
    <span className="rating-stars" role="img" aria-label={`${value} out of 5 stars`}>
      {stars.map((star) => (
        <span className="rating-stars-icon" key={star} aria-hidden="true">
          <Star />
          <span style={{ width: `${Math.max(0, Math.min(1, value - star + 1)) * 100}%` }}><Star /></span>
        </span>
      ))}
    </span>
  );
}

export function StarRate({ value, onChange, label = "Rating", opensDialog = false }) {
  const [hover, setHover] = useState(0);
  const [beat, setBeat] = useState(0);
  const shown = hover || value;

  function choose(rating) {
    setBeat((current) => current + 1);
    onChange(rating);
  }

  function onKeyDown(event) {
    const next = { ArrowRight: value + 1, ArrowUp: value + 1, ArrowLeft: value - 1, ArrowDown: value - 1, Home: 1, End: 5 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const rating = Math.min(5, Math.max(1, next));
    choose(rating);
    event.currentTarget.querySelector(`[data-rating="${rating}"]`)?.focus();
  }

  return (
    <div className="star-rate">
      <div className="star-rate-controls" role={opensDialog ? "group" : "radiogroup"} aria-label={label}
        onKeyDown={opensDialog ? undefined : onKeyDown} onPointerLeave={() => setHover(0)}>
        {stars.map((star) => (
          <button type="button" className="star-rate-button" key={star} data-rating={star}
            role={opensDialog ? undefined : "radio"} aria-haspopup={opensDialog ? "dialog" : undefined}
            aria-checked={opensDialog ? undefined : value === star} aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
            tabIndex={opensDialog || (value || 1) === star ? 0 : -1}
            data-filled={star <= shown ? "" : undefined}
            data-pop={beat > 0 && star <= value ? (beat % 2 ? "a" : "b") : undefined}
            style={{ "--star-delay": `${(star - 1) * 65}ms` }}
            onPointerEnter={(event) => { if (event.pointerType === "mouse") setHover(star); }}
            onClick={() => choose(star)}>
            <Star aria-hidden="true" />
            {star === 5 && value === 5 && beat > 0 && (
              <span className="star-rate-sparks" key={beat} aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => <i key={index} style={{ "--spark-angle": `${index * 45}deg` }} />)}
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="star-rate-word" aria-live="polite">{words[shown]}</p>
    </div>
  );
}
