import { useState, useRef, useCallback, useEffect } from "react";
import { CalendarClock, ShoppingBag, Trash2, UploadCloud, X, AlertTriangle, MapPin, CheckCircle2 } from "lucide-react";
import { apiRequest } from "../../api/client";
import { cartItemToBookingProduct, cartStockMessage, getCartStockLimit, useCart } from "../../context/CartContext";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { OptimizedImage } from "./OptimizedImage";
import { BookingSuccessOverlay } from "./BookingSuccessOverlay";

const LOCATION_PLACEHOLDER = "e.g. Chitarpur, Ramgarh, Jharkhand 825101";

const initialForm = {
  fullName: "",
  customerEmail: "",
  phoneNumber: "",
  whatsappNumber: "",
  address: "",
  pincode: "",
  landmark: "",
  repairType: "",
  message: "",
};

function normalizeSelectedProduct(product = {}) {
  return {
    productId: String(product.productId || product._id || product.id || product.sourceId || "").trim(),
    productSlug: String(product.productSlug || product.slug || "").trim(),
    productName: String(product.productName || product.name || "Product").trim(),
    productCategory: String(product.productCategory || product.category || "Electronics").trim(),
    originalCategory: String(product.originalCategory || "").trim(),
    productImageUrl: String(product.productImageUrl || product.imageUrl || "").trim(),
    productDescription: String(product.productDescription || product.shortDescription || product.description || "").trim(),
    price: product.price === "" || product.price === undefined ? null : product.price,
    quantity: Math.max(1, Number.parseInt(product.quantity || 1, 10) || 1),
    stockQuantity: Number.parseInt(product.stockQuantity ?? product.availableQuantity ?? product.stock, 10) || undefined,
    sourceType: String(product.sourceType || "").trim(),
    sourceId: String(product.sourceId || product.productId || product._id || product.id || "").trim(),
    bookingSource: String(product.bookingSource || "").trim(),
  };
}

function selectedProductsRepairType(products) {
  if (!products.length) return "";
  const fromCart = products.length > 1 || products.some((product) => product.bookingSource === "cart");
  return fromCart ? "Products by Cart" : "Products";
}

function selectedProductKey(product) {
  return [
    product.sourceType,
    product.productId,
    product.productSlug,
    product.sourceId,
    product.productName,
  ].filter(Boolean).join(":");
}

function selectedProductsSummary(products) {
  if (!products.length) return {};
  const first = products[0];
  const names = products.map((product) => `${product.productName}${product.quantity > 1 ? ` x${product.quantity}` : ""}`);
  const categories = [...new Set(products.map((product) => product.productCategory).filter(Boolean))];
  return {
    productId: first.productId || first.sourceId || "",
    productSlug: first.productSlug || "",
    productName: products.length === 1 ? first.productName : `${products.length} products: ${names.slice(0, 4).join(", ")}${names.length > 4 ? "..." : ""}`,
    productCategory: products.length === 1 ? first.productCategory : categories.slice(0, 3).join(", ") || "Multiple products",
    productImageUrl: first.productImageUrl || "",
    bookingSource: products.length > 1 ? "cart" : first.bookingSource || "product-detail",
  };
}

