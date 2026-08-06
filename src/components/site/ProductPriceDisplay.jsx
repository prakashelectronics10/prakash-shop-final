import { ArrowDown } from "lucide-react";
import { formatINR, resolveProductPricing } from "../../utils/productPricing";

/**
 * Product price block: MRP (strike) + selling ₹ + optional ↓discount%.
 */
export function ProductPriceDisplay({
  product,
  className = "",
  showDiscountBadge = false,
  size = "card",
}) {
  const pricing = resolveProductPricing(product);

  if (pricing.price === null && pricing.mrp === null) {
    return <strong className={`product-price-display ${className}`.trim()}>Price on request</strong>;
  }

  return (
    <div className={`product-price-display product-price-display--${size} ${className}`.trim()}>
      <div className="product-price-values">
        {pricing.showMrp ? (
          <span className="product-price-mrp">{formatINR(pricing.mrp)}</span>
        ) : null}
        <strong className="product-price-selling">
          {formatINR(pricing.price ?? pricing.mrp)}
        </strong>
      </div>
      {showDiscountBadge && pricing.showDiscount ? (
        <span className="product-price-discount" aria-label={`${pricing.discountPercent}% off`}>
          <ArrowDown className="product-price-discount-icon" aria-hidden="true" />
          {pricing.discountPercent}%
        </span>
      ) : null}
    </div>
  );
}
