import { Search, Sparkles, X } from "lucide-react";
import { openPulseAIWithSearchPrompt } from "../../utils/pulseAISearchPrompt";
import "./CatalogSearchField.css";

export function CatalogSearchStatus({ phase, total, mode }) {
  const progress = {
    searching: "Updating results...",
    analyzing: "AI analyzing...",
  }[phase];
  const matchLabel = {
    ai: " · AI-matched results",
    similar: " · Similar matches",
  }[mode] || "";

  return (
    <span className="parts-search-count shop-count" role="status">
      {progress || `${total} ${total === 1 ? "product" : "products"}${matchLabel}`}
    </span>
  );
}

export function CatalogSearchField({ id, label, placeholder, value, onChange }) {
  return (
    <div className="parts-search shop-search catalog-search-field">
      <label htmlFor={id} className="catalog-search-field-icon">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </label>
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button className="catalog-search-clear" type="button" onClick={() => onChange("")} aria-label="Clear search">
          <X size={15} aria-hidden="true" />
        </button>
      )}
      {value.trim() && (
        <button className="catalog-ask-ai" type="button" onClick={() => openPulseAIWithSearchPrompt(value)}>
          <Sparkles size={15} aria-hidden="true" />
          <span>Ask AI</span>
        </button>
      )}
    </div>
  );
}
