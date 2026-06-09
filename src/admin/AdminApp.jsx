import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, EyeOff, LayoutDashboard, LogOut, Mail, Menu, Minus, Plus, Send, ShieldCheck, Trash2, UploadCloud, X } from "lucide-react";
import { applyDynamicWebSettings } from "../context/SiteDataContext";
import { getIcon } from "../components/site/iconMap";
import InvoiceModule from "./InvoiceModule";
import "./AdminApp.css";

const API_BASE = process.env.REACT_APP_API_URL || process.env.VITE_API_URL || "/api";
const MIN_STOCK_QUANTITY = 1;
const MAX_STOCK_QUANTITY = 9999;
const ADMIN_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const ADMIN_IMAGE_SIZE_LIMIT = 5 * 1024 * 1024;

const sectionCards = [
  { key: "admins", label: "Admins", note: "Manage admin accounts", superOnly: true },
  { key: "notificationEmails", label: "Booking Notifications", note: "Email recipients and delivery health", superOnly: true },
  { key: "bookings", label: "Bookings", note: "Repair requests and status" },
  { key: "invoice", permission: "invoices", label: "Invoice", note: "Create invoices, PDFs, and billing history" },
  { key: "offers", label: "Offers", note: "Image and short offer cards" },
  { key: "services", label: "Our Services", note: "Service/product cards" },
  { key: "gallery", label: "Gallery", note: "Website gallery photos" },
  { key: "testimonials", label: "Testimonials", note: "Customer reviews" },
  { key: "featuredRepairs", label: "Featured Repairs", note: "Highlighted repair cards" },
  { key: "shopProducts", label: "Shop Products", note: "Public product shop catalog" },
  { key: "projectParts", label: "Science Project Parts", note: "Parts and components catalog" },
  { key: "projectSliders", label: "Projects Parts Slider", note: "Public page carousel images" },
  { key: "about", label: "About Cards", note: "Prakash Electronics cards" },
  { key: "footer", label: "Footer Management", note: "Footer links and map URLs" },
  { key: "webSettings", label: "Web Settings", note: "OG image, favicon, and meta assets" },
];

const editablePermissions = sectionCards
  .filter((item) => !item.superOnly)
  .map((item) => ({ key: item.permission || item.key, label: item.label }));

function canAccessSection(admin, key) {
  if (!admin) return false;
  if (admin.isSuperAdmin) return true;
  if (key === "admins") return false;
  const section = sectionCards.find((item) => item.key === key);
  return (admin.permissions || []).includes(section?.permission || key);
}

function visibleSections(admin) {
  return sectionCards.filter((item) => canAccessSection(admin, item.key));
}

const contentKeys = [
  "navbar",
  "servicesSection",
  "stats",
  "testimonials",
  "gallery",
  "about",
  "contactSection",
  "footer",
  "featuredCarousel",
];

const socialIconOptions = [
  { value: "Youtube", label: "YouTube" },
  { value: "Instagram", label: "Instagram" },
  { value: "Facebook", label: "Facebook" },
  { value: "Twitter", label: "Twitter / X" },
  { value: "Whatsapp", label: "WhatsApp" },
  { value: "Linkedin", label: "LinkedIn" },
  { value: "Telegram", label: "Telegram" },
  { value: "Website", label: "Website" },
  { value: "Mail", label: "Email" },
  { value: "Phone", label: "Phone" },
];

const adminIconOptions = [
  "Plug",
  "Wrench",
  "Zap",
  "ShieldCheck",
  "BadgeCheck",
  "Clock",
  "Star",
  "Award",
  "ShoppingBag",
  "Home",
  "Cog",
  "Smartphone",
  "Tv",
  "Fan",
  "AirVent",
  "Wind",
  ...socialIconOptions.map((item) => item.value),
].map((value) => ({ value, label: value }));

const protectedRouteKeys = new Set(["dashboard", ...sectionCards.map((item) => item.key)]);

function routeForSection(key) {
  return key === "dashboard" ? "/admin/dashboard" : `/admin/${key}`;
}

function getAdminRouteSection() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/admin";
  if (path === "/admin/login") return "login";
  if (path === "/admin" || path.startsWith("/admin-panel-prakash10")) return "dashboard";
  if (path.startsWith("/admin/")) {
    const key = path.slice("/admin/".length).split("/")[0] || "dashboard";
    return protectedRouteKeys.has(key) ? key : "dashboard";
  }
  return "dashboard";
}

function replaceAdminRoute(path) {
  if (window.location.pathname !== path) {
    window.history.replaceState({}, "", path);
  }
}

async function apiFetch(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeout || 25000);

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: isFormData
        ? options.headers
        : {
            "Content-Type": "application/json",
            ...(options.headers || {}),
          },
      ...options,
      signal: options.signal || controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out. Please check the server and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "Request failed");
    error.status = response.status;
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent("admin-auth-invalid", { detail: { message: error.message } }));
    }
    throw error;
  }
  return payload;
}

