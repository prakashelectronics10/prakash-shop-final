import { useId, useMemo } from "react";
import { Check } from "lucide-react";
import {
  cleanHexColour,
  findCombinationByOptionIds,
  findCombinationForOption,
  productHasVariants,
  resolveOptionDisplayType,
  resolveVariantPricing,
  resolveVariantStock,
  selectionLabels,
  sortedGroups,
  sortedOptions,
} from "../../utils/productVariants";
import { formatINR, resolveProductPricing } from "../../utils/productPricing";
import { OptimizedImage } from "./OptimizedImage";
import "./ProductVariantSelector.css";

function getContrastingColour(colour) {
  const hex = colour.slice(1);
  const expanded = hex.length === 3 ? [...hex].map((digit) => digit.repeat(2)).join("") : hex;
  const [red, green, blue] = [0, 2, 4].map((index) => {
    const channel = Number.parseInt(expanded.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.179 ? "#000" : "#fff";
}

function OptionButton({
  group,
  option,
  selected,
  disabled,
  unavailable,
  price,
  onSelect,
}) {
  const displayType = resolveOptionDisplayType(group, option);
  const label = option.label || "Option";
  const colour = cleanHexColour(option.colour);
  const selectedTheme = selected && colour
    ? { "--variant-selected-colour": colour, "--variant-check-background": getContrastingColour(colour) }
    : undefined;
  const className = [
    "variant-option",
    `variant-option--${displayType}`,
    selected ? "is-selected" : "",
    unavailable ? "is-unavailable" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={className}
      style={selectedTheme}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${label}${price ? `, ${price}` : ""}${unavailable ? " (out of stock)" : ""}`}
    >
      {displayType === "image_text" ? (
        <span className="variant-option-media" aria-hidden="true">
          <OptimizedImage
            src={option.imageUrl}
            alt=""
            width={160}
            height={120}
            sizes="(max-width: 720px) 28vw, 120px"
            loading="lazy"
            decoding="async"
          />
        </span>
      ) : null}
      <span className="variant-option-info">
        <span className="variant-option-title">
          {displayType === "color_text" ? (
            <span
              className="variant-option-swatch"
              style={{ backgroundColor: colour || "#cbd5e1" }}
              aria-hidden="true"
            />
          ) : null}
          <span className="variant-option-label">{label}</span>
        </span>
        {price && <span className="variant-option-price">{price}</span>}
      </span>
      {selected && (
        <Check
          className="variant-option-check"
          size={13}
          strokeWidth={3}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

export function ProductVariantSelector({
  product,
  selectedOptionIds = [],
  onChange,
  className = "",
}) {
  const selectorId = useId();
  const groups = useMemo(() => sortedGroups(product), [product]);
  const selections = useMemo(
    () => selectionLabels(product, selectedOptionIds),
    [product, selectedOptionIds],
  );

  if (!productHasVariants(product) || !groups.length) return null;
  const activeCombination = findCombinationByOptionIds(product, selectedOptionIds);

  return (
    <div className={`product-variant-selector ${className}`.trim()} role="group" aria-label="Product variants">
      {groups.map((group) => {
        const selected = selections.find((item) => String(item.groupId) === String(group.id));
        const options = sortedOptions(group);
        const hasImageOptions = options.some((option) => resolveOptionDisplayType(group, option) === "image_text");
        return (
          <section key={group.id} className="variant-group" aria-labelledby={`${selectorId}-${group.id}`}>
            <header className="variant-group-header">
              <h3 id={`${selectorId}-${group.id}`}>{group.name}</h3>
              {selected ? <span className="variant-group-selected" aria-live="polite">{selected.label}</span> : null}
            </header>
            <div className={`variant-option-grid ${hasImageOptions ? "variant-option-grid--images" : ""}`}>
              {options.map((option) => {
                const selectedOption = selectedOptionIds.includes(String(option.id));
                const combination = findCombinationForOption(product, option.id, selectedOptionIds);
                const priceCombination = selectedOption ? activeCombination : (
                  combination || findCombinationForOption(product, option.id, selectedOptionIds, { availableOnly: false })
                );
                const amount = priceCombination && resolveVariantPricing(product, priceCombination, resolveProductPricing).price;
                const unavailable = selectedOption ? resolveVariantStock(product, activeCombination) < 1 : !combination;
                return (
                  <OptionButton
                    key={option.id}
                    group={group}
                    option={option}
                    selected={selectedOption}
                    disabled={!combination && !selectedOption}
                    unavailable={unavailable}
                    price={Number.isFinite(amount) && amount > 0 ? formatINR(amount) : ""}
                    onSelect={() => {
                      if (!selectedOption && combination) onChange?.(combination);
                    }}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default ProductVariantSelector;
