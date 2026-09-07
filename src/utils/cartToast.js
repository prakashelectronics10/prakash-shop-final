import toast from "react-hot-toast";

function cartToastId(result, fallbackName) {
  const item = result?.item || {};
  return `cart-${item.cartId || item.productId || item.productName || fallbackName || "product"}`;
}

export function notifyCartResult(result, productName = "Product") {
  if (!result) return;
  const name = result.item?.productName || result.item?.name || productName || "Product";
  const options = { id: cartToastId(result, name) };

  if (result.status === "added") {
    toast.success(`${name} added to cart`, options);
    return;
  }

  if (result.message) {
    toast.error(result.message, options);
  }
}

