import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { apiRequest, clearApiCache } from "../api/client";
import { normalizePublicContact } from "../utils/contactDefaults";

const SiteDataContext = createContext(null);
const SITE_CACHE_TTL = 5 * 60 * 1000;
const FOCUS_REFRESH_INTERVAL = 2 * 60 * 1000;

function setMeta(selector, attr, value) {
  if (!value || typeof document === "undefined") return;
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement("meta");
    if (selector.includes("property=")) {
      tag.setAttribute("property", selector.match(/property="([^"]+)"/)?.[1] || "");
    } else {
      tag.setAttribute("name", selector.match(/name="([^"]+)"/)?.[1] || "");
    }
    document.head.appendChild(tag);
  }
  tag.setAttribute(attr, value);
}

function withCacheBust(href, version) {
  if (!href) return "";
  if (!version) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}v=${encodeURIComponent(version)}`;
}

function replaceLinks(rel, href, extra = {}) {
  if (!href || typeof document === "undefined") return;
  document.head.querySelectorAll(`link[rel="${rel}"]`).forEach((node) => node.remove());
  const link = document.createElement("link");
  link.setAttribute("rel", rel);
  link.setAttribute("href", href);
  Object.entries(extra).forEach(([key, value]) => {
    if (value) link.setAttribute(key, value);
  });
  document.head.appendChild(link);
}

export function applyDynamicWebSettings(webSettings) {
  const version = webSettings?.updatedAt || "";
  const ogUrl = webSettings?.ogImage?.url;
  // Keep route-specific OG images (Pulse AI / Shop / Wiring) from App.updateRouteMeta.
  const hasRouteOgImage = typeof document !== "undefined" && document.documentElement.dataset.routeOgImage === "1";
  if (ogUrl && !hasRouteOgImage) {
    setMeta('meta[property="og:image"]', "content", ogUrl);
    setMeta('meta[property="og:image:secure_url"]', "content", ogUrl);
    setMeta('meta[property="og:image:width"]', "content", String(webSettings.ogImage.width || 1200));
    setMeta('meta[property="og:image:height"]', "content", String(webSettings.ogImage.height || 630));
    setMeta('meta[name="twitter:image"]', "content", ogUrl);
  }

  const faviconUrl = webSettings?.favicon?.url;
  if (faviconUrl) {
    const freshFaviconUrl = withCacheBust(faviconUrl, version);
    replaceLinks("icon", freshFaviconUrl, { type: "image/png", sizes: `${webSettings.favicon.width || 32}x${webSettings.favicon.height || 32}` });
    replaceLinks("shortcut icon", freshFaviconUrl, { type: "image/png" });
  }

  const appleUrl = webSettings?.appleTouchIcon?.url;
  if (appleUrl) {
    replaceLinks("apple-touch-icon", withCacheBust(appleUrl, version), { sizes: `${webSettings.appleTouchIcon.width || 180}x${webSettings.appleTouchIcon.height || 180}` });
  }
}

function siteDataFingerprint(payload) {
  if (!payload || typeof payload !== "object") return "";
  const hero = payload.heroSlider?.length || 0;
  const trending = payload.trendingBanners?.length || 0;
  const products = payload.products?.length || 0;
  const offers = payload.offers?.length || 0;
  const updated = payload.webSettings?.updatedAt || payload.contact?.updatedAt || "";
  return `${updated}|${hero}|${trending}|${products}|${offers}|${payload.content?.updatedAt || ""}`;
}

export function SiteDataProvider({ children }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const dataRef = useRef(null);
  const fingerprintRef = useRef("");
  const lastLoadedAtRef = useRef(0);

  const loadSiteData = useCallback(async (options = {}) => {
    const now = Date.now();
    if (!options.force && lastLoadedAtRef.current && now - lastLoadedAtRef.current < FOCUS_REFRESH_INTERVAL) {
      return;
    }
    setLoading((current) => (dataRef.current ? current : true));
    setError("");
    try {
      if (options.force) clearApiCache("/public/site");
      const response = await apiRequest("/public/site", { cacheTtl: SITE_CACHE_TTL });
      const nextData = response.data;
      const nextFingerprint = siteDataFingerprint(nextData);
      const hadData = Boolean(dataRef.current);

      // Skip state updates when a background refresh returns the same public payload.
      // That avoids remounting homepage sections mid-scroll.
      if (!options.force && hadData && fingerprintRef.current === nextFingerprint) {
        dataRef.current = nextData;
        lastLoadedAtRef.current = Date.now();
        return;
      }

      dataRef.current = nextData;
      fingerprintRef.current = nextFingerprint;
      lastLoadedAtRef.current = Date.now();
      if (options.force || !hadData) {
        setData(nextData);
      } else {
        startTransition(() => setData(nextData));
      }
    } catch (err) {
      setError(err.message || "Unable to load website data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSiteData();
  }, [loadSiteData]);

  useEffect(() => {
    const syncSettings = (event) => {
      if (!event || event.key === "prakash:web-settings-updated") {
        loadSiteData({ force: true });
      }
    };
    const syncOnFocus = () => {
      if (document.visibilityState === "visible") loadSiteData();
    };

    window.addEventListener("storage", syncSettings);
    document.addEventListener("visibilitychange", syncOnFocus);
    return () => {
      window.removeEventListener("storage", syncSettings);
      document.removeEventListener("visibilitychange", syncOnFocus);
    };
  }, [loadSiteData]);

  useEffect(() => {
    applyDynamicWebSettings(data?.webSettings);
  }, [data?.webSettings]);

  const emptyContent = useMemo(() => ({}), []);
  const emptyList = useMemo(() => [], []);

  const value = useMemo(
    () => ({
      data,
      loading,
      error,
      refetch: loadSiteData,
      content: data?.content || emptyContent,
      products: data?.products || emptyList,
      categories: data?.categories || emptyList,
      offers: data?.offers || emptyList,
      contact: normalizePublicContact(data?.contact),
      hero: data?.hero || null,
      heroSlider: data?.heroSlider || emptyList,
      trendingBanners: data?.trendingBanners || emptyList,
      webSettings: data?.webSettings || null,
    }),
    [data, loading, error, loadSiteData, emptyContent, emptyList],
  );

  return <SiteDataContext.Provider value={value}>{children}</SiteDataContext.Provider>;
}

export function useSiteData() {
  const context = useContext(SiteDataContext);
  if (!context) {
    throw new Error("useSiteData must be used inside SiteDataProvider");
  }
  return context;
}
