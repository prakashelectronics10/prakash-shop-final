import { useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { getProductShareText, getProductShareUrl } from "../../utils/productShare";

export function ProductShareButton({ product, className = "", compact = false, shareOverrides = null }) {
  const [status, setStatus] = useState("");
  const productForShare = shareOverrides ? { ...product, ...shareOverrides } : product;
  const productName = productForShare?.name || product?.name || "product";

  useEffect(() => {
    if (!status) return undefined;
    const timer = window.setTimeout(() => setStatus(""), 2400);
    return () => window.clearTimeout(timer);
  }, [status]);

  const shareProduct = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!productForShare) {
      setStatus("Unable to share this product.");
      return;
    }

    const url = getProductShareUrl(productForShare);
    const shareData = {
      title: productForShare.name || "Prakash Electronics product",
      text: getProductShareText(productForShare),
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setStatus("Shared");
        return;
      }

      if (!navigator.clipboard?.writeText) {
        throw new Error("Copy is not available in this browser.");
      }
      await navigator.clipboard.writeText(url);
      setStatus("Link copied");
    } catch (error) {
      if (error.name === "AbortError") return;
      setStatus(error.message || "Unable to share. Please copy the URL manually.");
    }
  };

  return (
    <button
      className={`product-share-button ${status ? "active" : ""} ${compact ? "compact" : ""} ${className}`.trim()}
      type="button"
      onClick={shareProduct}
      aria-label={`Share ${productName}`}
      title={status || `Share ${productName}`}
    >
      {status === "Shared" || status === "Link copied" ? <Check size={17} /> : <Share2 size={17} />}
      {!compact && <span>{status || "Share"}</span>}
    </button>
  );
}