export function Booking() {
  const { items: cartItems, clearCart } = useCart();
  const [form, setForm] = useState(initialForm);
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [status, setStatus] = useState("");
  const [emailCheck, setEmailCheck] = useState({ status: "idle", message: "" });
  const [addressCheck, setAddressCheck] = useState({
    status: "idle",
    message: "",
    suggestions: [],
    verifiedAddress: "",
  });
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const fileInputRef = useRef(null);
  const selectionLoadedRef = useRef(false);
  const addressVerifiedRef = useRef("");

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateDigits = (key, value) => update(key, value.replace(/\D/g, "").slice(0, 10));
  const updatePincode = (value) => update("pincode", value.replace(/\D/g, "").slice(0, 6));

  const markAddressUnverified = useCallback((message = "") => {
    addressVerifiedRef.current = "";
    setAddressCheck({
      status: message ? "invalid" : "idle",
      message,
      suggestions: [],
      verifiedAddress: "",
    });
  }, []);

  const applyVerifiedAddress = useCallback((formatted, message = "Location verified") => {
    const value = String(formatted || "").trim();
    if (!value) return;
    addressVerifiedRef.current = value;
    setForm((current) => ({ ...current, address: value }));
    setAddressCheck({
      status: "valid",
      message,
      suggestions: [],
      verifiedAddress: value,
    });
  }, []);

  useEffect(() => {
    const email = form.customerEmail.trim().toLowerCase();
    if (!email) {
      setEmailCheck({ status: "idle", message: "" });
      return undefined;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setEmailCheck({ status: "invalid", message: "Invalid email address" });
      return undefined;
    }

    let active = true;
    setEmailCheck({ status: "checking", message: "Verifying email..." });
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiRequest("/public/validate-email", {
          method: "POST",
          body: JSON.stringify({ email }),
          cache: "no-store",
          timeout: 8000,
        });
        if (!active) return;
        setEmailCheck({
          status: response.valid ? "valid" : "invalid",
          message: response.message || (response.valid ? "Email verified" : "Invalid email address"),
        });
      } catch (error) {
        if (!active) return;
        setEmailCheck({ status: "invalid", message: error.message || "Invalid email address" });
      }
    }, 650);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [form.customerEmail]);

  useEffect(() => {
    const query = form.address.trim();
    if (!query) {
      markAddressUnverified();
      return undefined;
    }

    // Already locked to a verified formatted place
    if (addressVerifiedRef.current && addressVerifiedRef.current === query) {
      setAddressCheck((current) => (
        current.status === "valid" && current.verifiedAddress === query
          ? current
          : {
              status: "valid",
              message: "Location verified",
              suggestions: [],
              verifiedAddress: query,
            }
      ));
      return undefined;
    }

    if (query.length < 3) {
      markAddressUnverified("Type a full location (Area, City, State or PIN)");
      return undefined;
    }

    let active = true;
    setAddressCheck((current) => ({
      ...current,
      status: "checking",
      message: "Searching real locations...",
      verifiedAddress: "",
    }));

    const timer = window.setTimeout(async () => {
      try {
        const response = await apiRequest("/public/suggest-addresses", {
          method: "POST",
          body: JSON.stringify({ query }),
          cache: "no-store",
          timeout: 10000,
        });
        if (!active) return;
        const suggestions = Array.isArray(response.suggestions) ? response.suggestions : [];
        setAddressCheck({
          status: suggestions.length ? "suggest" : "invalid",
          message: response.message || (suggestions.length
            ? "Select a verified location from the list"
            : "No matching place found. Try City, Area, State or PIN"),
          suggestions,
          verifiedAddress: "",
        });
      } catch (error) {
        if (!active) return;
        setAddressCheck({
          status: "invalid",
          message: error.message || "Unable to verify location",
          suggestions: [],
          verifiedAddress: "",
        });
      }
    }, 550);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [form.address, markAddressUnverified]);

  useEffect(() => {
    if (selectionLoadedRef.current) return;
    selectionLoadedRef.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const cartBooking = JSON.parse(sessionStorage.getItem("selectedCartBooking") || "null");
      const cartBookingProducts = Array.isArray(cartBooking?.products) ? cartBooking.products : [];
      const singleProduct = JSON.parse(sessionStorage.getItem("selectedProjectPartBooking") || "null");
      const products = cartBookingProducts.length
        ? cartBookingProducts
        : params.get("source") === "cart" && cartItems.length
          ? cartItems.map(cartItemToBookingProduct)
          : singleProduct?.productName
            ? [singleProduct]
            : [];

      const normalizedProducts = products.map(normalizeSelectedProduct).filter((product) => product.productName);
      if (!normalizedProducts.length) return;
      setSelectedProducts(normalizedProducts);
      setForm((current) => ({
        ...current,
        repairType: current.repairType || selectedProductsRepairType(normalizedProducts),
      }));
    } catch (_error) {
      setSelectedProducts([]);
    }
  }, [cartItems]);

  const removeSelectedProduct = (productToRemove) => {
    const removeKey = selectedProductKey(productToRemove);
    setSelectedProducts((current) => {
      const next = current.filter((product) => selectedProductKey(product) !== removeKey);
      if (next.length) {
        sessionStorage.setItem("selectedCartBooking", JSON.stringify({
          bookingSource: next.length > 1 ? "cart" : next[0].bookingSource || "product-detail",
          products: next,
          updatedAt: new Date().toISOString(),
        }));
      } else {
        sessionStorage.removeItem("selectedCartBooking");
        sessionStorage.removeItem("selectedProjectPartBooking");
      }

      setForm((formState) => {
        if (!["Products", "Products by Cart"].includes(formState.repairType)) return formState;
        return {
          ...formState,
          repairType: next.length ? selectedProductsRepairType(next) : "",
        };
      });

      return next;
    });
  };

  const processFiles = useCallback((files) => {
    const filesArray = Array.from(files);
    const validFiles = filesArray.filter(file => {
      // Check file type
      if (!file.type.startsWith('image/')) {
        setStatus(`File ${file.name} is not an image`);
        setTimeout(() => setStatus(""), 3000);
        return false;
      }
      // Check file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        setStatus(`File ${file.name} is too large (max 5MB)`);
        setTimeout(() => setStatus(""), 3000);
        return false;
      }
      return true;
    });
    const remainingSlots = 8 - images.length;
    const filesToAdd = validFiles.slice(0, remainingSlots);

    if (validFiles.length > remainingSlots) {
      setStatus(`Only ${remainingSlots} more image${remainingSlots > 1 ? 's' : ''} can be added (max 8 total)`);
      setTimeout(() => setStatus(""), 3000);
    }

    const newImages = [...images, ...filesToAdd];
    const newPreviews = [...previews, ...filesToAdd.map(file => URL.createObjectURL(file))];

    setImages(newImages);
    setPreviews(newPreviews);
  }, [images, previews]);

  const previewsRef = useRef(previews);
  previewsRef.current = previews;

  useEffect(() => () => {
    previewsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (_error) {
        // ignore
      }
    });
  }, []);

  const revokeAllPreviews = useCallback((urls) => {
    (urls || []).forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (_error) {
        // ignore
      }
    });
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      if (!/^\d{10}$/.test(form.phoneNumber)) {
        setStatus("Phone number must be exactly 10 digits.");
        setBusy(false);
        return;
      }
      if (!/^\d{10}$/.test(form.whatsappNumber)) {
        setStatus("WhatsApp number must be exactly 10 digits.");
        setBusy(false);
        return;
      }
      if (emailCheck.status === "checking") {
        setStatus("Please wait while we verify your email address.");
        setBusy(false);
        return;
      }
      if (emailCheck.status !== "valid") {
        setStatus(emailCheck.message || "Invalid email address");
        setBusy(false);
        return;
      }
      if (addressCheck.status === "checking" || addressCheck.status === "suggest") {
        setStatus(addressCheck.status === "suggest"
          ? "Please select a verified location from the suggestions."
          : "Please wait while we verify your location.");
        setBusy(false);
        return;
      }
      if (
        addressCheck.status !== "valid"
        || !addressCheck.verifiedAddress
        || form.address.trim() !== addressCheck.verifiedAddress.trim()
      ) {
        setStatus(addressCheck.message || "Please select a real, verified location before submitting.");
        setBusy(false);
        return;
      }
      if (!/^\d{6}$/.test(form.pincode)) {
        setStatus("Pincode must be exactly 6 digits.");
        setBusy(false);
        return;
      }
      const invalidStockProduct = selectedProducts.find((product) => {
        const limit = getCartStockLimit(product);
        return limit < 1 || Number(product.quantity || 1) > limit;
      });
      if (invalidStockProduct) {
        setStatus(`${invalidStockProduct.productName}: ${cartStockMessage(invalidStockProduct)}`);
        setBusy(false);
        return;
      }
      const payload = new FormData();
      Object.entries({ ...form, address: addressCheck.verifiedAddress }).forEach(([key, value]) => payload.append(key, value));
      if (selectedProducts.length) {
        const summary = selectedProductsSummary(selectedProducts);
        payload.append("products", JSON.stringify(selectedProducts));
        payload.append("productId", summary.productId || "");
        payload.append("productSlug", summary.productSlug || "");
        payload.append("productName", summary.productName || "");
        payload.append("productCategory", summary.productCategory || "");
        payload.append("productImageUrl", summary.productImageUrl || "");
        payload.append("bookingSource", summary.bookingSource || "product-detail");
      }
      images.forEach((image) => payload.append("images", image));
      await apiRequest("/public/bookings", { method: "POST", body: payload });
      const source = new URLSearchParams(window.location.search).get("source");
      const isCartBooking = source === "cart" || selectedProducts.length > 1 || selectedProducts.some((product) => product.bookingSource === "cart");
      revokeAllPreviews(previews);
      setForm(initialForm);
      setImages([]);
      setPreviews([]);
      setSelectedProducts([]);
      addressVerifiedRef.current = "";
      setAddressCheck({ status: "idle", message: "", suggestions: [], verifiedAddress: "" });
      setEmailCheck({ status: "idle", message: "" });
      sessionStorage.removeItem("selectedProjectPartBooking");
      sessionStorage.removeItem("selectedCartBooking");
      if (isCartBooking) clearCart();
      setStatus("Booking request submitted. We will contact you soon.");
      setShowSuccessAnimation(true);
    } catch (error) {
      setStatus(error.message || "Unable to submit booking.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="App">
      <Navbar />
      <BookingSuccessOverlay
        open={showSuccessAnimation}
        onDone={() => setShowSuccessAnimation(false)}
      />
      <main className="relative min-h-screen overflow-hidden pt-32 pb-20">
        <div className="pointer-events-none absolute left-1/2 top-20 hidden h-96 w-[80%] -translate-x-1/2 rounded-full bg-gradient-primary opacity-20 blur-3xl md:block" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <aside className="rounded-3xl glass-strong border-glow p-6 shadow-elegant">
            <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
              Repair Booking
            </span>
            <h1 className="mt-5 font-display text-4xl font-bold leading-tight sm:text-5xl">
              Book your <span className="text-gradient">repair</span> or <span className="text-gradient">purchase</span> with ease
            </h1>
            <p className="mt-4 text-muted-foreground">
              Share your contact details, location, repair type and a photo. The booking time is recorded automatically.
            </p>
            <div className="mt-5 flex items-start gap-3 rounded-2xl border p-4 text-sm" style={{ backgroundColor: "rgba(250, 31, 31, 0.51)", borderColor: "rgb(251, 57, 36)", color: "#92400e" }}>
              <span className="inline-flex w-8 items-center justify-center rounded-full text-amber-900" style={{ backgroundColor: "rgba(255, 0, 0, 0.95)", color: "#fff", padding: "6px" }}>
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold" style={{ color: "#fb7070" }}>Warning</p>
                <p style={{ color: "white" }}>Enter your valid email address to receive booking confirmation and updates.</p>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3 rounded-2xl glass p-4 text-sm text-muted-foreground">
              <CalendarClock className="h-5 w-5 text-accent" />
              {new Date().toLocaleString("en-IN", {
                weekday: "long",
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            
            {selectedProducts.length > 0 && (
              <div className="booking-products-preview">
                <div className="booking-products-preview-head">
                  <span>Selected Products</span>
                  <strong>{selectedProducts.reduce((sum, product) => sum + product.quantity, 0)} item{selectedProducts.reduce((sum, product) => sum + product.quantity, 0) > 1 ? "s" : ""}</strong>
                </div>
                <div className="booking-products-preview-list">
                  {selectedProducts.map((product) => (
                    <article className="booking-product-preview-card" key={selectedProductKey(product)}>
                      {product.productImageUrl ? (
                        <OptimizedImage src={product.productImageUrl} alt={product.productName} width={72} height={72} className="h-16 w-16 rounded-xl object-contain bg-white/5" />
                      ) : (
                        <span className="grid h-16 w-16 place-items-center rounded-xl bg-white/10"><ShoppingBag className="h-6 w-6 text-accent" /></span>
                      )}
                      <div>
                        <strong>{product.productName}</strong>
                        <small>{product.productCategory}{product.originalCategory ? ` / ${product.originalCategory}` : ""}</small>
                        <span>Qty {product.quantity}</span>
                        <span>{cartStockMessage(product)}</span>
                      </div>
                      <button
                        className="booking-product-unselect"
                        type="button"
                        onClick={() => removeSelectedProduct(product)}
                        aria-label={`Remove ${product.productName} from booking`}
                        title="Remove product"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </article>
                  ))}
                </div>
            
              </div>
            )}
          </aside>

          <form onSubmit={submit} className="rounded-3xl glass-strong border-glow p-5 shadow-elegant md:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full Name" placeholder="e.g. Rahul kumar" value={form.fullName} onChange={(v) => update("fullName", v)} required />
              <div>
                <Field label="Email" type="email" placeholder="name@example.com" value={form.customerEmail} onChange={(v) => update("customerEmail", v)} required />
                {emailCheck.message && (
                  <p className={`mt-2 text-xs ${emailCheck.status === "valid" ? "text-emerald-400" : "text-red-300"}`}>
                    {emailCheck.message}
                  </p>
                )}
              </div>
              <Field label="Phone Number" type="tel" inputMode="numeric" maxLength={10} pattern="\d{10}" placeholder="10 digit mobile number" value={form.phoneNumber} onChange={(v) => updateDigits("phoneNumber", v)} required />
              <Field label="WhatsApp Number" type="tel" inputMode="numeric" maxLength={10} pattern="\d{10}" placeholder="10 digit WhatsApp number" value={form.whatsappNumber} onChange={(v) => updateDigits("whatsappNumber", v)} required />
              <Field label="What do you want Repair or BUY?" value={form.repairType} onChange={(v) => update("repairType", v)} placeholder="Fan, induction, torch..." required />
            </div>
            <div className="mt-4">
              <LocationAddressField
                value={form.address}
                placeholder={LOCATION_PLACEHOLDER}
                addressCheck={addressCheck}
                onChange={(value) => {
                  addressVerifiedRef.current = "";
                  update("address", value);
                }}
                onSelectSuggestion={(place) => {
                  applyVerifiedAddress(place.formatted || place.displayName, "Location verified");
                }}
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label="Pincode"
                type="tel"
                inputMode="numeric"
                maxLength={6}
                pattern="\d{6}"
                placeholder="6 digit PIN code"
                value={form.pincode}
                onChange={updatePincode}
                required
              />
              <Field
                label="Landmark"
                placeholder="e.g. Near main road, opposite school"
                value={form.landmark}
                onChange={(value) => update("landmark", value)}
              />
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Message (Optional)</label>
              <textarea
                value={form.message}
                placeholder="Describe the issue or any specific instructions..."
                onChange={(event) => update("message", event.target.value)}
                rows={4}
                className="w-full rounded-xl glass border border-border bg-transparent px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
              />
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Image Upload ({images.length}/8)
              </label>
              <div
                className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl glass border border-dashed p-5 text-center transition-[transform,opacity,border-color,background-color] duration-300 ${isDragging
                    ? "border-primary bg-primary/10 scale-[1.02]"
                    : "border-primary/40 hover:border-primary/60"
                  }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className={`h-8 w-8 transition-colors ${isDragging ? "text-primary animate-bounce" : "text-accent"}`} />
                <span className="text-sm text-muted-foreground">
                  {images.length > 0 ? `${images.length} image${images.length > 1 ? 's' : ''} selected` :
                    isDragging ? "Drop images here..." : "Upload repair images (max 8) - Drag & drop or click to browse"}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = event.target.files;
                    if (files.length > 0) {
                      processFiles(files);
                    }
                  }}
                />
              </div>

              {previews.length > 0 && (
                <div className="mt-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {previews.map((preview, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={preview}
                          alt={`Upload ${index + 1}`}
                          width={160}
                          height={112}
                          className="w-full h-24 sm:h-28 object-cover rounded-xl transition-opacity duration-300 group-hover:opacity-70"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newImages = images.filter((_, i) => i !== index);
                            const newPreviews = previews.filter((_, i) => i !== index);
                            setImages(newImages);
                            setPreviews(newPreviews);
                            URL.revokeObjectURL(preview);
                          }}
                          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        >
                          <div className="bg-red-500 text-white rounded-full p-2 shadow-lg">
                            <X className="h-4 w-4" />
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={
                busy
                || emailCheck.status === "checking"
                || addressCheck.status === "checking"
                || addressCheck.status !== "valid"
                || emailCheck.status !== "valid"
                || form.pincode.length !== 6
              }
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-gradient-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.02] disabled:opacity-60"
            >
              {busy ? "Submitting..." : "Submit Booking"}
            </button>
            {status && <p className="mt-4 text-center text-sm text-muted-foreground">{status}</p>}
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Field({ label, value, onChange, placeholder = "", required = false, type = "text", inputMode, maxLength, pattern }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        maxLength={maxLength}
        pattern={pattern}
        className="w-full rounded-xl glass border border-border bg-transparent px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
      />
    </div>
  );
}

function LocationAddressField({ value, onChange, onSelectSuggestion, addressCheck, placeholder }) {
  const openSuggestions = addressCheck.status === "suggest" && addressCheck.suggestions?.length > 0;
  const borderClass = addressCheck.status === "valid"
    ? "border-emerald-400/70 focus:border-emerald-400"
    : addressCheck.status === "invalid"
      ? "border-red-400/70 focus:border-red-400"
      : "border-border focus:border-primary";

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-muted-foreground">Location / Address</label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && openSuggestions) {
              event.preventDefault();
              onSelectSuggestion(addressCheck.suggestions[0]);
            }
          }}
          placeholder={placeholder}
          required
          autoComplete="street-address"
          className={`w-full rounded-xl glass border bg-transparent py-3 pl-10 pr-10 text-sm outline-none transition-colors ${borderClass}`}
          aria-autocomplete="list"
          aria-controls="booking-address-suggestions"
        />
        {addressCheck.status === "valid" && (
          <CheckCircle2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400" />
        )}
      </div>

      {addressCheck.message && (
        <p className={`mt-2 text-xs ${addressCheck.status === "valid" ? "text-emerald-400" : addressCheck.status === "checking" ? "text-sky-300" : "text-red-300"}`}>
          {addressCheck.message}
        </p>
      )}

      {openSuggestions && (
        <ul id="booking-address-suggestions" className="booking-address-suggestions" role="listbox">
          {addressCheck.suggestions.map((place) => {
            const key = place.placeId || place.formatted || place.displayName;
            const label = place.formatted || place.displayName;
            return (
              <li key={key} role="option" aria-selected="false">
                <button
                  type="button"
                  className="booking-address-suggestion"
                  onClick={() => onSelectSuggestion(place)}
                >
                  <MapPin className="h-4 w-4 shrink-0 text-accent" />
                  <span>
                    <strong>{label}</strong>
                    {(place.city || place.state || place.postcode) && (
                      <small>
                        {[place.city, place.state, place.postcode].filter(Boolean).join(" · ")}
                      </small>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