function linesToArray(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToLines(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function clampAdminQuantity(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return MIN_STOCK_QUANTITY;
  return Math.min(MAX_STOCK_QUANTITY, Math.max(MIN_STOCK_QUANTITY, parsed));
}

function isValidAdminImage(file, accept = "image/*") {
  if (!file) return { valid: false, message: "Select an image first" };
  const acceptsSvg = String(accept).includes("svg");
  const acceptsIcon = String(accept).includes("icon") || String(accept).includes("ico");
  const supported = ADMIN_IMAGE_TYPES.has(file.type) || (acceptsSvg && file.type === "image/svg+xml") || (acceptsIcon && file.name.toLowerCase().endsWith(".ico"));
  if (!supported) return { valid: false, message: `${file.name} is not a supported image type.` };
  if (file.size > ADMIN_IMAGE_SIZE_LIMIT) return { valid: false, message: `${file.name} is too large. Maximum size is 5MB.` };
  return { valid: true, message: "" };
}

function recordId(item) {
  return item?._id || item?.id || "";
}

function useBatchSelection(items = [], getId = recordId) {
  const ids = useMemo(
    () => (Array.isArray(items) ? items.map((item, index) => String(getId(item, index) || "")).filter(Boolean) : []),
    [items, getId],
  );
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    const validIds = new Set(ids);
    setSelectedIds((current) => {
      const next = current.filter((id) => validIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [ids]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;
  const allSelected = ids.length > 0 && selectedCount === ids.length;
  const isIndeterminate = selectedCount > 0 && selectedCount < ids.length;

  const toggleOne = (id, checked) => {
    const key = String(id || "");
    if (!key) return;
    setSelectedIds((current) => {
      if (checked) return current.includes(key) ? current : [...current, key];
      return current.filter((item) => item !== key);
    });
  };

  const selectAll = (checked) => {
    setSelectedIds(checked ? ids : []);
  };

  const clearSelection = () => setSelectedIds([]);

  return {
    ids,
    selectedIds,
    selectedSet,
    selectedCount,
    allSelected,
    isIndeterminate,
    toggleOne,
    selectAll,
    clearSelection,
  };
}

function BatchCheckbox({ label, checked, indeterminate = false, onChange, disabled = false, compact = false }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate && !checked;
    }
  }, [checked, indeterminate]);

  return (
    <label className={`batch-checkbox ${checked ? "checked" : ""} ${indeterminate ? "indeterminate" : ""} ${compact ? "compact" : ""}`}>
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span aria-hidden="true">{checked && <Check size={14} />}</span>
      {!compact && <em>{label}</em>}
    </label>
  );
}

function BatchToolbar({ total, selectedCount, allSelected, isIndeterminate, onSelectAll, onClear, onDelete, disabled, noun = "items" }) {
  if (!total) return null;
  return (
    <div className={`batch-toolbar ${selectedCount ? "has-selection" : ""}`}>
      <BatchCheckbox
        label="Select all"
        checked={allSelected}
        indeterminate={isIndeterminate}
        onChange={onSelectAll}
        disabled={disabled}
      />
      <span className="batch-count">{selectedCount ? `${selectedCount} selected` : `${total} total`}</span>
      <div className="batch-actions">
        {selectedCount > 0 && (
          <button className="batch-clear-button" type="button" onClick={onClear} disabled={disabled}>
            Clear
          </button>
        )}
        <button
          className="batch-delete-button"
          type="button"
          onClick={onDelete}
          disabled={disabled || !selectedCount}
          aria-label={`Delete selected ${noun}`}
        >
          <Trash2 size={16} />
          <span>Delete Selected</span>
        </button>
      </div>
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState("dark");
  const [admin, setAdmin] = useState(null);
  const [active, setActiveState] = useState(() => {
    const routeSection = getAdminRouteSection();
    return routeSection === "login" ? "dashboard" : routeSection;
  });
  const [navOpen, setNavOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [data, setData] = useState({
    dashboard: null,
    products: [],
    categories: [],
    hero: null,
    contact: null,
    offers: [],
    bookings: [],
    admins: [],
    notificationEmails: [],
    content: [],
    projectParts: [],
    shopProducts: [],
    projectSliders: [],
    webSettings: null,
  });

  const navigateAdmin = (key, options = {}) => {
    const safeKey = protectedRouteKeys.has(key) ? key : "dashboard";
    setActiveState(safeKey);
    const path = routeForSection(safeKey);
    if (options.replace) {
      replaceAdminRoute(path);
    } else if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  };
  const setActive = navigateAdmin;

  const refresh = async (currentAdmin = admin) => {
    const canProducts = canAccessSection(currentAdmin, "services") || canAccessSection(currentAdmin, "featuredRepairs");
    const canContent = ["gallery", "testimonials", "about", "footer"].some((key) => canAccessSection(currentAdmin, key));
    const canProjectParts = canAccessSection(currentAdmin, "projectParts") || canAccessSection(currentAdmin, "featuredRepairs");
    const canProjectSliders = canAccessSection(currentAdmin, "projectSliders") || canAccessSection(currentAdmin, "featuredRepairs");
    const canShopProducts = canAccessSection(currentAdmin, "shopProducts");
    const canWebSettings = canAccessSection(currentAdmin, "webSettings");
    const canNotificationEmails = canAccessSection(currentAdmin, "notificationEmails");

    const [
      dashboard,
      admins,
      notificationEmails,
      products,
      categories,
      contact,
      offers,
      bookings,
      content,
      projectParts,
      shopProducts,
      projectSliders,
      webSettings,
    ] = await Promise.all([
      apiFetch("/admin/dashboard"),
      canAccessSection(currentAdmin, "admins") ? apiFetch("/admin/admins") : Promise.resolve({ data: [] }),
      canNotificationEmails ? apiFetch("/admin/notification-emails") : Promise.resolve({ data: [] }),
      canProducts ? apiFetch("/admin/products?limit=100") : Promise.resolve({ data: { items: [] } }),
      canProducts ? apiFetch("/admin/categories") : Promise.resolve({ data: [] }),
      canAccessSection(currentAdmin, "footer") ? apiFetch("/admin/contact") : Promise.resolve({ data: null }),
      canAccessSection(currentAdmin, "offers") ? apiFetch("/admin/offers") : Promise.resolve({ data: [] }),
      canAccessSection(currentAdmin, "bookings") ? apiFetch("/admin/bookings") : Promise.resolve({ data: [] }),
      canContent ? apiFetch("/admin/site-content") : Promise.resolve({ data: [] }),
      canProjectParts ? apiFetch("/project-parts/admin/project-parts?limit=200") : Promise.resolve({ data: { items: [] } }),
      canShopProducts ? apiFetch("/shop-products/admin/products?limit=200") : Promise.resolve({ data: { items: [] } }),
      canProjectSliders ? apiFetch("/project-parts/admin/project-part-sliders") : Promise.resolve({ data: [] }),
      canWebSettings ? apiFetch("/admin/web-settings") : Promise.resolve({ data: null }),
    ]);

    setData({
      dashboard: dashboard.data,
      admins: admins.data || [],
      notificationEmails: notificationEmails.data || [],
      products: products.data.items || [],
      categories: categories.data || [],
      contact: contact.data,
      offers: offers.data || [],
      bookings: bookings.data || [],
      content: content.data || [],
      projectParts: projectParts.data.items || [],
      shopProducts: shopProducts.data.items || [],
      projectSliders: projectSliders.data || [],
      webSettings: webSettings.data,
    });
  };

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      const routeSection = getAdminRouteSection();
      if (routeSection !== "login") {
        setActiveState(routeSection);
      }
      try {
        const me = await apiFetch("/auth/me");
        if (!mounted) return;
        setAdmin(me.admin);
        if (routeSection === "login") {
          navigateAdmin("dashboard", { replace: true });
        }
        await refresh(me.admin);
      } catch (_error) {
        if (mounted) {
          setAdmin(null);
          replaceAdminRoute("/admin/login");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (admin && active !== "dashboard" && !canAccessSection(admin, active)) {
      navigateAdmin("dashboard", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, admin]);

  useEffect(() => {
    const handleInvalidSession = (event) => {
      setAdmin(null);
      setActiveState("dashboard");
      setMessage(event.detail?.message || "Session expired. Please login again.");
      replaceAdminRoute("/admin/login");
    };
    window.addEventListener("admin-auth-invalid", handleInvalidSession);
    return () => window.removeEventListener("admin-auth-invalid", handleInvalidSession);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const routeSection = getAdminRouteSection();
      if (routeSection === "login") {
        if (admin) navigateAdmin("dashboard", { replace: true });
        return;
      }
      setActiveState(routeSection);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  const logout = async () => {
    await apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    setAdmin(null);
    setActiveState("dashboard");
    replaceAdminRoute("/admin/login");
  };

  const runAction = async (action, successText = "Saved") => {
    setBusy(true);
    setMessage("");
    try {
      const result = await action();
      if (result === false || result?.cancelled) {
        return;
      }
      await refresh();
      window.dispatchEvent(new CustomEvent("admin-action-saved"));
      setMessage(successText);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className={`admin-shell ${theme}`}><div className="loader-card">Loading admin...</div></div>;
  }

  if (!admin) {
    return (
      <div className={`admin-shell ${theme}`}>
        <LoginScreen
          onAuthenticated={async (nextAdmin) => {
            setMessage("");
            setAdmin(nextAdmin);
            navigateAdmin("dashboard", { replace: true });
            await refresh(nextAdmin);
          }}
          message={message}
        />
      </div>
    );
  }

  return (
    <div className={`admin-shell ${theme}`}>
      <aside className="sidebar glass-panel">
        <div className="brand-lock">
          <div className="brand-mark">PE</div>
          <div>
            <strong>Prakash Admin</strong>
            <span>{admin.email}</span>
          </div>
        </div>

        <nav className={`nav-stack ${navOpen ? "open" : ""}`}>
          <button className={active === "dashboard" ? "active" : ""} onClick={() => { setActive("dashboard"); setNavOpen(false); }}>
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </button>
          {visibleSections(admin).map((item) => (
            <button key={item.key} className={active === item.key ? "active" : ""} onClick={() => { setActive(item.key); setNavOpen(false); }}>
              <ShieldCheck size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar glass-panel">
          <div>
            <p className="eyebrow">{admin.isSuperAdmin ? "Main owner panel" : admin.tag || "Admin panel"}</p>
            <h1>{pageTitle(active)}</h1>
          </div>
          <div className="top-actions">
            <button className="mobile-nav-button" type="button" onClick={() => setNavOpen((current) => !current)}>
              {navOpen ? <X size={18} /> : <Menu size={18} />}
              <span>{navOpen ? "Close" : "Menu"}</span>
            </button>
            <label className="theme-toggle">
              <input
                type="checkbox"
                checked={theme === "light"}
                onChange={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              />
              <span />
              Theme
            </label>
            <button className="ghost-button icon-text" onClick={logout}>
              <LogOut size={17} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {message && <div className="notice glass-panel">{message}</div>}

        {active === "dashboard" && (
          <DashboardPage dashboard={data.dashboard} admin={admin} setActive={setActive} />
        )}
        {active === "admins" && (
          <AdminManager admins={data.admins} currentAdmin={admin} runAction={runAction} busy={busy} />
        )}
        {active === "notificationEmails" && (
          <NotificationEmailManager emails={data.notificationEmails} runAction={runAction} busy={busy} />
        )}
        {active === "bookings" && (
          <BookingsManager bookings={data.bookings} runAction={runAction} busy={busy} />
        )}
        {active === "invoice" && (
          <InvoiceModule apiFetch={apiFetch} />
        )}
        {active === "services" && (
          <ProductManager
            title="Our Services"
            products={data.products.filter((product) => !product.isFeatured)}
            categories={data.categories}
            runAction={runAction}
            busy={busy}
          />
        )}
        {active === "featuredRepairs" && (
          <ProductManager
            title="Featured Repairs"
            products={data.products.filter((product) => product.isFeatured)}
            categories={data.categories}
            runAction={runAction}
            busy={busy}
            featuredDefault
          />
        )}
        {active === "projectParts" && (
          <ProjectPartsManager parts={data.projectParts} runAction={runAction} busy={busy} />
        )}
        {active === "shopProducts" && (
          <ShopProductsManager products={data.shopProducts} runAction={runAction} busy={busy} />
        )}
        {active === "projectSliders" && (
          <ProjectSlidersManager sliders={data.projectSliders} runAction={runAction} busy={busy} />
        )}
        {active === "gallery" && (
          <GalleryManager content={data.content} runAction={runAction} busy={busy} />
        )}
        {active === "offers" && (
          <OfferManager offers={data.offers} runAction={runAction} busy={busy} />
        )}
        {active === "testimonials" && (
          <TestimonialsManager content={data.content} runAction={runAction} busy={busy} />
        )}
        {active === "about" && (
          <AboutManager content={data.content} runAction={runAction} busy={busy} />
        )}
        {active === "footer" && (
          <FooterManager content={data.content} contact={data.contact} runAction={runAction} busy={busy} />
        )}
        {active === "webSettings" && (
          <WebSettingsManager settings={data.webSettings} runAction={runAction} busy={busy} />
        )}
      </main>
    </div>
  );
}

function pageTitle(active) {
  if (active === "dashboard") return "Dashboard";
  return sectionCards.find((item) => item.key === active)?.label || "Admin";
}

function LoginScreen({ onAuthenticated, message }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [challenge, setChallenge] = useState(null);
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!challenge?.expiresAt) return undefined;
    const tick = () => {
      setTimeLeft(Math.max(0, Math.ceil((new Date(challenge.expiresAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [challenge?.expiresAt]);

  const submitCredentials = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setChallenge(response);
      setOtp("");
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (event) => {
    event.preventDefault();
    if (!challenge?.challengeId) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId: challenge.challengeId, otp }),
      });
      await onAuthenticated(response.admin);
    } catch (otpError) {
      setError(otpError.message);
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async () => {
    if (!challenge?.challengeId) return;
    setResending(true);
    setError("");
    try {
      const response = await apiFetch("/auth/otp/resend", {
        method: "POST",
        body: JSON.stringify({ challengeId: challenge.challengeId }),
      });
      setChallenge(response);
      setOtp("");
    } catch (resendError) {
      setError(resendError.message);
    } finally {
      setResending(false);
    }
  };

  if (challenge) {
    return (
      <div className="login-wrap">
        <form className="login-card glass-panel" onSubmit={submitOtp}>
          <div className="brand-mark large">PE</div>
          <p className="eyebrow">Email OTP verification</p>
          <h1>Verify OTP</h1>
          <p className="muted">A 6-digit OTP was sent to {challenge.email}. Complete this step to create the secure admin session.</p>
          <Input label="OTP Code" value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} />
          <div className="otp-meta">
            <span>{timeLeft > 0 ? `Expires in ${formatCountdown(timeLeft)}` : "OTP expired"}</span>
            <button className="link-button" type="button" disabled={resending} onClick={resendOtp}>
              {resending ? "Resending..." : "Resend OTP"}
            </button>
          </div>
          <button className="primary-button" disabled={busy || otp.length !== 6}>
            {busy ? "Verifying..." : "Verify and enter"}
          </button>
          <button className="ghost-button" type="button" disabled={busy} onClick={() => { setChallenge(null); setOtp(""); setError(""); }}>
            Change email
          </button>
          {(error || message) && <p className="form-error">{error || message}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form
        className="login-card glass-panel"
        onSubmit={submitCredentials}
      >
        <div className="brand-mark large">PE</div>
        <p className="eyebrow">Protected admin access</p>
        <h1>Admin Login</h1>
        <p className="muted">Email, password, and OTP verification are required before any admin route can open.</p>
        <Input label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
        <div className="field">
          <label>Password</label>
          <div className="password-field">
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
            <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <button className="primary-button" disabled={busy || !form.email || !form.password}>
          {busy ? "Checking..." : "Send OTP"}
        </button>
        {(error || message) && <p className="form-error">{error || message}</p>}
      </form>
    </div>
  );
}

function DashboardPage({ dashboard, admin, setActive }) {
  const cards = visibleSections(admin);
  return (
    <div className="page-grid">
      <section className="stat-grid">
        {canAccessSection(admin, "bookings") && <StatCard label="Booking orders" value={dashboard?.bookings || 0} onClick={() => setActive("bookings")} />}
        {canAccessSection(admin, "admins") && <StatCard label="Admin accounts" value={dashboard?.admins || 0} onClick={() => setActive("admins")} />}
        {canAccessSection(admin, "notificationEmails") && <StatCard label="Notification emails" value={dashboard?.notificationEmails || 0} onClick={() => setActive("notificationEmails")} />}
        {canAccessSection(admin, "featuredRepairs") && <StatCard label="Featured Repairs cards" value={dashboard?.featuredRepairs || 0} onClick={() => setActive("featuredRepairs")} />}
        {canAccessSection(admin, "shopProducts") && <StatCard label="Shop products" value={dashboard?.shopProducts || 0} onClick={() => setActive("shopProducts")} />}
        {canAccessSection(admin, "about") && <StatCard label="About Prakash Electronics cards" value={dashboard?.aboutCards || 0} onClick={() => setActive("about")} />}
        {canAccessSection(admin, "gallery") && <StatCard label="Gallery images" value={dashboard?.galleryImages || 0} onClick={() => setActive("gallery")} />}
        {canAccessSection(admin, "testimonials") && <StatCard label="Testimonials cards" value={dashboard?.testimonials || 0} onClick={() => setActive("testimonials")} />}
        {canAccessSection(admin, "services") && <StatCard label="Our Services cards" value={dashboard?.products || 0} onClick={() => setActive("services")} />}
        {canAccessSection(admin, "offers") && <StatCard label="Offers cards" value={dashboard?.offers || 0} onClick={() => setActive("offers")} />}
      </section>

      <section className="section-card-grid">
        {cards.map((card) => (
          <button key={card.key} className="management-card glass-panel" onClick={() => setActive(card.key)}>
            <span>{card.label.slice(0, 2).toUpperCase()}</span>
            <strong>{card.label}</strong>
            <small>{card.note}</small>
          </button>
        ))}
      </section>
    </div>
  );
}

function StatCard({ label, value, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className="stat-card glass-panel" onClick={onClick} type={onClick ? "button" : undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
    </Tag>
  );
}

function adminInitials(admin = {}) {
  return String(admin.name || admin.email || "Admin")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function adminAvatarUrl(admin = {}) {
  return admin.avatarUrl || admin.imageUrl || admin.profileImage || admin.photoUrl || "";
}

function AdminAccountAvatar({ admin }) {
  const [failed, setFailed] = useState(false);
  const url = adminAvatarUrl(admin);
  return (
    <span className="admin-account-avatar">
      {url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : adminInitials(admin)}
    </span>
  );
}

function AdminManager({ admins, currentAdmin, runAction, busy }) {
  const empty = { name: "", email: "", role: "admin", password: "", tag: "employee", permissions: [], adminAndroidAppAccess: false, isActive: true };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");
  const [pendingCreate, setPendingCreate] = useState(null);
  const [ownerOtp, setOwnerOtp] = useState("");
  const [newAdminOtp, setNewAdminOtp] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createTimeLeft, setCreateTimeLeft] = useState(0);

  useEffect(() => {
    if (!pendingCreate?.expiresAt) return undefined;
    const tick = () => {
      setCreateTimeLeft(Math.max(0, Math.ceil((new Date(pendingCreate.expiresAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [pendingCreate?.expiresAt]);

  const togglePermission = (key) => {
    setForm((current) => {
      const permissions = new Set(current.permissions || []);
      if (permissions.has(key)) permissions.delete(key);
      else permissions.add(key);
      return { ...current, permissions: Array.from(permissions) };
    });
  };

  const edit = (item) => {
    if (item.isSuperAdmin) return;
    setEditingId(item._id || item.id);
    setForm({
      name: item.name || "",
      email: item.email || "",
      role: ["admin", "manager", "employee", "editor"].includes(item.role) ? item.role : "admin",
      password: "",
      tag: item.tag || "employee",
      permissions: item.permissions || [],
      adminAndroidAppAccess: Boolean(item.adminAndroidAppAccess),
      isActive: item.isActive !== false,
    });
  };

  const reset = () => {
    setEditingId("");
    setForm(empty);
    setPendingCreate(null);
    setOwnerOtp("");
    setNewAdminOtp("");
    setCreateError("");
  };

  const save = () => {
    if (editingId) {
      return runAction(async () => {
        await apiFetch(`/admin/admins/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({
            name: form.name,
            role: form.role,
            tag: form.tag,
            permissions: form.permissions || [],
            adminAndroidAppAccess: Boolean(form.adminAndroidAppAccess),
            isActive: form.isActive !== false,
            ...(form.password ? { password: form.password } : {}),
          }),
        });
        reset();
      }, "Admin account updated");
    }

    setCreateBusy(true);
    setCreateError("");
    return apiFetch("/admin/admins", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        role: form.role,
        password: form.password,
        tag: form.tag,
        permissions: form.permissions || [],
        adminAndroidAppAccess: Boolean(form.adminAndroidAppAccess),
      }),
    })
      .then((response) => {
        setPendingCreate(response);
        setOwnerOtp("");
        setNewAdminOtp("");
      })
      .catch((error) => setCreateError(error.message))
      .finally(() => setCreateBusy(false));
  };

  const verifyCreate = () => runAction(async () => {
    if (!pendingCreate?.challengeId) return false;
    await apiFetch("/admin/admins/verify-create", {
      method: "POST",
      body: JSON.stringify({ challengeId: pendingCreate.challengeId, ownerOtp, newAdminOtp }),
    });
    reset();
  }, "Admin account added");

  const resendCreateOtp = async () => {
    if (!pendingCreate?.challengeId) return;
    setResendBusy(true);
    setCreateError("");
    try {
      const response = await apiFetch("/admin/admins/resend-create-otp", {
        method: "POST",
        body: JSON.stringify({ challengeId: pendingCreate.challengeId }),
      });
      setPendingCreate(response);
      setOwnerOtp("");
      setNewAdminOtp("");
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setResendBusy(false);
    }
  };

  const remove = (item) => runAction(async () => {
    if (!window.confirm(`Delete admin ${item.email}?`)) return;
    await apiFetch(`/admin/admins/${item._id || item.id}`, { method: "DELETE" });
  }, "Admin account deleted");

  return (
    <div className="manager-grid">
      <section className="editor glass-panel">
        <h2>{editingId ? "Edit Admin" : "Add Admin"}</h2>
        <p className="muted">Only main owner can manage admins. New admin creation now requires OTP verification on both the main admin email and the new admin email.</p>
        <Input label="Admin Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        {!editingId && (
          <Input label="Admin Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
        )}
        {editingId && <Detail label="Admin Email" value={form.email} />}
        <div className="three-col">
          <Select
            label="Role"
            value={form.role}
            onChange={(role) => setForm({ ...form, role })}
            options={[
              { value: "admin", label: "Admin" },
              { value: "manager", label: "Manager" },
              { value: "employee", label: "Employee" },
              { value: "editor", label: "Editor (legacy)" },
            ]}
          />
          <Input label="Tag" value={form.tag} onChange={(tag) => setForm({ ...form, tag })} />
          <Input
            label={editingId ? "New Password (optional)" : "Password"}
            type="password"
            value={form.password}
            onChange={(password) => setForm({ ...form, password })}
          />
        </div>
        {editingId && (
          <Toggle label="Active account" checked={form.isActive !== false} onChange={(isActive) => setForm({ ...form, isActive })} />
        )}
        <Toggle
          label="Admin Android App Access"
          checked={Boolean(form.adminAndroidAppAccess)}
          onChange={(adminAndroidAppAccess) => setForm({ ...form, adminAndroidAppAccess })}
        />
        <div className="repeatable-block">
          <div className="repeatable-head">
            <h3>Section Access</h3>
          </div>
          <div className="permission-grid">
            {editablePermissions.map((permission) => (
              <Toggle
                key={permission.key}
                label={permission.label}
                checked={(form.permissions || []).includes(permission.key)}
                onChange={() => togglePermission(permission.key)}
              />
            ))}
          </div>
        </div>
        <div className="button-row">
          <button className="primary-button" disabled={busy || createBusy || !form.name || (!editingId && (!form.email || form.password.length < 8))} onClick={save}>
            {busy || createBusy ? "Saving..." : editingId ? "Update Admin" : "Send OTP to Create"}
          </button>
          {editingId && <button className="ghost-button" type="button" onClick={reset}>Cancel</button>}
        </div>
        {pendingCreate && (
          <div className="otp-confirm-panel">
            <p className="eyebrow">Dual email verification</p>
            <h3>Verify main owner and new admin emails</h3>
            <p className="muted">Owner OTP was sent to {pendingCreate.ownerEmail || pendingCreate.email}. New admin OTP was sent to {pendingCreate.newAdminEmail}.</p>
            <div className="two-col">
              <Input label="Main Admin OTP" value={ownerOtp} onChange={(value) => setOwnerOtp(value.replace(/\D/g, "").slice(0, 6))} />
              <Input label="New Admin OTP" value={newAdminOtp} onChange={(value) => setNewAdminOtp(value.replace(/\D/g, "").slice(0, 6))} />
            </div>
            <div className="otp-meta">
              <span>{createTimeLeft > 0 ? `Expires in ${formatCountdown(createTimeLeft)}` : "OTP expired"}</span>
              <button className="link-button" type="button" disabled={resendBusy} onClick={resendCreateOtp}>
                {resendBusy ? "Resending..." : "Resend both OTPs"}
              </button>
            </div>
            <div className="button-row">
              <button className="primary-button" type="button" disabled={busy || ownerOtp.length !== 6 || newAdminOtp.length !== 6} onClick={verifyCreate}>
                {busy ? "Verifying..." : "Verify and Create Admin"}
              </button>
              <button className="ghost-button" type="button" onClick={() => { setPendingCreate(null); setOwnerOtp(""); setNewAdminOtp(""); }}>
                Cancel OTP
              </button>
            </div>
            {createError && <p className="form-error">{createError}</p>}
          </div>
        )}
        {!pendingCreate && createError && <p className="form-error">{createError}</p>}
      </section>

      <section className="list-panel glass-panel">
        <h2>Admin Accounts</h2>
        {!admins.length && <p className="muted">No admin accounts found.</p>}
        {admins.map((item) => (
          <div className="list-item compact admin-account-row" key={item._id || item.id}>
            <AdminAccountAvatar admin={item} />
            <div>
              <strong>{item.name || item.email}</strong>
              <span>
                {item.email === currentAdmin?.email ? "Current login" : item.tag || item.role || "admin"}
                {item.lastLoginAt ? ` - Last login ${formatDateTime(item.lastLoginAt)}` : ""}
              </span>
              <small>{item.email}</small>
              <small>{item.isSuperAdmin || item.adminAndroidAppAccess ? "Android app access enabled" : "Android app access disabled"}</small>
              <small>{(item.permissions || []).map((key) => sectionCards.find((card) => card.key === key)?.label || key).join(", ") || "No section access"}</small>
            </div>
            <span className={`status-badge ${item.isActive ? "repaired" : ""}`}>
              {item.isSuperAdmin ? "Owner" : item.isActive ? "Active" : "Inactive"}
            </span>
            {!item.isSuperAdmin && <button type="button" onClick={() => edit(item)}>Edit</button>}
            {!item.isSuperAdmin && <button className="danger" type="button" onClick={() => remove(item)}>Delete</button>}
          </div>
        ))}
      </section>
    </div>
  );
}

function NotificationEmailManager({ emails, runAction, busy }) {
  const empty = { email: "", label: "", isEnabled: true };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");
  const enabledCount = emails.filter((item) => item.isEnabled !== false).length;
  const disabledCount = emails.length - enabledCount;
  const lastSent = emails
    .map((item) => item.lastDeliveryAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];

  const reset = () => {
    setForm(empty);
    setEditingId("");
  };

  const edit = (item) => {
    setEditingId(item._id || item.id);
    setForm({
      email: item.email || "",
      label: item.label || "",
      isEnabled: item.isEnabled !== false,
    });
  };

  const save = () => runAction(async () => {
    await apiFetch(editingId ? `/admin/notification-emails/${editingId}` : "/admin/notification-emails", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(form),
    });
    reset();
  }, editingId ? "Notification email updated" : "Notification email added");

  const remove = (item) => runAction(async () => {
    if (!window.confirm(`Delete notification email ${item.email}?`)) return;
    await apiFetch(`/admin/notification-emails/${item._id || item.id}`, { method: "DELETE" });
  }, "Notification email deleted");

  const toggle = (item) => runAction(async () => {
    await apiFetch(`/admin/notification-emails/${item._id || item.id}`, {
      method: "PUT",
      body: JSON.stringify({
        email: item.email,
        label: item.label || "",
        isEnabled: item.isEnabled === false,
      }),
    });
  }, item.isEnabled === false ? "Notifications enabled" : "Notifications disabled");

  return (
    <div className="manager-grid">
      <section className="editor glass-panel notification-email-editor">
        <p className="eyebrow">Booking alert delivery</p>
        <h2>{editingId ? "Edit Notification Email" : "Booking Notifications"}</h2>
        <p className="muted">Every new public booking sends a professional email notification to active admin accounts and enabled recipients here. Disable an email here to exclude it from booking alerts.</p>
        <div className="notification-analytics">
          <Detail label="Enabled Recipients" value={enabledCount} />
          <Detail label="Disabled Recipients" value={disabledCount} />
          <Detail label="Last Sent" value={formatDateTime(lastSent) || "No delivery yet"} />
        </div>
        <div className="two-col">
          <Input label="Recipient Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
          <Input label="Label / Team Member" value={form.label} onChange={(label) => setForm({ ...form, label })} />
        </div>
        <Toggle label="Receive booking notifications" checked={form.isEnabled !== false} onChange={(isEnabled) => setForm({ ...form, isEnabled })} />
        <div className="button-row">
          <button className="primary-button" type="button" disabled={busy || !form.email} onClick={save}>
            {editingId ? "Update Email" : "Add Email"}
          </button>
          {editingId && <button className="ghost-button" type="button" onClick={reset}>Cancel</button>}
        </div>
      </section>

      <section className="list-panel glass-panel">
        <h2>Notification Recipients</h2>
        {!emails.length && <p className="muted">No custom notification emails yet. Active admin account emails will still receive booking alerts.</p>}
        {emails.map((item) => (
          <div className="list-item compact notification-email-row" key={item._id || item.id}>
            <div>
              <strong><Mail size={15} /> {item.label || item.email}</strong>
              <span>{item.email}</span>
              <small>{item.lastDeliveryAt ? `Last delivered ${formatDateTime(item.lastDeliveryAt)}` : "No delivery recorded yet"}</small>
            </div>
            <span className={`status-badge ${item.isEnabled !== false ? "repaired" : ""}`}>
              {item.isEnabled !== false ? "Enabled" : "Disabled"}
            </span>
            <button type="button" onClick={() => toggle(item)}>{item.isEnabled !== false ? "Disable" : "Enable"}</button>
            <button type="button" onClick={() => edit(item)}>Edit</button>
            <button className="danger" type="button" onClick={() => remove(item)}>Delete</button>
          </div>
        ))}
      </section>
    </div>
  );
}

function ProductManager({ title = "Our Services", products, categories, runAction, busy, featuredDefault = false }) {
  const empty = {
    title: "",
    slug: "",
    category: "",
    categoryName: "",
    iconName: "Plug",
    iconImageUrl: "",
    badge: "",
    shortDescription: "",
    description: "",
    imageUrl: "",
    highlights: "",
    detailEyebrow: "",
    detailOverview: "",
    detailIdealFor: "",
    detailSteps: "",
    detailFeatures: "",
    isActive: true,
    isFeatured: featuredDefault,
    displayOrder: 0,
  };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");
  const [openProductId, setOpenProductId] = useState("");
  const batch = useBatchSelection(products);

  const edit = (product) => {
    setEditingId(product._id);
    setOpenProductId(product._id);
    setForm({
      title: product.title || "",
      slug: product.slug || "",
      category: product.category?._id || product.category || "",
      categoryName: product.category?.name || product.categoryName || "",
      iconName: product.iconName || "Plug",
      iconImageUrl: product.iconImageUrl || product.iconUrl || "",
      badge: product.badge || "",
      shortDescription: product.shortDescription || "",
      description: product.description || "",
      imageUrl: product.imageUrl || "",
      highlights: arrayToLines(product.highlights),
      detailEyebrow: product.detail?.eyebrow || "",
      detailOverview: product.detail?.overview || "",
      detailIdealFor: arrayToLines(product.detail?.idealFor),
      detailSteps: arrayToLines(product.detail?.steps),
      detailFeatures: arrayToLines(product.detail?.features),
      isActive: product.isActive !== false,
      isFeatured: Boolean(product.isFeatured),
      displayOrder: product.displayOrder || 0,
    });
  };

  const save = () => runAction(async () => {
    const category = categories.find((item) => item._id === form.category);
    const payload = {
      title: form.title,
      slug: form.slug,
      category: form.category,
      categoryName: category?.name || form.categoryName,
      iconName: form.iconName,
      iconImageUrl: form.iconImageUrl,
      badge: form.badge,
      shortDescription: form.shortDescription,
      description: form.description,
      imageUrl: form.imageUrl,
      highlights: linesToArray(form.highlights),
      detail: {
        eyebrow: form.detailEyebrow,
        overview: form.detailOverview,
        idealFor: linesToArray(form.detailIdealFor),
        steps: linesToArray(form.detailSteps),
        features: linesToArray(form.detailFeatures),
      },
      isActive: form.isActive,
      isFeatured: featuredDefault ? true : form.isFeatured,
      displayOrder: Number(form.displayOrder || 0),
    };
    await apiFetch(editingId ? `/admin/products/${editingId}` : "/admin/products", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    setForm(empty);
    setEditingId("");
  }, "Product saved");

  const deleteSelected = () => runAction(async () => {
    if (!batch.selectedIds.length) return false;
    if (!window.confirm(`Delete ${batch.selectedIds.length} ${title.toLowerCase()} item${batch.selectedIds.length > 1 ? "s" : ""}?`)) return false;
    await Promise.all(batch.selectedIds.map((id) => apiFetch(`/admin/products/${id}`, { method: "DELETE" })));
    if (batch.selectedSet.has(editingId)) {
      setEditingId("");
      setForm(empty);
    }
    if (batch.selectedSet.has(openProductId)) setOpenProductId("");
    batch.clearSelection();
  }, `${title} deleted`);

  return (
    <div className="manager-grid">
      <section className="editor glass-panel">
        <h2>{editingId ? `Edit ${title}` : `Add ${title}`}</h2>
        <div className="two-col">
          <Input label="Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
          <Input label="Slug" value={form.slug} onChange={(slug) => setForm({ ...form, slug })} />
          <Select
            label="Category"
            value={form.category}
            onChange={(category) => setForm({ ...form, category })}
            options={categories.map((item) => ({ value: item._id, label: item.name }))}
          />
          <IconPickerInput label="Icon" value={form.iconName} onChange={(iconName) => setForm({ ...form, iconName })} />
          <Input label="Badge" value={form.badge} onChange={(badge) => setForm({ ...form, badge })} />
          <Input label="Display order" type="number" value={form.displayOrder} onChange={(displayOrder) => setForm({ ...form, displayOrder })} />
        </div>
        <ImageField label="Icon image URL" value={form.iconImageUrl} onChange={(iconImageUrl) => setForm({ ...form, iconImageUrl })} />
        <Textarea label="Short description" value={form.shortDescription} onChange={(shortDescription) => setForm({ ...form, shortDescription })} />
        <Textarea label="Full description" value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <ImageField value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
        <Textarea label="Highlights, one per line" value={form.highlights} onChange={(highlights) => setForm({ ...form, highlights })} />
        <div className="two-col">
          <Input label="Detail eyebrow" value={form.detailEyebrow} onChange={(detailEyebrow) => setForm({ ...form, detailEyebrow })} />
          <Textarea label="Detail overview" value={form.detailOverview} onChange={(detailOverview) => setForm({ ...form, detailOverview })} />
        </div>
        <div className="three-col">
          <Textarea label="Ideal for" value={form.detailIdealFor} onChange={(detailIdealFor) => setForm({ ...form, detailIdealFor })} />
          <Textarea label="Steps" value={form.detailSteps} onChange={(detailSteps) => setForm({ ...form, detailSteps })} />
          <Textarea label="Features" value={form.detailFeatures} onChange={(detailFeatures) => setForm({ ...form, detailFeatures })} />
        </div>
        <div className="toggle-row">
          <Toggle label="Active" checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} />
          {!featuredDefault && <Toggle label="Featured" checked={form.isFeatured} onChange={(isFeatured) => setForm({ ...form, isFeatured })} />}
        </div>
        <div className="button-row">
          <button className="primary-button" disabled={busy} onClick={save}>Save {title}</button>
          {editingId && <button className="ghost-button" onClick={() => { setEditingId(""); setForm(empty); }}>Cancel</button>}
        </div>
      </section>

      <section className="list-panel glass-panel">
        <h2>{title}</h2>
        {!products.length && <p className="muted">No {title.toLowerCase()} yet.</p>}
        <BatchToolbar
          total={products.length}
          selectedCount={batch.selectedCount}
          allSelected={batch.allSelected}
          isIndeterminate={batch.isIndeterminate}
          onSelectAll={batch.selectAll}
          onClear={batch.clearSelection}
          onDelete={deleteSelected}
          disabled={busy}
          noun={title}
        />
        {products.map((product) => (
          <AccordionCard
            key={product._id}
            id={product._id}
            openId={openProductId}
            onToggle={setOpenProductId}
            imageUrl={product.imageUrl}
            title={product.title}
            meta={product.category?.name || product.categoryName || "No category"}
            status={product.isActive === false ? "Inactive" : "Active"}
            selectable
            checked={batch.selectedSet.has(product._id)}
            selected={batch.selectedSet.has(product._id)}
            selectLabel={`Select ${product.title || title}`}
            onSelect={(checked) => batch.toggleOne(product._id, checked)}
            disabled={busy}
          >
            <p>{product.shortDescription || product.description || "No description added."}</p>
            <div className="detail-grid compact-details">
              <Detail label="Slug" value={product.slug || "Not set"} />
              <Detail label="Badge" value={product.badge || "None"} />
              <Detail label="Display Order" value={product.displayOrder ?? 0} />
              <Detail label="Featured" value={product.isFeatured ? "Yes" : "No"} />
            </div>
            <div className="button-row">
              <button type="button" onClick={() => edit(product)}>Edit</button>
              <button className="danger" type="button" onClick={() => runAction(() => apiFetch(`/admin/products/${product._id}`, { method: "DELETE" }), "Product deleted")}>
                Delete
              </button>
            </div>
          </AccordionCard>
        ))}
      </section>
    </div>
  );
}

// Legacy editor retained for existing data migrations; hidden from navigation.
// eslint-disable-next-line no-unused-vars
function CategoryManager({ categories, runAction, busy }) {
  const empty = { name: "", slug: "", description: "", imageUrl: "", isActive: true, displayOrder: 0 };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");

  const save = () => runAction(async () => {
    await apiFetch(editingId ? `/admin/categories/${editingId}` : "/admin/categories", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(form),
    });
    setForm(empty);
    setEditingId("");
  }, "Category saved");

  return (
    <div className="manager-grid">
      <section className="editor glass-panel">
        <h2>{editingId ? "Edit Category" : "Add Category"}</h2>
        <div className="two-col">
          <Input label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Input label="Slug" value={form.slug} onChange={(slug) => setForm({ ...form, slug })} />
          <Input label="Display order" type="number" value={form.displayOrder} onChange={(displayOrder) => setForm({ ...form, displayOrder })} />
        </div>
        <Textarea label="Description" value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <ImageField value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
        <Toggle label="Active" checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} />
        <button className="primary-button" disabled={busy} onClick={save}>Save Category</button>
      </section>

      <section className="list-panel glass-panel">
        <h2>Categories</h2>
        {categories.map((category) => (
          <div className="list-item compact" key={category._id}>
            <div>
              <strong>{category.name}</strong>
              <span>{category.slug}</span>
            </div>
            <button onClick={() => { setEditingId(category._id); setForm(category); }}>Edit</button>
            <button className="danger" onClick={() => runAction(() => apiFetch(`/admin/categories/${category._id}`, { method: "DELETE" }), "Category deleted")}>
              Delete
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
function HeroManager({ hero, runAction, busy }) {
  const [form, setForm] = useState(() => heroToForm(hero));

  useEffect(() => {
    setForm(heroToForm(hero));
  }, [hero]);

  const save = () => runAction(() => apiFetch("/admin/hero", {
    method: "PUT",
    body: JSON.stringify({
      eyebrow: form.eyebrow,
      title: form.title,
      highlight: form.highlight,
      titleSuffix: form.titleSuffix,
      description: form.description,
      primaryCta: { label: form.primaryLabel, href: form.primaryHref },
      secondaryCta: { label: form.secondaryLabel, href: form.secondaryHref },
      image: { url: form.imageUrl, alt: form.imageAlt },
      trustBadges: form.trustBadges.filter((item) => item.label || item.iconName),
      floatingBadges: form.floatingBadges.filter((item) => item.label || item.value),
      isActive: true,
    }),
  }), "Hero saved");

  return (
    <section className="editor glass-panel single">
      <h2>Hero Section</h2>
      <div className="two-col">
        <Input label="Eyebrow" value={form.eyebrow} onChange={(eyebrow) => setForm({ ...form, eyebrow })} />
        <Input label="Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
        <Input label="Highlight" value={form.highlight} onChange={(highlight) => setForm({ ...form, highlight })} />
        <Input label="Title suffix" value={form.titleSuffix} onChange={(titleSuffix) => setForm({ ...form, titleSuffix })} />
        <Input label="Primary CTA label" value={form.primaryLabel} onChange={(primaryLabel) => setForm({ ...form, primaryLabel })} />
        <Input label="Primary CTA href" value={form.primaryHref} onChange={(primaryHref) => setForm({ ...form, primaryHref })} />
        <Input label="Secondary CTA label" value={form.secondaryLabel} onChange={(secondaryLabel) => setForm({ ...form, secondaryLabel })} />
        <Input label="Secondary CTA href" value={form.secondaryHref} onChange={(secondaryHref) => setForm({ ...form, secondaryHref })} />
      </div>
      <Textarea label="Description" value={form.description} onChange={(description) => setForm({ ...form, description })} />
      <ImageField value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
      <Input label="Image alt" value={form.imageAlt} onChange={(imageAlt) => setForm({ ...form, imageAlt })} />
      <RepeatableRows
        title="Trust Badges"
        items={form.trustBadges}
        emptyItem={{ iconName: "ShieldCheck", label: "" }}
        onChange={(trustBadges) => setForm({ ...form, trustBadges })}
        renderItem={(badge, update) => (
          <div className="two-col">
            <IconPickerInput label="Icon" value={badge.iconName} onChange={(iconName) => update({ iconName })} />
            <Input label="Label" value={badge.label} onChange={(label) => update({ label })} />
          </div>
        )}
      />
      <RepeatableRows
        title="Floating Badges"
        items={form.floatingBadges}
        emptyItem={{ label: "", value: "" }}
        onChange={(floatingBadges) => setForm({ ...form, floatingBadges })}
        renderItem={(badge, update) => (
          <div className="two-col">
            <Input label="Label" value={badge.label} onChange={(label) => update({ label })} />
            <Input label="Value" value={badge.value} onChange={(value) => update({ value })} />
          </div>
        )}
      />
      <button className="primary-button" disabled={busy} onClick={save}>Save Hero</button>
    </section>
  );
}

function heroToForm(hero) {
  return {
    eyebrow: hero?.eyebrow || "",
    title: hero?.title || "",
    highlight: hero?.highlight || "",
    titleSuffix: hero?.titleSuffix || "",
    description: hero?.description || "",
    primaryLabel: hero?.primaryCta?.label || "",
    primaryHref: hero?.primaryCta?.href || "",
    secondaryLabel: hero?.secondaryCta?.label || "",
    secondaryHref: hero?.secondaryCta?.href || "",
    imageUrl: hero?.image?.url || "",
    imageAlt: hero?.image?.alt || "",
    trustBadges: hero?.trustBadges?.length ? hero.trustBadges : [{ iconName: "ShieldCheck", label: "" }],
    floatingBadges: hero?.floatingBadges?.length ? hero.floatingBadges : [{ label: "", value: "" }],
  };
}

// eslint-disable-next-line no-unused-vars
function ContactManager({ contact, runAction, busy }) {
  const [form, setForm] = useState(() => contactToForm(contact));

  useEffect(() => {
    setForm(contactToForm(contact));
  }, [contact]);

  const save = () => runAction(() => apiFetch("/admin/contact", {
    method: "PUT",
    body: JSON.stringify({
      ...form,
      socialLinks: form.socialLinks.filter((item) => item.platform || item.url),
    }),
  }), "Contact saved");

  return (
    <section className="editor glass-panel single">
      <h2>Contact Details</h2>
      <div className="two-col">
        <Input label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
        <Input label="Alternate phone" value={form.alternatePhone} onChange={(alternatePhone) => setForm({ ...form, alternatePhone })} />
        <Input label="WhatsApp number" value={form.whatsappNumber} onChange={(whatsappNumber) => setForm({ ...form, whatsappNumber })} />
        <Input label="Email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
        <Input label="Short address" value={form.shortAddress} onChange={(shortAddress) => setForm({ ...form, shortAddress })} />
        <Input label="Formspree endpoint" value={form.formspreeEndpoint} onChange={(formspreeEndpoint) => setForm({ ...form, formspreeEndpoint })} />
      </div>
      <Textarea label="WhatsApp message" value={form.whatsappMessage} onChange={(whatsappMessage) => setForm({ ...form, whatsappMessage })} />
      <Textarea label="Address" value={form.address} onChange={(address) => setForm({ ...form, address })} />
      <Textarea label="Google map embed URL" value={form.googleMapEmbedUrl} onChange={(googleMapEmbedUrl) => setForm({ ...form, googleMapEmbedUrl })} />
      <Textarea label="Street view embed URL" value={form.streetViewEmbedUrl} onChange={(streetViewEmbedUrl) => setForm({ ...form, streetViewEmbedUrl })} />
      <RepeatableRows
        title="Social Links"
        items={form.socialLinks}
        emptyItem={{ platform: "Facebook", url: "" }}
        onChange={(socialLinks) => setForm({ ...form, socialLinks })}
        renderItem={(link, update) => (
          <div className="two-col">
            <Input label="Platform" value={link.platform} onChange={(platform) => update({ platform })} />
            <Input label="URL" value={link.url} onChange={(url) => update({ url })} />
          </div>
        )}
      />
      <button className="primary-button" disabled={busy} onClick={save}>Save Contact</button>
    </section>
  );
}

function GalleryManager({ content, runAction, busy }) {
  const contentMap = useMemo(
    () => Object.fromEntries(content.map((doc) => [doc.key, doc.value])),
    [content],
  );
  const [form, setForm] = useState(() => contentToForm("gallery", contentMap.gallery));

  useEffect(() => {
    setForm(contentToForm("gallery", contentMap.gallery));
  }, [contentMap]);

  const save = () => runAction(async () => {
    await apiFetch("/admin/site-content/gallery", {
      method: "PUT",
      body: JSON.stringify({ value: formToContent("gallery", form) }),
    });
  }, "Gallery saved");

  const addUploadedImages = (images = []) => {
    const uploadedItems = images
      .filter((image) => image?.url)
      .map((image) => ({
        imageUrl: image.url,
        imagePublicId: image.publicId || "",
        label: image.originalName ? image.originalName.replace(/\.[^.]+$/, "") : "Gallery image",
        caption: "",
        span: "",
      }));
    if (!uploadedItems.length) return;
    setForm((current) => ({ ...current, items: [...(current.items || []), ...uploadedItems] }));
  };

  return (
    <section className="editor glass-panel single">
      <h2>Gallery Section</h2>
      <SectionHeadingFields form={form} setForm={setForm} includeDescription={false} />
      <ImageField
        label="Bulk Gallery Upload"
        value=""
        onChange={() => undefined}
        multiple
        onMultipleUpload={addUploadedImages}
      />
      <RepeatableRows
        title="Gallery Items"
        items={form.items}
        emptyItem={{ imageUrl: "", label: "", caption: "", span: "" }}
        onChange={(items) => setForm({ ...form, items })}
        enableBatchDelete
        renderItem={(item, update) => (
          <>
            <div className="two-col">
              <Input label="Label" value={item.label} onChange={(label) => update({ label })} />
              <Select
                label="Layout size"
                value={item.span}
                onChange={(span) => update({ span })}
                options={[
                  { value: "", label: "Normal" },
                  { value: "md:col-span-2", label: "Wide" },
                  { value: "md:row-span-2", label: "Tall" },
                  { value: "md:col-span-2 md:row-span-2", label: "Large" },
                  { value: "md:col-span-3", label: "Extra wide" },
                ]}
              />
            </div>
            <ImageField value={item.imageUrl || item.src} onChange={(imageUrl) => update({ imageUrl })} />
            <Textarea label="Caption" value={item.caption} onChange={(caption) => update({ caption })} />
          </>
        )}
      />
      <button className="primary-button" disabled={busy} onClick={save}>Save Gallery</button>
    </section>
  );
}

function contactToForm(contact) {
  return {
    phone: contact?.phone || "",
    alternatePhone: contact?.alternatePhone || "",
    whatsappNumber: contact?.whatsappNumber || "",
    whatsappMessage: contact?.whatsappMessage || "",
    email: contact?.email || "",
    address: contact?.address || "",
    shortAddress: contact?.shortAddress || "",
    googleMapEmbedUrl: contact?.googleMapEmbedUrl || "",
    streetViewEmbedUrl: contact?.streetViewEmbedUrl || "",
    formspreeEndpoint: contact?.formspreeEndpoint || "https://formspree.io/f/xeeooogp",
    socialLinks: contact?.socialLinks?.length ? contact.socialLinks : [{ platform: "Facebook", url: "" }],
  };
}

function OfferManager({ offers, runAction, busy }) {
  const empty = { title: "", description: "", code: "", imageUrl: "", ctaLabel: "Book now", ctaHref: "#contact", isActive: true, displayOrder: 0 };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");
  const [openOfferId, setOpenOfferId] = useState("");
  const batch = useBatchSelection(offers);

  const save = () => runAction(async () => {
    await apiFetch(editingId ? `/admin/offers/${editingId}` : "/admin/offers", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(form),
    });
    setForm(empty);
    setEditingId("");
  }, "Offer saved");

  const deleteSelected = () => runAction(async () => {
    if (!batch.selectedIds.length) return false;
    if (!window.confirm(`Delete ${batch.selectedIds.length} offer${batch.selectedIds.length > 1 ? "s" : ""}?`)) return false;
    await Promise.all(batch.selectedIds.map((id) => apiFetch(`/admin/offers/${id}`, { method: "DELETE" })));
    if (batch.selectedSet.has(editingId)) {
      setEditingId("");
      setForm(empty);
    }
    if (batch.selectedSet.has(openOfferId)) setOpenOfferId("");
    batch.clearSelection();
  }, "Offers deleted");

  return (
    <div className="manager-grid">
      <section className="editor glass-panel">
        <h2>{editingId ? "Edit Offer" : "Add Offer"}</h2>
        <div className="two-col">
          <Input label="Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
          <Input label="Code" value={form.code} onChange={(code) => setForm({ ...form, code })} />
          <Input label="CTA label" value={form.ctaLabel} onChange={(ctaLabel) => setForm({ ...form, ctaLabel })} />
          <Input label="CTA href" value={form.ctaHref} onChange={(ctaHref) => setForm({ ...form, ctaHref })} />
          <Input label="Display order" type="number" value={form.displayOrder} onChange={(displayOrder) => setForm({ ...form, displayOrder })} />
        </div>
        <Textarea label="Description" value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <ImageField value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
        <Toggle label="Active" checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} />
        <button className="primary-button" disabled={busy} onClick={save}>Save Offer</button>
      </section>
      <section className="list-panel glass-panel">
        <h2>Offers</h2>
        {!offers.length && <p className="muted">No offers yet.</p>}
        <BatchToolbar
          total={offers.length}
          selectedCount={batch.selectedCount}
          allSelected={batch.allSelected}
          isIndeterminate={batch.isIndeterminate}
          onSelectAll={batch.selectAll}
          onClear={batch.clearSelection}
          onDelete={deleteSelected}
          disabled={busy}
          noun="offers"
        />
        {offers.map((offer) => (
          <AccordionCard
            key={offer._id}
            id={offer._id}
            openId={openOfferId}
            onToggle={setOpenOfferId}
            imageUrl={offer.imageUrl}
            title={offer.title}
            meta={offer.code || "No code"}
            status={offer.isActive === false ? "Inactive" : "Active"}
            selectable
            checked={batch.selectedSet.has(offer._id)}
            selected={batch.selectedSet.has(offer._id)}
            selectLabel={`Select ${offer.title || "offer"}`}
            onSelect={(checked) => batch.toggleOne(offer._id, checked)}
            disabled={busy}
          >
            <p>{offer.description || "No description added."}</p>
            <div className="detail-grid compact-details">
              <Detail label="CTA" value={offer.ctaLabel || "Not set"} />
              <Detail label="Link" value={offer.ctaHref || "Not set"} />
              <Detail label="Display Order" value={offer.displayOrder ?? 0} />
            </div>
            <div className="button-row">
              <button
                type="button"
                onClick={() => {
                  setOpenOfferId(offer._id);
                  setEditingId(offer._id);
                  setForm({ ...empty, ...offer });
                }}
              >
                Edit
              </button>
              <button className="danger" type="button" onClick={() => runAction(() => apiFetch(`/admin/offers/${offer._id}`, { method: "DELETE" }), "Offer deleted")}>
                Delete
              </button>
            </div>
          </AccordionCard>
        ))}
      </section>
    </div>
  );
}

function BookingsManager({ bookings, runAction, busy }) {
  const [selected, setSelected] = useState(null);
  const batch = useBatchSelection(bookings);
  const activeBooking = selected ? bookings.find((booking) => booking._id === selected._id) || selected : null;

  const bookingProducts = (booking) => {
    const items = Array.isArray(booking?.products) ? booking.products.filter((item) => item?.productName) : [];
    if (items.length) return items;
    if (!booking?.productName) return [];
    return [{
      productName: booking.productName,
      productCategory: booking.productCategory,
      productImageUrl: booking.productImageUrl,
      quantity: 1,
    }];
  };

  const bookingTitle = (booking) => {
    const items = bookingProducts(booking);
    if (!items.length) return booking.repairType;
    if (items.length === 1) return items[0].productName;
    return `${items.length} products: ${items.slice(0, 3).map((item) => item.productName).join(", ")}${items.length > 3 ? "..." : ""}`;
  };

  const bookingImage = (booking) => bookingProducts(booking)[0]?.productImageUrl || booking.productImageUrl || "";

  const bookingMeta = (booking) => {
    const items = bookingProducts(booking);
    const categories = [...new Set(items.map((item) => item.productCategory).filter(Boolean))];
    return categories.join(", ") || booking.bookingSource || formatDateTime(booking.requestedAt || booking.createdAt);
  };

  const activeProducts = bookingProducts(activeBooking);

  const deleteSelected = () => runAction(async () => {
    if (!batch.selectedIds.length) return false;
    if (!window.confirm(`Delete ${batch.selectedIds.length} booking${batch.selectedIds.length > 1 ? "s" : ""}?`)) return false;
    await Promise.all(batch.selectedIds.map((id) => apiFetch(`/admin/bookings/${id}`, { method: "DELETE" })));
    if (activeBooking && batch.selectedSet.has(activeBooking._id)) setSelected(null);
    batch.clearSelection();
  }, "Bookings deleted");

  return (
    <div className="manager-grid">
      <section className="list-panel glass-panel">
        <h2>Bookings</h2>
        {!bookings.length && <p className="muted">No booking requests yet.</p>}
        <BatchToolbar
          total={bookings.length}
          selectedCount={batch.selectedCount}
          allSelected={batch.allSelected}
          isIndeterminate={batch.isIndeterminate}
          onSelectAll={batch.selectAll}
          onClear={batch.clearSelection}
          onDelete={deleteSelected}
          disabled={busy}
          noun="bookings"
        />
        {bookings.map((booking) => (
          <div
            className={`booking-row has-selection ${batch.selectedSet.has(booking._id) ? "batch-selected" : ""}`}
            key={booking._id}
            onClick={() => setSelected(booking)}
          >
            <span className="batch-row-check" onClick={(event) => event.stopPropagation()}>
              <BatchCheckbox
                compact
                label={`Select booking from ${booking.fullName || "customer"}`}
                checked={batch.selectedSet.has(booking._id)}
                onChange={(checked) => batch.toggleOne(booking._id, checked)}
                disabled={busy}
              />
            </span>
            {bookingImage(booking) ? (
              <img className="booking-thumb" src={bookingImage(booking)} alt={bookingTitle(booking) || "Booked product"} />
            ) : (
              <span className="booking-thumb placeholder">No image</span>
            )}
            <div>
              <strong>{booking.fullName}</strong>
              <span>{booking.phoneNumber}</span>
            </div>
            <div>
              <strong>{bookingTitle(booking)}</strong>
              <span>{bookingMeta(booking)}</span>
            </div>
            <span className="status-badge">{booking.bookingSource || "manual"}</span>
            <span className={`status-badge ${booking.status}`}>{booking.status === "repaired" ? "Repaired" : "Pending"}</span>
            <span className={`status-badge ${emailStatusClass(booking.emailNotification?.status)}`}>{emailStatusLabel(booking.emailNotification?.status)}</span>
          </div>
        ))}
      </section>

      <section className="editor glass-panel">
        <h2>Booking Details</h2>
        {!activeBooking && <p className="muted">Select a booking to view customer details.</p>}
        {activeBooking && (
          <>
            {activeProducts.length > 0 && (
              <div className="booking-products-details">
                <h3>Products Details</h3>
                <div className="booking-products-card-grid">
                  {activeProducts.map((product, index) => (
                    <article className="booking-product-detail-card" key={`${product.productId || product.productSlug || product.productName}-${index}`}>
                      <div className="booking-product-detail-image">
                        {product.productImageUrl ? (
                          <img src={product.productImageUrl} alt={product.productName} />
                        ) : (
                          <span>No image</span>
                        )}
                        <small>{index + 1}</small>
                      </div>
                      <div className="booking-product-detail-content">
                        <strong>{product.productName}</strong>
                        <span>{product.productCategory || "Product"}</span>
                      </div>
                      <small className="booking-product-qty-badge">Qty {Number(product.quantity || 1)}</small>
                    </article>
                  ))}
                </div>
              </div>
            )}
            {/* Display multiple images if available */}
            {activeBooking.images && activeBooking.images.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Images ({activeBooking.images.length})</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {activeBooking.images.map((image, index) => (
                    <img
                      key={index}
                      src={image.url}
                      alt={`Booking attachment ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => window.open(image.url, '_blank')}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* Display single image for backward compatibility */}
            {!activeBooking.images || activeBooking.images.length === 0 ? (
              activeBooking.imageUrl && <img className="detail-image" src={activeBooking.imageUrl} alt="" />
            ) : null}
            <div className="detail-grid">
              <Detail label="Name" value={activeBooking.fullName} />
              <Detail label="Phone" value={activeBooking.phoneNumber} />
              <Detail label="WhatsApp" value={activeBooking.whatsappNumber} />
              <Detail label="Customer Email" value={activeBooking.customerEmail || "Not provided"} />
              <Detail label="Repair Type" value={activeBooking.repairType} />
              <Detail label="Product Name" value={bookingTitle(activeBooking) || "Not linked"} />
              <Detail label="Product Category" value={bookingMeta(activeBooking) || "Not linked"} />
              <Detail label="Booking Source" value={activeBooking.bookingSource || "manual"} />
              <Detail label="Date / Day / Time" value={formatDateTime(activeBooking.requestedAt || activeBooking.createdAt, true)} />
              <Detail label="Status" value={activeBooking.status} />
              <Detail label="Email Delivery" value={emailStatusLabel(activeBooking.emailNotification?.status)} />
              <Detail label="Email Recipients" value={(activeBooking.emailNotification?.recipients || []).join(", ") || "Not sent"} />
              <Detail label="Failed Emails" value={(activeBooking.emailNotification?.failedRecipients || []).join(", ") || "None"} />
              <Detail label="Email Sent At" value={formatDateTime(activeBooking.emailNotification?.sentAt) || "Not sent"} />
              <Detail label="Email Provider" value={activeBooking.emailNotification?.provider || "Auto"} />
              <Detail label="Repair Email" value={customerEmailStatusLabel(activeBooking.repairNotification?.status)} />
              <Detail label="Repair Email Sent At" value={formatDateTime(activeBooking.repairNotification?.sentAt) || "Not sent"} />
            </div>
            {activeBooking.emailNotification?.error && <Detail label="Email Error" value={activeBooking.emailNotification.error} />}
            {activeBooking.repairNotification?.error && <Detail label="Repair Email Error" value={activeBooking.repairNotification.error} />}
            {Array.isArray(activeBooking.emailNotification?.logs) && activeBooking.emailNotification.logs.length > 0 && (
              <div className="notification-log-panel">
                <h3>Notification Logs</h3>
                {activeBooking.emailNotification.logs.slice(-6).reverse().map((log, index) => (
                  <div className="notification-log-row" key={`${log.at || index}-${log.recipient || index}`}>
                    <span className={`status-badge ${emailStatusClass(log.status)}`}>{emailStatusLabel(log.status)}</span>
                    <strong>{log.recipient || "System"}</strong>
                    <small>{formatDateTime(log.at)}{log.provider ? ` - ${log.provider}` : ""}{log.error ? ` - ${log.error}` : ""}</small>
                  </div>
                ))}
              </div>
            )}
            <Detail label="Address" value={activeBooking.address} />
            <Detail label="Message" value={activeBooking.message || "No message"} />
            <div className="button-row">
              <button
                className="ghost-button"
                disabled={busy}
                onClick={() => runAction(() => apiFetch(`/admin/bookings/${activeBooking._id}/retry-email`, { method: "POST", body: JSON.stringify({}) }), "Booking email notification retried")}
              >
                <Send size={16} /> Retry Email
              </button>
              <button
                className="primary-button"
                disabled={busy || activeBooking.status === "repaired"}
                onClick={() => runAction(() => apiFetch(`/admin/bookings/${activeBooking._id}/repaired`, { method: "PATCH", body: JSON.stringify({}) }), "Booking marked as repaired")}
              >
                Mark as Repaired
              </button>
              <button
                className="ghost-button danger-text"
                disabled={busy}
                onClick={() => runAction(async () => {
                  await apiFetch(`/admin/bookings/${activeBooking._id}`, { method: "DELETE" });
                  setSelected(null);
                }, "Booking deleted")}
              >
                Delete Booking
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function TestimonialsManager({ content, runAction, busy }) {
  const contentMap = useMemo(() => Object.fromEntries(content.map((doc) => [doc.key, doc.value])), [content]);
  const [form, setForm] = useState(() => contentToForm("testimonials", contentMap.testimonials));

  useEffect(() => {
    setForm(contentToForm("testimonials", contentMap.testimonials));
  }, [contentMap]);

  const save = () => runAction(() => apiFetch("/admin/site-content/testimonials", {
    method: "PUT",
    body: JSON.stringify({ value: formToContent("testimonials", form) }),
  }), "Testimonials saved");

  return (
    <section className="editor glass-panel single">
      <h2>Testimonials</h2>
      <SectionHeadingFields form={form} setForm={setForm} includeDescription={false} />
      <RepeatableRows
        title="Testimonials"
        items={form.items}
        emptyItem={{ name: "", role: "", rating: 5, text: "", avatar: "", imageUrl: "" }}
        onChange={(items) => setForm({ ...form, items })}
        enableBatchDelete
        renderItem={(item, update) => (
          <>
            <div className="three-col">
              <Input label="Customer name" value={item.name} onChange={(name) => update({ name })} />
              <Input label="Place / Role" value={item.role} onChange={(role) => update({ role })} />
              <Input label="Rating" type="number" value={item.rating} onChange={(rating) => update({ rating })} />
            </div>
            <Textarea label="Review text" value={item.text} onChange={(text) => update({ text })} />
            <ImageField value={item.imageUrl || ""} onChange={(imageUrl) => update({ imageUrl })} />
            <Input label="Avatar initials" value={item.avatar} onChange={(avatar) => update({ avatar })} />
          </>
        )}
      />
      <button className="primary-button" disabled={busy} onClick={save}>Save Testimonials</button>
    </section>
  );
}

function AboutManager({ content, runAction, busy }) {
  const contentMap = useMemo(() => Object.fromEntries(content.map((doc) => [doc.key, doc.value])), [content]);
  const [form, setForm] = useState(() => contentToForm("about", contentMap.about));

  useEffect(() => {
    setForm(contentToForm("about", contentMap.about));
  }, [contentMap]);

  const save = () => runAction(() => apiFetch("/admin/site-content/about", {
    method: "PUT",
    body: JSON.stringify({ value: formToContent("about", form) }),
  }), "About cards saved");

  return (
    <section className="editor glass-panel single">
      <h2>About Prakash Electronics</h2>
      <SectionHeadingFields form={form} setForm={setForm} />
      <RepeatableRows
        title="About Cards"
        items={form.reasons}
        emptyItem={{ iconName: "ShieldCheck", title: "", desc: "" }}
        onChange={(reasons) => setForm({ ...form, reasons })}
        enableBatchDelete
        renderItem={(reason, update) => (
          <>
            <div className="two-col">
              <IconPickerInput label="Icon" value={reason.iconName} onChange={(iconName) => update({ iconName })} />
              <Input label="Title" value={reason.title} onChange={(title) => update({ title })} />
            </div>
            <Textarea label="Description" value={reason.desc} onChange={(desc) => update({ desc })} />
          </>
        )}
      />
      <button className="primary-button" disabled={busy} onClick={save}>Save About Cards</button>
    </section>
  );
}

function FooterManager({ content, contact, runAction, busy }) {
  const contentMap = useMemo(() => Object.fromEntries(content.map((doc) => [doc.key, doc.value])), [content]);
  const [form, setForm] = useState(() => ({
    ...contentToForm("footer", contentMap.footer),
    googleMapEmbedUrl: contact?.googleMapEmbedUrl || "",
    streetViewEmbedUrl: contact?.streetViewEmbedUrl || "",
  }));

  useEffect(() => {
    setForm({
      ...contentToForm("footer", contentMap.footer),
      googleMapEmbedUrl: contact?.googleMapEmbedUrl || "",
      streetViewEmbedUrl: contact?.streetViewEmbedUrl || "",
    });
  }, [contentMap, contact]);

  const save = () => runAction(async () => {
    await apiFetch("/admin/site-content/footer", {
      method: "PUT",
      body: JSON.stringify({ value: formToContent("footer", form) }),
    });
    await apiFetch("/admin/contact", {
      method: "PUT",
      body: JSON.stringify({
        ...contactToForm(contact),
        googleMapEmbedUrl: form.googleMapEmbedUrl,
        streetViewEmbedUrl: form.streetViewEmbedUrl,
      }),
    });
  }, "Footer saved");

  return (
    <section className="editor glass-panel single">
      <h2>Footer Management</h2>
      <Input label="Brand name" value={form.brandName} onChange={(brandName) => setForm({ ...form, brandName })} />
      <Textarea label="Description" value={form.description} onChange={(description) => setForm({ ...form, description })} />
      <div className="two-col">
        <Textarea label="Footer links, one per line" value={form.quickLinks} onChange={(quickLinks) => setForm({ ...form, quickLinks })} />
        <Textarea label="Service links, one per line" value={form.serviceLinks} onChange={(serviceLinks) => setForm({ ...form, serviceLinks })} />
      </div>
      <div className="two-col">
        <Input label="Google Map iframe URL" value={form.googleMapEmbedUrl} onChange={(googleMapEmbedUrl) => setForm({ ...form, googleMapEmbedUrl })} />
        <Input label="Street View iframe URL" value={form.streetViewEmbedUrl} onChange={(streetViewEmbedUrl) => setForm({ ...form, streetViewEmbedUrl })} />
      </div>
      <RepeatableRows
        title="Social Media Links"
        items={form.socialLinks}
        emptyItem={{ title: "", url: "", iconName: "Youtube" }}
        onChange={(socialLinks) => setForm({ ...form, socialLinks })}
        getItemTitle={(item) => item.title || "Social media link"}
        getItemMeta={(item) => item.url || "External link opens in a new tab"}
        renderItem={(item, update) => (
          <>
            <div className="three-col">
              <Input label="Link title" value={item.title} onChange={(title) => update({ title })} />
              <Select label="Icon" value={item.iconName || item.platform || "Website"} onChange={(iconName) => update({ iconName })} options={socialIconOptions} />
              <Input label="External URL" value={item.url} onChange={(url) => update({ url })} />
            </div>
          </>
        )}
      />
      <div className="two-col">
        <Input label="Copyright text" value={form.copyrightPrefix} onChange={(copyrightPrefix) => setForm({ ...form, copyrightPrefix })} />
        <Input label="Credit text" value={form.creditText} onChange={(creditText) => setForm({ ...form, creditText })} />
      </div>
      <button className="primary-button" disabled={busy} onClick={save}>Save Footer</button>
    </section>
  );
}

function ProjectPartsManager({ parts, runAction, busy }) {
  const empty = {
    name: "",
    slug: "",
    category: "Components",
    shortDescription: "",
    description: "",
    price: "",
    stock: 1,
    availability: "In Stock",
    imageUrl: "",
    tags: "",
    isActive: true,
    isFeatured: false,
    displayOrder: 0,
  };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");
  const [openId, setOpenId] = useState("");
  const batch = useBatchSelection(parts);

  const reset = () => {
    setEditingId("");
    setForm(empty);
  };

  const edit = (part) => {
    setEditingId(part._id || part.id);
    setForm({
      name: part.name || "",
      slug: part.slug || "",
      category: part.category || "Components",
      shortDescription: part.shortDescription || "",
      description: part.description || "",
      price: part.price ?? "",
      stock: clampAdminQuantity(part.stock ?? 1),
      availability: part.availability || "In Stock",
      imageUrl: part.imageUrl || "",
      tags: arrayToLines(part.tags),
      isActive: part.isActive !== false,
      isFeatured: Boolean(part.isFeatured),
      displayOrder: part.displayOrder || 0,
    });
  };

  const save = () => runAction(async () => {
    const payload = {
      ...form,
      price: form.price === "" ? null : Number(form.price),
      stock: clampAdminQuantity(form.stock),
      displayOrder: Number(form.displayOrder || 0),
      tags: linesToArray(form.tags),
    };
    await apiFetch(editingId ? `/project-parts/admin/project-parts/${editingId}` : "/project-parts/admin/project-parts", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    reset();
  }, editingId ? "Science project part updated" : "Science project part added");

  const remove = (part) => runAction(async () => {
    if (!window.confirm(`Delete ${part.name}?`)) return;
    await apiFetch(`/project-parts/admin/project-parts/${part._id || part.id}`, { method: "DELETE" });
  }, "Science project part deleted");

  const deleteSelected = () => runAction(async () => {
    if (!batch.selectedIds.length) return false;
    if (!window.confirm(`Delete ${batch.selectedIds.length} science project part${batch.selectedIds.length > 1 ? "s" : ""}?`)) return false;
    await Promise.all(batch.selectedIds.map((id) => apiFetch(`/project-parts/admin/project-parts/${id}`, { method: "DELETE" })));
    if (batch.selectedSet.has(editingId)) reset();
    if (batch.selectedSet.has(openId)) setOpenId("");
    batch.clearSelection();
  }, "Science project parts deleted");

  return (
    <div className="manager-grid">
      <section className="editor glass-panel">
        <h2>{editingId ? "Edit Component" : "Add Component"}</h2>
        <p className="muted">Manage electronics parts shown on the public Science Projects Parts page.</p>
        <div className="two-col">
          <Input label="Product Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Input label="Slug (optional)" value={form.slug} onChange={(slug) => setForm({ ...form, slug })} />
        </div>
        <div className="three-col">
          <Input label="Category" value={form.category} onChange={(category) => setForm({ ...form, category })} />
          <Input label="Price" type="number" value={form.price} onChange={(price) => setForm({ ...form, price })} />
          <QuantityControl label="Quantity" value={form.stock} onChange={(stock) => setForm({ ...form, stock })} />
        </div>
        <Textarea label="Short Description" value={form.shortDescription} onChange={(shortDescription) => setForm({ ...form, shortDescription })} />
        <Textarea label="Full Description" value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <ImageField value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
        <div className="three-col">
          <Select
            label="Availability"
            value={form.availability}
            onChange={(availability) => setForm({ ...form, availability })}
            dropUp
            options={[
              { value: "In Stock", label: "In Stock" },
              { value: "Low Stock", label: "Low Stock" },
              { value: "Not Available", label: "Not Available" },
            ]}
          />
          <Input label="Display Order" type="number" value={form.displayOrder} onChange={(displayOrder) => setForm({ ...form, displayOrder })} />
          <Textarea label="Tags (comma or line separated)" rows={2} value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
        </div>
        <div className="two-col">
          <Toggle label="Active on public page" checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} />
          <Toggle label="Featured item" checked={form.isFeatured} onChange={(isFeatured) => setForm({ ...form, isFeatured })} />
        </div>
        <div className="button-row">
          <button className="primary-button" disabled={busy || !form.name} onClick={save}>
            {busy ? "Saving..." : editingId ? "Update Component" : "Add Component"}
          </button>
          {editingId && <button className="ghost-button" type="button" onClick={reset}>Cancel</button>}
        </div>
      </section>

      <section className="list-panel glass-panel">
        <h2>Science Project Parts</h2>
        {!parts.length && <p className="muted">No components added yet.</p>}
        <BatchToolbar
          total={parts.length}
          selectedCount={batch.selectedCount}
          allSelected={batch.allSelected}
          isIndeterminate={batch.isIndeterminate}
          onSelectAll={batch.selectAll}
          onClear={batch.clearSelection}
          onDelete={deleteSelected}
          disabled={busy}
          noun="science project parts"
        />
        {parts.map((part) => (
          <AccordionCard
            key={part._id || part.id}
            id={part._id || part.id}
            openId={openId}
            onToggle={setOpenId}
            imageUrl={part.imageUrl}
            title={part.name}
            meta={`${part.category || "Components"} - ${part.availability || "Available"}`}
            status={part.isActive ? "Active" : "Hidden"}
            selectable
            checked={batch.selectedSet.has(part._id || part.id)}
            selected={batch.selectedSet.has(part._id || part.id)}
            selectLabel={`Select ${part.name || "component"}`}
            onSelect={(checked) => batch.toggleOne(part._id || part.id, checked)}
            disabled={busy}
          >
            <Detail label="Price" value={part.price === null || part.price === undefined ? "Not set" : `Rs. ${Number(part.price).toLocaleString("en-IN")}`} />
            <Detail label="Quantity" value={part.stock ?? 1} />
            <p className="muted">{part.shortDescription || part.description || "No description."}</p>
            <div className="button-row">
              <button type="button" onClick={() => edit(part)}>Edit</button>
              <button className="danger" type="button" onClick={() => remove(part)}>Delete</button>
            </div>
          </AccordionCard>
        ))}
      </section>
    </div>
  );
}

function ShopProductsManager({ products, runAction, busy }) {
  const empty = {
    name: "",
    slug: "",
    category: "Electronics",
    shortDescription: "",
    description: "",
    price: "",
    quantity: 1,
    availability: "In Stock",
    imageUrl: "",
    tags: "",
    specifications: "",
    isActive: true,
    displayOrder: 0,
  };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");
  const [openId, setOpenId] = useState("");
  const batch = useBatchSelection(products);

  const reset = () => {
    setEditingId("");
    setForm(empty);
  };

  const edit = (product) => {
    setEditingId(product._id || product.id);
    setOpenId(product._id || product.id);
    setForm({
      name: product.name || "",
      slug: product.slug || "",
      category: product.category || "Electronics",
      shortDescription: product.shortDescription || "",
      description: product.description || "",
      price: product.price ?? "",
      quantity: clampAdminQuantity(product.quantity ?? 1),
      availability: product.availability || "In Stock",
      imageUrl: product.imageUrl || "",
      tags: arrayToLines(product.tags),
      specifications: Array.isArray(product.specifications)
        ? product.specifications.map((item) => `${item.label || ""}: ${item.value || ""}`).join("\n")
        : "",
      isActive: product.isActive !== false,
      displayOrder: product.displayOrder || 0,
    });
  };

  const save = () => runAction(async () => {
    const specifications = linesToArray(form.specifications).map((line) => {
      const [label, ...rest] = line.split(":");
      return { label: label.trim(), value: rest.join(":").trim() };
    }).filter((item) => item.label || item.value);

    const payload = {
      ...form,
      price: form.price === "" ? null : Number(form.price),
      quantity: clampAdminQuantity(form.quantity),
      displayOrder: Number(form.displayOrder || 0),
      tags: linesToArray(form.tags),
      specifications,
    };
    await apiFetch(editingId ? `/shop-products/admin/products/${editingId}` : "/shop-products/admin/products", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    reset();
  }, editingId ? "Shop product updated" : "Shop product added");

  const remove = (product) => runAction(async () => {
    if (!window.confirm(`Delete ${product.name}?`)) return;
    await apiFetch(`/shop-products/admin/products/${product._id || product.id}`, { method: "DELETE" });
  }, "Shop product deleted");

  const deleteSelected = () => runAction(async () => {
    if (!batch.selectedIds.length) return false;
    if (!window.confirm(`Delete ${batch.selectedIds.length} shop product${batch.selectedIds.length > 1 ? "s" : ""}?`)) return false;
    await Promise.all(batch.selectedIds.map((id) => apiFetch(`/shop-products/admin/products/${id}`, { method: "DELETE" })));
    if (batch.selectedSet.has(editingId)) reset();
    if (batch.selectedSet.has(openId)) setOpenId("");
    batch.clearSelection();
  }, "Shop products deleted");

  return (
    <div className="manager-grid">
      <section className="editor glass-panel">
        <h2>{editingId ? "Edit Shop Product" : "Add Shop Product"}</h2>
        <p className="muted">Manage products shown on the public /products page. Categories are dynamic from this field.</p>
        <div className="two-col">
          <Input label="Product Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Input label="Slug (optional)" value={form.slug} onChange={(slug) => setForm({ ...form, slug })} />
        </div>
        <div className="three-col">
          <Input label="Category" value={form.category} onChange={(category) => setForm({ ...form, category })} />
          <Input label="Price" type="number" value={form.price} onChange={(price) => setForm({ ...form, price })} />
          <QuantityControl label="Quantity" value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity })} />
        </div>
        <div className="two-col">
          <Select
            label="Availability"
            value={form.availability}
            onChange={(availability) => setForm({ ...form, availability })}
            options={[
              { value: "In Stock", label: "In Stock" },
              { value: "Low Stock", label: "Low Stock" },
              { value: "Not Available", label: "Not Available" },
            ]}
          />
          <Input label="Display Order" type="number" value={form.displayOrder} onChange={(displayOrder) => setForm({ ...form, displayOrder })} />
        </div>
        <Textarea label="Short Description" value={form.shortDescription} onChange={(shortDescription) => setForm({ ...form, shortDescription })} />
        <Textarea label="Full Description" value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <ImageField value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
        <div className="two-col">
          <Textarea label="Tags / Keywords (comma or line separated)" rows={3} value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
          <Textarea label="Specifications (Label: Value per line)" rows={3} value={form.specifications} onChange={(specifications) => setForm({ ...form, specifications })} />
        </div>
        <div className="two-col">
          <Toggle label="Active on public page" checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} />
        </div>
        <div className="button-row">
          <button className="primary-button" disabled={busy || !form.name} onClick={save}>
            {busy ? "Saving..." : editingId ? "Update Product" : "Add Product"}
          </button>
          {editingId && <button className="ghost-button" type="button" onClick={reset}>Cancel</button>}
        </div>
      </section>

      <section className="list-panel glass-panel">
        <h2>Shop Products</h2>
        {!products.length && <p className="muted">No shop products added yet.</p>}
        <BatchToolbar
          total={products.length}
          selectedCount={batch.selectedCount}
          allSelected={batch.allSelected}
          isIndeterminate={batch.isIndeterminate}
          onSelectAll={batch.selectAll}
          onClear={batch.clearSelection}
          onDelete={deleteSelected}
          disabled={busy}
          noun="shop products"
        />
        {products.map((product) => (
          <AccordionCard
            key={product._id || product.id}
            id={product._id || product.id}
            openId={openId}
            onToggle={setOpenId}
            imageUrl={product.imageUrl}
            title={product.name}
            meta={`${product.category || "Electronics"} - ${product.availability || "Available"}`}
            status={product.isActive ? "Active" : "Hidden"}
            selectable
            checked={batch.selectedSet.has(product._id || product.id)}
            selected={batch.selectedSet.has(product._id || product.id)}
            selectLabel={`Select ${product.name || "shop product"}`}
            onSelect={(checked) => batch.toggleOne(product._id || product.id, checked)}
            disabled={busy}
          >
            <Detail label="Price" value={product.price === null || product.price === undefined ? "Not set" : `Rs. ${Number(product.price).toLocaleString("en-IN")}`} />
            <Detail label="Quantity" value={product.quantity ?? 1} />
            <p className="muted">{product.shortDescription || product.description || "No description."}</p>
            <div className="button-row">
              <button type="button" onClick={() => edit(product)}>Edit</button>
              <button className="danger" type="button" onClick={() => remove(product)}>Delete</button>
            </div>
          </AccordionCard>
        ))}
      </section>
    </div>
  );
}

function ProjectSlidersManager({ sliders, runAction, busy }) {
  const empty = {
    imageUrl: "",
    title: "",
    description: "",
    displayOrder: 0,
    isActive: true,
  };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");
  const [openId, setOpenId] = useState("");
  const batch = useBatchSelection(sliders);

  const reset = () => {
    setEditingId("");
    setForm(empty);
  };

  const edit = (slider) => {
    setEditingId(slider._id || slider.id);
    setForm({
      imageUrl: slider.imageUrl || "",
      title: slider.title || "",
      description: slider.description || "",
      displayOrder: slider.displayOrder || 0,
      isActive: slider.isActive !== false,
    });
  };

  const save = () => runAction(async () => {
    const payload = { ...form, displayOrder: Number(form.displayOrder || 0) };
    await apiFetch(editingId ? `/project-parts/admin/project-part-sliders/${editingId}` : "/project-parts/admin/project-part-sliders", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    reset();
  }, editingId ? "Project parts slider updated" : "Project parts slider added");

  const remove = (slider) => runAction(async () => {
    if (!window.confirm(`Delete slider ${slider.title}?`)) return;
    await apiFetch(`/project-parts/admin/project-part-sliders/${slider._id || slider.id}`, { method: "DELETE" });
  }, "Project parts slider deleted");

  const deleteSelected = () => runAction(async () => {
    if (!batch.selectedIds.length) return false;
    if (!window.confirm(`Delete ${batch.selectedIds.length} project slider${batch.selectedIds.length > 1 ? "s" : ""}?`)) return false;
    await Promise.all(batch.selectedIds.map((id) => apiFetch(`/project-parts/admin/project-part-sliders/${id}`, { method: "DELETE" })));
    if (batch.selectedSet.has(editingId)) reset();
    if (batch.selectedSet.has(openId)) setOpenId("");
    batch.clearSelection();
  }, "Project parts sliders deleted");

  return (
    <div className="manager-grid">
      <section className="editor glass-panel">
        <h2>{editingId ? "Edit Slider Image" : "Add Slider Image"}</h2>
        <p className="muted">These banners render dynamically on the public /projects-parts carousel.</p>
        <ImageField value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
        <Input label="Slider Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
        <Textarea label="Short Description" value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <div className="two-col">
          <Input label="Display Order" type="number" value={form.displayOrder} onChange={(displayOrder) => setForm({ ...form, displayOrder })} />
          <Toggle label="Active on public page" checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} />
        </div>
        <div className="button-row">
          <button className="primary-button" disabled={busy || !form.title || !form.imageUrl} onClick={save}>
            {busy ? "Saving..." : editingId ? "Update Slider" : "Add Slider"}
          </button>
          {editingId && <button className="ghost-button" type="button" onClick={reset}>Cancel</button>}
        </div>
      </section>

      <section className="list-panel glass-panel">
        <h2>Projects Parts Slider</h2>
        {form.imageUrl && (
          <div className="accordion-card open">
            <div className="accordion-body">
              <p className="muted">Realtime preview</p>
              <img className="preview wide" src={form.imageUrl} alt={form.title || "Slider preview"} />
              <h3>{form.title || "Slider title"}</h3>
              <p>{form.description || "Short description"}</p>
            </div>
          </div>
        )}
        {!sliders.length && <p className="muted">No slider images added yet.</p>}
        <BatchToolbar
          total={sliders.length}
          selectedCount={batch.selectedCount}
          allSelected={batch.allSelected}
          isIndeterminate={batch.isIndeterminate}
          onSelectAll={batch.selectAll}
          onClear={batch.clearSelection}
          onDelete={deleteSelected}
          disabled={busy}
          noun="project sliders"
        />
        {sliders.map((slider) => (
          <AccordionCard
            key={slider._id || slider.id}
            id={slider._id || slider.id}
            openId={openId}
            onToggle={setOpenId}
            imageUrl={slider.imageUrl}
            title={slider.title}
            meta={`Display order ${slider.displayOrder || 0}`}
            status={slider.isActive ? "Active" : "Hidden"}
            selectable
            checked={batch.selectedSet.has(slider._id || slider.id)}
            selected={batch.selectedSet.has(slider._id || slider.id)}
            selectLabel={`Select ${slider.title || "project slider"}`}
            onSelect={(checked) => batch.toggleOne(slider._id || slider.id, checked)}
            disabled={busy}
          >
            <p className="muted">{slider.description || "No description."}</p>
            <div className="button-row">
              <button type="button" onClick={() => edit(slider)}>Edit</button>
              <button className="danger" type="button" onClick={() => remove(slider)}>Delete</button>
            </div>
          </AccordionCard>
        ))}
      </section>
    </div>
  );
}

function WebSettingsManager({ settings, runAction, busy }) {
  const publishSettingsUpdate = (nextSettings) => {
    applyDynamicWebSettings(nextSettings);
    localStorage.setItem("prakash:web-settings-updated", String(Date.now()));
  };

  const uploadAsset = (type, file) => runAction(async () => {
    if (!file) throw new Error("Select an image first");
    const formData = new FormData();
    formData.append("image", file);
    const response = await apiFetch(`/admin/web-settings/${type}`, { method: "POST", body: formData });
    publishSettingsUpdate(response.data);
  }, type === "og-image" ? "OG image processed and published" : "Favicon set processed and published");

  const deleteAsset = (type) => runAction(async () => {
    const label = type === "og-image" ? "OG image" : "favicon";
    if (!window.confirm(`Delete current ${label}?`)) return;
    const response = await apiFetch(`/admin/web-settings/${type}`, { method: "DELETE" });
    publishSettingsUpdate(response.data);
  }, type === "og-image" ? "OG image removed" : "Favicon removed");

  const ogImage = settings?.ogImage || {};
  const favicon = settings?.favicon || {};
  const appleTouchIcon = settings?.appleTouchIcon || {};
  const faviconSizes = settings?.faviconSizes || [];

  return (
    <div className="web-settings-grid">
      <section className="editor glass-panel web-settings-hero">
        <p className="eyebrow">Dynamic website branding</p>
        <h2>Web Settings</h2>
        <p className="muted">
          Uploads are processed on the server before Cloudinary storage. Public pages read these values from the database and update meta tags and icons automatically.
        </p>
      </section>

      <AssetUploadCard
        title="Website OG Image"
        description="Used by Facebook, WhatsApp, LinkedIn, Twitter/X, and other social previews."
        recommended="Recommended final size: 1200 x 630 px"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        current={ogImage}
        previewClassName="web-og-preview"
        onUpload={(file) => uploadAsset("og-image", file)}
        onDelete={() => deleteAsset("og-image")}
        busy={busy}
      />

      <AssetUploadCard
        title="Website Icon / Favicon"
        description="Supports PNG, ICO, and SVG uploads. The server generates browser-friendly PNG favicon sizes."
        recommended="Generated sizes: 16x16, 32x32, 48x48, 180x180 Apple touch icon"
        accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
        current={favicon}
        secondary={appleTouchIcon}
        previewClassName="web-icon-preview"
        onUpload={(file) => uploadAsset("favicon", file)}
        onDelete={() => deleteAsset("favicon")}
        busy={busy}
      />

      <section className="list-panel glass-panel web-settings-details">
        <h2>Processed Favicon Set</h2>
        {!faviconSizes.length && <p className="muted">No favicon sizes generated yet.</p>}
        <div className="favicon-size-grid">
          {faviconSizes.map((asset) => (
            <div className="favicon-size-card" key={`${asset.width}-${asset.publicId}`}>
              {asset.url && <img src={asset.url} alt={`${asset.width} by ${asset.height} favicon`} />}
              <strong>{asset.width} x {asset.height}</strong>
              <span>{asset.format?.toUpperCase() || "PNG"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AssetUploadCard({
  title,
  description,
  recommended,
  accept,
  current,
  secondary,
  previewClassName,
  onUpload,
  onDelete,
  busy,
}) {
  const [file, setFile] = useState(null);
  const [localPreview, setLocalPreview] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const chooseFile = (selectedFile) => {
    if (!selectedFile) return;
    const validation = isValidAdminImage(selectedFile, accept);
    if (!validation.valid) {
      setUploadError(validation.message);
      return;
    }
    setUploadError("");
    if (localPreview) URL.revokeObjectURL(localPreview);
    setFile(selectedFile);
    setLocalPreview(URL.createObjectURL(selectedFile));
  };

  const submit = async () => {
    if (!file) {
      setUploadError("Select an image first");
      return;
    }
    await onUpload(file);
    setFile(null);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview("");
  };

  const activePreview = localPreview || current?.url || "";

  return (
    <section className="editor glass-panel web-upload-card">
      <div className="web-upload-head">
        <div>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
        <span>{recommended}</span>
      </div>

      <div
        className={`web-upload-drop ${dragActive ? "drag-active" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          chooseFile(event.dataTransfer.files?.[0]);
        }}
      >
        <input id={`upload-${title}`} type="file" accept={accept} onChange={(event) => chooseFile(event.target.files?.[0])} />
        <label htmlFor={`upload-${title}`}>
          <UploadCloud size={24} />
          <strong>{file ? file.name : dragActive ? "Drop image here" : "Choose image"}</strong>
          <small>{file ? "Preview ready. Save to process and publish." : "Drag an image here or click to browse"}</small>
        </label>
      </div>
      {uploadError && <span className="field-error">{uploadError}</span>}

      <div className="web-preview-grid">
        <div className="web-preview-panel">
          <span>{localPreview ? "Before processing" : "Current preview"}</span>
          {activePreview ? (
            <img className={previewClassName} src={activePreview} alt={`${title} preview`} />
          ) : (
            <div className={`${previewClassName} empty-preview`}>No image</div>
          )}
        </div>
        <div className="web-preview-panel">
          <span>Published processed asset</span>
          {current?.url ? (
            <>
              <img className={previewClassName} src={current.url} alt={`${title} processed preview`} />
              <div className="asset-meta">
                <strong>{current.width || "-"} x {current.height || "-"}</strong>
                <small>{current.format?.toUpperCase() || "IMAGE"} {current.bytes ? `${Math.round(current.bytes / 1024)} KB` : ""}</small>
              </div>
            </>
          ) : (
            <div className={`${previewClassName} empty-preview`}>Not published</div>
          )}
          {secondary?.url && (
            <small className="muted">Apple touch icon: {secondary.width} x {secondary.height}</small>
          )}
        </div>
      </div>

      <div className="button-row">
        <button className="primary-button" type="button" disabled={busy || !file} onClick={submit}>
          {busy ? "Processing..." : "Save Processed Image"}
        </button>
        <button className="ghost-button" type="button" disabled={busy || !current?.url} onClick={onDelete}>
          Delete / Change
        </button>
      </div>
    </section>
  );
}

function Detail({ label, value }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDateTime(value, long = false) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-IN", {
    weekday: long ? "long" : undefined,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function emailStatusLabel(status) {
  if (status === "sent") return "Email sent";
  if (status === "partial") return "Partially sent";
  if (status === "failed") return "Email failed";
  if (status === "retrying") return "Retrying";
  if (status === "queued") return "Queued";
  if (status === "not_configured") return "Email not configured";
  if (status === "pending") return "Email pending";
  return "Email pending";
}

function emailStatusClass(status) {
  if (status === "sent") return "repaired";
  if (status === "partial") return "warning";
  if (status === "failed") return "failed";
  if (status === "retrying" || status === "queued") return "warning";
  if (status === "not_configured") return "warning";
  return "";
}

function customerEmailStatusLabel(status) {
  if (status === "sent") return "Email sent";
  if (status === "failed") return "Email failed";
  if (status === "not_configured") return "Email not configured";
  if (status === "not_requested") return "Not requested";
  return "Not sent";
}

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// eslint-disable-next-line no-unused-vars
function ContentManager({ content, runAction, busy }) {
  const contentMap = useMemo(
    () => Object.fromEntries(content.map((doc) => [doc.key, doc.value])),
    [content],
  );
  const [key, setKey] = useState("gallery");
  const [form, setForm] = useState(() => contentToForm("gallery", contentMap.gallery));

  useEffect(() => {
    setForm(contentToForm(key, contentMap[key]));
  }, [contentMap, key]);

  const save = () => runAction(async () => {
    await apiFetch(`/admin/site-content/${key}`, {
      method: "PUT",
      body: JSON.stringify({ value: formToContent(key, form) }),
    });
  }, "Content saved");

  return (
    <section className="editor glass-panel single">
      <h2>Content Studio</h2>
      <p className="muted">Select a section and update its fields.</p>
      <div className="content-tabs">
        {contentKeys.map((item) => (
          <button key={item} className={key === item ? "active" : ""} onClick={() => setKey(item)}>
            {item}
          </button>
        ))}
      </div>
      <ContentSectionForm sectionKey={key} form={form} setForm={setForm} />
      <button className="primary-button" disabled={busy} onClick={save}>Save Content</button>
    </section>
  );
}

function ContentSectionForm({ sectionKey, form, setForm }) {
  if (sectionKey === "navbar") {
    return (
      <>
        <div className="two-col">
          <Input label="Brand name" value={form.brandName} onChange={(brandName) => setForm({ ...form, brandName })} />
          <Input label="CTA label" value={form.ctaLabel} onChange={(ctaLabel) => setForm({ ...form, ctaLabel })} />
        </div>
        <RepeatableRows
          title="Navigation Links"
          items={form.links}
          emptyItem={{ href: "#", label: "" }}
          onChange={(links) => setForm({ ...form, links })}
          renderItem={(link, update) => (
            <div className="two-col">
              <Input label="Label" value={link.label} onChange={(label) => update({ label })} />
              <Input label="Link" value={link.href} onChange={(href) => update({ href })} />
            </div>
          )}
        />
      </>
    );
  }

  if (["servicesSection", "testimonials", "gallery", "about", "contactSection", "featuredCarousel"].includes(sectionKey)) {
    return (
      <>
        <SectionHeadingFields form={form} setForm={setForm} includeDescription={!["testimonials", "gallery", "featuredCarousel"].includes(sectionKey)} />
        {sectionKey === "testimonials" && (
          <RepeatableRows
            title="Testimonials"
            items={form.items}
            emptyItem={{ name: "", role: "", rating: 5, text: "", avatar: "" }}
            onChange={(items) => setForm({ ...form, items })}
            renderItem={(item, update) => (
              <>
                <div className="three-col">
                  <Input label="Name" value={item.name} onChange={(name) => update({ name })} />
                  <Input label="Role / Place" value={item.role} onChange={(role) => update({ role })} />
                  <Input label="Rating" type="number" value={item.rating} onChange={(rating) => update({ rating })} />
                </div>
                <Textarea label="Review text" value={item.text} onChange={(text) => update({ text })} />
                <Input label="Avatar initials" value={item.avatar} onChange={(avatar) => update({ avatar })} />
              </>
            )}
          />
        )}
        {sectionKey === "gallery" && (
          <RepeatableRows
            title="Gallery Items"
            items={form.items}
            emptyItem={{ imageUrl: "", label: "", caption: "", span: "" }}
            onChange={(items) => setForm({ ...form, items })}
            renderItem={(item, update) => (
              <>
                <div className="two-col">
                  <Input label="Label" value={item.label} onChange={(label) => update({ label })} />
                  <Select
                    label="Layout size"
                    value={item.span}
                    onChange={(span) => update({ span })}
                    options={[
                      { value: "", label: "Normal" },
                      { value: "md:col-span-2", label: "Wide" },
                      { value: "md:row-span-2", label: "Tall" },
                      { value: "md:col-span-2 md:row-span-2", label: "Large" },
                      { value: "md:col-span-3", label: "Extra wide" },
                    ]}
                  />
                </div>
                <ImageField value={item.imageUrl || item.src} onChange={(imageUrl) => update({ imageUrl })} />
                <Textarea label="Caption" value={item.caption} onChange={(caption) => update({ caption })} />
              </>
            )}
          />
        )}
        {sectionKey === "about" && (
          <RepeatableRows
            title="About Reasons"
            items={form.reasons}
            emptyItem={{ iconName: "ShieldCheck", title: "", desc: "" }}
            onChange={(reasons) => setForm({ ...form, reasons })}
            renderItem={(reason, update) => (
              <>
                <div className="two-col">
                  <IconPickerInput label="Icon" value={reason.iconName} onChange={(iconName) => update({ iconName })} />
                  <Input label="Title" value={reason.title} onChange={(title) => update({ title })} />
                </div>
                <Textarea label="Description" value={reason.desc} onChange={(desc) => update({ desc })} />
              </>
            )}
          />
        )}
        {sectionKey === "contactSection" && (
          <Input label="Submit button label" value={form.submitLabel} onChange={(submitLabel) => setForm({ ...form, submitLabel })} />
        )}
      </>
    );
  }

  if (sectionKey === "stats") {
    return (
      <RepeatableRows
        title="Stats"
        items={form.items}
        emptyItem={{ value: 0, label: "", suffix: "+" }}
        onChange={(items) => setForm({ ...form, items })}
        renderItem={(item, update) => (
          <div className="three-col">
            <Input label="Value" type="number" value={item.value} onChange={(value) => update({ value })} />
            <Input label="Label" value={item.label} onChange={(label) => update({ label })} />
            <Input label="Suffix" value={item.suffix} onChange={(suffix) => update({ suffix })} />
          </div>
        )}
      />
    );
  }

  if (sectionKey === "footer") {
    return (
      <>
        <Input label="Brand name" value={form.brandName} onChange={(brandName) => setForm({ ...form, brandName })} />
        <Textarea label="Description" value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <Textarea label="Quick links, one per line" value={form.quickLinks} onChange={(quickLinks) => setForm({ ...form, quickLinks })} />
        <Textarea label="Service links, one per line" value={form.serviceLinks} onChange={(serviceLinks) => setForm({ ...form, serviceLinks })} />
        <div className="two-col">
          <Input label="Copyright text" value={form.copyrightPrefix} onChange={(copyrightPrefix) => setForm({ ...form, copyrightPrefix })} />
          <Input label="Credit text" value={form.creditText} onChange={(creditText) => setForm({ ...form, creditText })} />
        </div>
      </>
    );
  }

  return null;
}

function SectionHeadingFields({ form, setForm, includeDescription = true }) {
  return (
    <>
      <div className="three-col">
        <Input label="Eyebrow" value={form.eyebrow} onChange={(eyebrow) => setForm({ ...form, eyebrow })} />
        <Input label="Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
        <Input label="Highlight" value={form.highlight} onChange={(highlight) => setForm({ ...form, highlight })} />
      </div>
      {includeDescription && (
        <Textarea label="Description" value={form.description} onChange={(description) => setForm({ ...form, description })} />
      )}
    </>
  );
}

function contentToForm(key, value = {}) {
  if (key === "footer") {
    return {
      ...value,
      quickLinks: arrayToLines(value.quickLinks),
      serviceLinks: arrayToLines(value.serviceLinks),
      socialLinks: value.socialLinks || [],
    };
  }
  if (key === "testimonials") {
    return {
      ...value,
      items: (value.items || []).map((item) => ({
        ...item,
        text: item.text || item.quote || item.review || "",
        imageUrl: item.imageUrl || item.photoUrl || item.url || "",
        avatar: item.avatar || String(item.name || "")
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
      })),
    };
  }
  return {
    ...value,
    links: value.links || [],
    items: value.items || [],
    reasons: value.reasons || [],
  };
}

function formToContent(key, form) {
  if (key === "footer") {
    return {
      ...form,
      quickLinks: linesToArray(form.quickLinks),
      serviceLinks: linesToArray(form.serviceLinks),
      socialLinks: (form.socialLinks || [])
        .filter((item) => item.title || item.url)
        .map((item) => ({
          title: item.title || "",
          url: item.url || "",
          iconName: item.iconName || item.platform || "Website",
        })),
    };
  }

  if (key === "stats") {
    return {
      items: (form.items || [])
        .filter((item) => item.label || item.value)
        .map((item) => ({ ...item, value: Number(item.value || 0) })),
    };
  }

  if (key === "testimonials") {
    return {
      eyebrow: form.eyebrow || "",
      title: form.title || "",
      highlight: form.highlight || "",
      items: (form.items || [])
        .filter((item) => item.name || item.text || item.quote || item.review)
        .map((item) => {
          const text = item.text || item.quote || item.review || "";
          const imageUrl = item.imageUrl || item.photoUrl || item.url || "";
          return {
            ...item,
            text,
            quote: text,
            review: text,
            imageUrl,
            photoUrl: imageUrl,
            rating: Number(item.rating || 5),
          };
        }),
    };
  }

  if (key === "gallery") {
    return {
      eyebrow: form.eyebrow || "",
      title: form.title || "",
      highlight: form.highlight || "",
      items: (form.items || []).filter((item) => item.imageUrl || item.src || item.label),
    };
  }

  if (key === "about") {
    return {
      eyebrow: form.eyebrow || "",
      title: form.title || "",
      highlight: form.highlight || "",
      description: form.description || "",
      reasons: (form.reasons || []).filter((item) => item.title || item.desc),
    };
  }

  if (key === "navbar") {
    return {
      brandName: form.brandName || "",
      ctaLabel: form.ctaLabel || "",
      links: (form.links || []).filter((item) => item.label || item.href),
    };
  }

  return form;
}

function RepeatableRows({ title, items = [], emptyItem, onChange, renderItem, getItemTitle, getItemMeta, enableBatchDelete = false }) {
  const safeItems = Array.isArray(items) ? items : [];
  const [openIndex, setOpenIndex] = useState(null);
  const batch = useBatchSelection(safeItems, (_item, index) => String(index));
  const updateAt = (index, patch) => {
    onChange(safeItems.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };
  const removeAt = (index) => {
    onChange(safeItems.filter((_, itemIndex) => itemIndex !== index));
    setOpenIndex((current) => {
      if (current === index) return null;
      if (current > index) return current - 1;
      return current;
    });
  };
  const add = () => {
    onChange([...safeItems, { ...emptyItem }]);
    setOpenIndex(safeItems.length);
  };
  const deleteSelected = () => {
    if (!batch.selectedIds.length) return;
    if (!window.confirm(`Delete ${batch.selectedIds.length} ${title.toLowerCase()} item${batch.selectedIds.length > 1 ? "s" : ""}?`)) return;
    onChange(safeItems.filter((_, index) => !batch.selectedSet.has(String(index))));
    setOpenIndex(null);
    batch.clearSelection();
  };

  return (
    <div className="repeatable-block">
      <div className="repeatable-head">
        <h3>{title}</h3>
        <button className="ghost-button" type="button" onClick={add}>Add</button>
      </div>
      {safeItems.length === 0 && <p className="muted">No items yet. Click Add to create one.</p>}
      {enableBatchDelete && (
        <BatchToolbar
          total={safeItems.length}
          selectedCount={batch.selectedCount}
          allSelected={batch.allSelected}
          isIndeterminate={batch.isIndeterminate}
          onSelectAll={batch.selectAll}
          onClear={batch.clearSelection}
          onDelete={deleteSelected}
          disabled={false}
          noun={title}
        />
      )}
      {safeItems.map((item, index) => (
        <div className={`repeatable-item ${openIndex === index ? "open" : ""} ${batch.selectedSet.has(String(index)) ? "batch-selected" : ""}`} key={index}>
          <div className={`repeatable-row-top ${enableBatchDelete ? "has-selection" : ""}`}>
            {enableBatchDelete && (
              <span className="batch-row-check" onClick={(event) => event.stopPropagation()}>
                <BatchCheckbox
                  compact
                  label={`Select ${getItemTitle?.(item, index) || item.title || item.label || item.name || `${title} #${index + 1}`}`}
                  checked={batch.selectedSet.has(String(index))}
                  onChange={(checked) => batch.toggleOne(String(index), checked)}
                />
              </span>
            )}
            <button
              className="repeatable-toggle"
              type="button"
              onClick={() => setOpenIndex((current) => (current === index ? null : index))}
              aria-expanded={openIndex === index}
            >
              <span>
                <strong>{getItemTitle?.(item, index) || item.title || item.label || item.name || `${title} #${index + 1}`}</strong>
                <small>{getItemMeta?.(item, index) || item.caption || item.role || item.desc || "Tap to edit details"}</small>
              </span>
              <b>{openIndex === index ? "Hide" : "Open"}</b>
            </button>
          </div>
          <div className="repeatable-item-body">
            <div className="repeatable-item-actions">
              <button className="danger subtle-button" type="button" onClick={() => removeAt(index)}>Delete</button>
            </div>
            {renderItem(item, (patch) => updateAt(index, patch), index)}
          </div>
        </div>
      ))}
    </div>
  );
}

function AccordionCard({
  id,
  openId,
  onToggle,
  imageUrl,
  title,
  meta,
  status,
  children,
  selectable = false,
  checked = false,
  selected = false,
  selectLabel = "Select item",
  onSelect,
  disabled = false,
}) {
  const isOpen = openId === id;
  return (
    <article className={`accordion-card ${isOpen ? "open" : ""} ${selected ? "batch-selected" : ""}`}>
      <div className={`accordion-top ${selectable ? "has-selection" : ""}`}>
        {selectable && (
          <span className="batch-row-check" onClick={(event) => event.stopPropagation()}>
            <BatchCheckbox compact label={selectLabel} checked={checked} onChange={onSelect} disabled={disabled} />
          </span>
        )}
        <button
          className={`accordion-summary ${imageUrl ? "" : "no-image"}`}
          type="button"
          onClick={() => onToggle(isOpen ? "" : id)}
          aria-expanded={isOpen}
        >
          {imageUrl && <img src={imageUrl} alt="" />}
          <span>
            <strong>{title || "Untitled"}</strong>
            <small>{meta || "No details"}</small>
          </span>
          {status && <em>{status}</em>}
          <b>{isOpen ? "Hide" : "Open"}</b>
        </button>
      </div>
      {isOpen && <div className="accordion-body">{children}</div>}
    </article>
  );
}

function ImageField({ value, onChange, label = "Image URL", multiple = false, onMultipleUpload, accept = "image/*" }) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localPreview, setLocalPreview] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [previewHidden, setPreviewHidden] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedPublicId, setUploadedPublicId] = useState("");
  const previewUrlRef = useRef("");

  useEffect(() => {
    setPreviewHidden(false);
    setUploadError("");
  }, [value]);

  useEffect(() => {
    const hidePreview = () => {
      setLocalPreview("");
      setUploadedPublicId("");
      setPreviewHidden(true);
    };
    window.addEventListener("admin-action-saved", hidePreview);
    return () => window.removeEventListener("admin-action-saved", hidePreview);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!uploading) {
      setUploadProgress(0);
      return undefined;
    }
    setUploadProgress(12);
    const timer = window.setInterval(() => {
      setUploadProgress((current) => Math.min(92, current + 12));
    }, 220);
    return () => window.clearInterval(timer);
  }, [uploading]);

  const setPreviewFromFile = (file) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    previewUrlRef.current = objectUrl;
    setLocalPreview(objectUrl);
    setPreviewHidden(false);
  };

  const uploadFiles = async (files) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    setUploadError("");
    const validFiles = selectedFiles.filter((file) => {
      const result = isValidAdminImage(file, accept);
      if (!result.valid) setUploadError(result.message);
      return result.valid;
    });
    if (!validFiles.length) return;

    const filesToUpload = multiple ? validFiles.slice(0, 8) : [validFiles[0]];
    setPreviewFromFile(filesToUpload[0]);
    setUploadedPublicId("");
    setUploading(true);
    try {
      const formData = new FormData();
      if (filesToUpload.length > 1) {
        filesToUpload.forEach((file) => formData.append("images", file));
        const response = await apiFetch("/admin/upload/images", { method: "POST", body: formData, timeout: 45000 });
        const uploaded = response.data || [];
        const first = uploaded[0];
        if (first) {
          onChange(first.url);
          setLocalPreview(first.url);
          setUploadedPublicId(first.publicId || "");
        }
        onMultipleUpload?.(uploaded);
      } else {
        formData.append("image", filesToUpload[0]);
        const response = await apiFetch("/admin/upload/image", { method: "POST", body: formData });
        onChange(response.data.url);
        setLocalPreview(response.data.url);
        setUploadedPublicId(response.data.publicId || "");
        onMultipleUpload?.([response.data]);
      }
      setUploadProgress(100);
      setUploadError("");
    } catch (error) {
      setUploadError(error.message || "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    uploadFiles(event.dataTransfer.files);
  };

  const deletePreview = async () => {
    const imageUrl = value || localPreview;
    if (!imageUrl) return;
    setUploadError("");
    setDeleting(true);
    try {
      if (!String(imageUrl).startsWith("blob:") && !String(imageUrl).startsWith("data:")) {
        await apiFetch("/admin/upload/image", {
          method: "DELETE",
          body: JSON.stringify({ url: imageUrl, publicId: uploadedPublicId }),
        });
      }
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
      }
      setLocalPreview("");
      setUploadedPublicId("");
      setPreviewHidden(true);
      onChange("");
    } catch (error) {
      setUploadError(error.message || "Image delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const previewSrc = previewHidden ? "" : localPreview || value;

  return (
    <div className="field">
      <label>{label}</label>
      <div className="image-field">
        <input value={value || ""} onChange={(event) => onChange(event.target.value)} />
      </div>
      <div
        className={`admin-upload-dropzone ${dragActive ? "drag-active" : ""} ${uploading ? "uploading" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={handleDrop}
      >
        <UploadCloud size={24} />
        <div>
          <strong>{uploading ? "Uploading image..." : dragActive ? "Drop image here" : "Drag & drop image"}</strong>
          <small>{multiple ? "Drop up to 8 images or use the upload button" : "Drop an image or use the upload button"}</small>
        </div>
        <label className="upload-button">
          {uploading ? "Uploading..." : "Upload"}
          <input
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={(event) => {
              uploadFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {uploading && (
        <div className="upload-progress" aria-label={`Upload progress ${uploadProgress}%`}>
          <span style={{ width: `${uploadProgress}%` }} />
        </div>
      )}
      {uploadError && <span className="field-error">{uploadError}</span>}
      {previewSrc && (
        <button className="image-preview-card" type="button" onClick={deletePreview} disabled={deleting || uploading} aria-label="Delete uploaded image">
          <img className="preview" src={previewSrc} alt="" />
          <span className="image-preview-overlay">
            <Trash2 size={18} />
            <b>{deleting ? "Deleting..." : "Delete"}</b>
          </span>
        </button>
      )}
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function IconPickerInput({ label, value, onChange }) {
  const Icon = getIcon(value, ShieldCheck);
  const listId = `admin-icons-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="field icon-picker-field">
      <label>{label}</label>
      <div className="icon-picker-control">
        <span className="icon-picker-preview">
          <Icon size={18} />
        </span>
        <input
          list={listId}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search or select icon"
        />
        <datalist id={listId}>
          {adminIconOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </datalist>
      </div>
    </div>
  );
}

function QuantityControl({ label = "Quantity", value, onChange }) {
  const quantity = clampAdminQuantity(value);
  const updateQuantity = (nextValue) => onChange(clampAdminQuantity(nextValue));

  return (
    <div className="field">
      <label>{label}</label>
      <div className="admin-qty-control">
        <button
          type="button"
          onClick={() => updateQuantity(quantity - 1)}
          disabled={quantity <= MIN_STOCK_QUANTITY}
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <Minus size={15} />
        </button>
        <input
          type="number"
          min={MIN_STOCK_QUANTITY}
          max={MAX_STOCK_QUANTITY}
          value={quantity}
          onChange={(event) => updateQuantity(event.target.value)}
          onBlur={(event) => updateQuantity(event.target.value)}
        />
        <button type="button" onClick={() => updateQuantity(quantity + 1)} aria-label={`Increase ${label.toLowerCase()}`}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options, dropUp = false }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div className="field">
      <label>{label}</label>
      <div className={`glass-select ${open ? "open" : ""} ${dropUp ? "drop-up" : ""}`}>
        <button
          type="button"
          className="glass-select-trigger"
          onClick={() => setOpen((current) => !current)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span>{selected?.label || "Select"}</span>
          <b aria-hidden="true">v</b>
        </button>
        <div className="glass-select-menu" role="listbox">
          <button
            type="button"
            className={!value ? "selected" : ""}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Select
          </button>
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              className={option.value === value ? "selected" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              aria-selected={option.value === value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Textarea({ label, value, onChange, rows = 4 }) {
  return (
    <div className="field">
      <label>{label}</label>
      <textarea rows={rows} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle-line">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export default App;
