import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Camera, Check, ChevronLeft, ChevronRight, ImagePlus, Images, Link2, Moon, PackageSearch, PanelLeftClose, PanelLeftOpen, Plus, ShoppingCart, Sun, Trash2, Wrench } from "lucide-react";
import { apiRequest, apiUrl } from "../../api/client";
import { SCIENCE_PROJECTS_CATEGORY, getCartStockLimit, useCart } from "../../context/CartContext";
import { notifyCartResult } from "../../utils/cartToast";
import { couponOrderItems, getAppliedCouponCode } from "../../utils/coupons";
import { formatINR } from "../../utils/productPricing";
import { consumePulseAISearchPrompt, readPulseAISearchPrompt } from "../../utils/pulseAISearchPrompt";
import { getSiteOgImage } from "../../utils/routes";
import { AIChatInput } from "../ui/AIChatInput";
import AITextLoading from "../ui/ai-text-loading";
import { LottieSvgAnimation } from "./LottieSvgAnimation";
import { PulseOrbAnimation } from "./PulseOrbAnimation";
import { OptimizedImage } from "./OptimizedImage";
import cartImage from "../../assets/Cart.webp";

const welcomeMessage = {
  role: "ai",
  text: "Hello, I am Pulse AI — your assistant for Prakash Electronics and Electricals. Ask about products, wiring accessories, RGB lights, home appliance repair, AC/cooler service, bookings, offers, or upload a photo and I will help with clear guidance and matching shop suggestions.",
};

const SCIENCE_AI_SESSIONS_KEY = "prakash:pulse-ai-sessions:v2";
const LEGACY_SCIENCE_AI_SESSION_KEY = "prakash:pulse-ai-session:v1";
const SCIENCE_AI_CUSTOMER_KEY = "prakash:pulse-ai-customer:v1";
const MAX_TEMPORARY_CHAT_SESSIONS = 25;
const MAX_PREVIOUS_CHATS_SUMMARY_LENGTH = 8000;
const REPLY_STATUS = {
  searching: "Searching...",
  working: "Working...",
  thinking: "Thinking...",
  products: "Finding products...",
};

function cleanMemoryText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeConversationMemory(memory = {}) {
  return {
    summary: cleanMemoryText(memory.summary, 3600),
    importantFacts: (Array.isArray(memory.importantFacts) ? memory.importantFacts : [])
      .map((item) => cleanMemoryText(item, 280)).filter(Boolean).slice(0, 16),
    openTopics: (Array.isArray(memory.openTopics) ? memory.openTopics : [])
      .map((item) => cleanMemoryText(item, 280)).filter(Boolean).slice(0, 10),
  };
}

function firstQuestionFromSession(session = {}) {
  return cleanMemoryText(
    (session.messages || []).find((message) => message.role === "user")?.text,
    2000,
  );
}

function sessionSummary(session = {}) {
  const memory = normalizeConversationMemory(session.memory);
  if (memory.summary) return memory.summary;
  const questions = (session.messages || [])
    .filter((message) => message.role === "user" && message.text)
    .map((message) => cleanMemoryText(message.text, 220));
  return questions.length ? `Customer questions: ${questions.join(" | ")}` : "";
}

function buildPreviousChatsSummary(sessions = []) {
  const summaries = [...sessions]
    .filter((item) => firstQuestionFromSession(item))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .map((item) => {
      const memory = normalizeConversationMemory(item.memory);
      return [
        `Chat: ${cleanMemoryText(item.title || "Previous chat", 100)}`,
        `First question: ${firstQuestionFromSession(item)}`,
        `Summary: ${cleanMemoryText(sessionSummary(item), 900)}`,
        memory.importantFacts.length ? `Important facts: ${memory.importantFacts.join("; ")}` : "",
      ].filter(Boolean).join(" | ");
    });
  let result = "";
  for (const summary of summaries) {
    const next = result ? `${result}\n${summary}` : summary;
    if (next.length > MAX_PREVIOUS_CHATS_SUMMARY_LENGTH) break;
    result = next;
  }
  return result;
}

function getPulseAICustomerId() {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(SCIENCE_AI_CUSTOMER_KEY);
    if (existing) return existing;
    const randomPart = typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    const value = `customer-${randomPart}`;
    window.localStorage.setItem(SCIENCE_AI_CUSTOMER_KEY, value);
    return value;
  } catch (_error) {
    return "";
  }
}

function normalizeLinkCards(cards) {
  return (Array.isArray(cards) ? cards : []).reduce((safe, card) => {
    const url = String(card?.url || "").trim();
    let destination;
    try { destination = new URL(url, window.location.origin); } catch (_error) { return safe; }
    const valid = /^https?:\/\//i.test(url)
      || (url.startsWith("/") && !url.startsWith("//") && destination.origin === window.location.origin);
    if (!valid || /^\/(?:product|product-detail)(?:\/|$)/i.test(destination.pathname) || safe.some((item) => item.url === url)) return safe;
    const type = ["internal", "external"].includes(card?.type)
      ? card.type
      : url.startsWith("/")
        ? "internal"
        : "external";
    safe.push({
      id: String(card?.id || `link:${url}`),
      title: String(card?.title || "").trim().slice(0, 120) || "Open link",
      imageUrl: String(card?.imageUrl || "").trim(),
      url,
      type,
      openInNewTab: type === "external" && card?.openInNewTab !== false,
    });
    return safe;
  }, []).slice(0, 4);
}

function faviconUrlForLink(link = {}) {
  if (typeof window === "undefined") return "";
  if (link.type === "internal") {
    return document.querySelector('link[rel="icon"], link[rel="shortcut icon"]')?.href
      || `${window.location.origin}/favicon.ico`;
  }
  try {
    const destination = new URL(link.url);
    if (!/^https?:$/.test(destination.protocol)) return "";
    return apiUrl(`/science-ai/favicon?url=${encodeURIComponent(destination.origin)}`);
  } catch (_error) {
    return "";
  }
}

function previewImageForLink(link) {
  try {
    const destination = new URL(link.url, window.location.origin);
    const image = link.imageUrl
      || (link.type === "internal" && getSiteOgImage(destination.pathname));
    if (!image) return "";
    const url = new URL(image, link.imageUrl ? destination : window.location.origin);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch (_error) {
    return "";
  }
}

function WebsiteLinkThumbnail({ imageUrl, faviconUrl }) {
  const [failedImages, setFailedImages] = useState([]);
  const source = [imageUrl, faviconUrl].find((url) => url && !failedImages.includes(url));
  return (
    <span className="ai-website-link-thumbnail" aria-hidden="true">
      {source ? (
        <img
          className={source === imageUrl ? undefined : "is-favicon"}
          src={source}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedImages((current) => [...current, source])}
        />
      ) : <Link2 size={14} />}
    </span>
  );
}

function useScienceAIHeroAnimationData(enabled) {
  const [animationData, setAnimationData] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let mounted = true;
    let idleId = 0;
    let timer = 0;

    const load = () => {
      fetch("/hero.json", { cache: "force-cache" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (mounted) setAnimationData(data);
        })
        .catch(() => {
          if (mounted) setAnimationData(null);
        });
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(load, { timeout: 1800 });
    } else {
      timer = window.setTimeout(load, 400);
    }

    return () => {
      mounted = false;
      if (idleId && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled]);

  return animationData;
}

function createSession(priorChatsSummary = "") {
  const id = `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    title: "New Chat",
    titleGenerated: false,
    messages: [welcomeMessage],
    memory: normalizeConversationMemory(),
    priorChatsSummary: cleanMemoryText(priorChatsSummary, MAX_PREVIOUS_CHATS_SUMMARY_LENGTH),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function normalizeStoredMessage(message = {}) {
  // Never persist base64 / preview blobs — text + metadata only.
  return {
    id: message.id || createMessageId(message.role === "user" ? "user" : "ai"),
    role: message.role === "user" ? "user" : "ai",
    text: String(message.text || ""),
    images: (message.images || []).slice(0, 5).map((image) => ({
      id: image.id || image.name || "image",
      name: image.name || "Uploaded image",
      mimeType: image.mimeType || "image/jpeg",
    })),
    suggestions: Array.isArray(message.suggestions) ? message.suggestions : [],
    linkCards: normalizeLinkCards(message.linkCards),
    warning: message.warning || "",
    isError: Boolean(message.isError),
  };
}

function legacyCopiedPromptTitle(messages = []) {
  const firstPrompt = String(messages.find((message) => message.role === "user")?.text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!firstPrompt) return "Image analysis";
  return firstPrompt.length > 34 ? `${firstPrompt.slice(0, 34).trim()}...` : firstPrompt;
}

function normalizeStoredSession(session = {}) {
  const messages = Array.isArray(session.messages)
    ? session.messages.map((message) => normalizeStoredMessage(message)).filter(Boolean)
    : [];
  const storedTitle = String(session.title || "").trim();
  const isLegacyCopiedTitle = storedTitle === legacyCopiedPromptTitle(messages);
  const inferredGeneratedTitle = Boolean(
    storedTitle
    && storedTitle !== "New Chat"
    && storedTitle !== "Pulse AI Chat"
    && !isLegacyCopiedTitle
  );
  const titleGenerated = session.titleGenerated === true || inferredGeneratedTitle;
  return {
    id: session.id || `chat-${Date.now()}`,
    title: isLegacyCopiedTitle
      ? "Pulse AI Chat"
      : (storedTitle || "New Chat"),
    titleGenerated,
    messages: messages.length ? messages : [welcomeMessage],
    memory: normalizeConversationMemory(session.memory),
    priorChatsSummary: cleanMemoryText(session.priorChatsSummary, MAX_PREVIOUS_CHATS_SUMMARY_LENGTH),
    createdAt: session.createdAt || Date.now(),
    updatedAt: session.updatedAt || Date.now(),
  };
}

function normalizeStoredChatState(value = {}) {
  const sessions = (Array.isArray(value.sessions) ? value.sessions : [])
    .map((session) => normalizeStoredSession(session))
    .slice(0, MAX_TEMPORARY_CHAT_SESSIONS);
  const safeSessions = sessions.length ? sessions : [createSession()];
  const requestedActiveId = String(value.activeSessionId || "");
  const activeSessionId = safeSessions.some((session) => session.id === requestedActiveId)
    ? requestedActiveId
    : safeSessions[0].id;
  return { sessions: safeSessions, activeSessionId };
}

function loadScienceAIState() {
  if (typeof window === "undefined") return normalizeStoredChatState();
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SCIENCE_AI_SESSIONS_KEY) || "null");
    if (parsed && typeof parsed === "object") return normalizeStoredChatState(parsed);

    const legacy = JSON.parse(window.sessionStorage.getItem(LEGACY_SCIENCE_AI_SESSION_KEY) || "null");
    if (legacy && typeof legacy === "object") {
      const session = normalizeStoredSession(legacy);
      return { sessions: [session], activeSessionId: session.id };
    }
    return normalizeStoredChatState();
  } catch (_error) {
    return normalizeStoredChatState();
  }
}

function saveScienceAIState(state) {
  if (typeof window === "undefined") return;
  try {
    const normalized = normalizeStoredChatState(state);
    window.sessionStorage.setItem(SCIENCE_AI_SESSIONS_KEY, JSON.stringify(normalized));
    window.sessionStorage.removeItem(LEGACY_SCIENCE_AI_SESSION_KEY);
  } catch (_error) {
    // Session storage can be unavailable or full; chat still works in memory.
  }
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const [, base64 = ""] = result.split(",");
      resolve({
        id: `${file.name}-${file.size}-${Date.now()}`,
        name: file.name,
        base64,
        preview: result,
        mimeType: file.type || "image/jpeg",
      });
    };
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
}

function createMessageId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inlineMarkdownParts(text) {
  const value = String(text || "");
  const parts = [];
  let index = 0;

  const pushText = (content) => {
    if (content) parts.push({ type: "text", content });
  };

  while (index < value.length) {
    const rest = value.slice(index);
    const link = rest.match(/^\[([^\]\n]+)\]\(((?:https?:\/\/|\/(?!\/))[^\s)<>]+)\)|^((?:https?:\/\/|www\.)[^\s<>]+)/i);
    if (link) {
      parts.push({ type: "link", content: link[0], label: link[1], url: link[2] || link[3] });
      index += link[0].length;
      continue;
    }
    const route = (index === 0 || /[\s(]/.test(value[index - 1])) && rest.match(/^\/[a-z#][^\s<>]*/i)?.[0];
    if (route) {
      parts.push({ type: "link", content: route, url: route });
      index += route.length;
      continue;
    }
    const marker = rest.startsWith("**") ? "**" : rest.startsWith("__") ? "__" : rest.startsWith("`") ? "`" : "";

    if (marker) {
      const closeIndex = value.indexOf(marker, index + marker.length);
      if (closeIndex > index + marker.length) {
        parts.push({
          type: marker === "`" ? "code" : "strong",
          content: value.slice(index + marker.length, closeIndex),
        });
        index = closeIndex + marker.length;
        continue;
      }
    }

    const char = value[index];
    if ((char === "*" || char === "_") && value[index + 1] && value[index + 1] !== char && value[index + 1] !== " ") {
      const closeIndex = value.indexOf(char, index + 1);
      if (closeIndex > index + 1) {
        parts.push({ type: "em", content: value.slice(index + 1, closeIndex) });
        index = closeIndex + 1;
        continue;
      }
    }

    let nextIndex = value.length;
    for (const candidate of ["**", "__", "`", "*", "_"]) {
      const found = value.indexOf(candidate, index + 1);
      if (found !== -1 && found < nextIndex) nextIndex = found;
    }
    const nextLink = rest.slice(1).search(/\[|https?:\/\/|www\./i);
    if (nextLink !== -1) nextIndex = Math.min(nextIndex, index + 1 + nextLink);
    const nextRoute = /[\s(]\/[a-z#]/i.exec(rest);
    if (nextRoute) nextIndex = Math.min(nextIndex, index + 1 + nextRoute.index);
    pushText(value.slice(index, nextIndex));
    index = nextIndex;
  }

  return parts;
}

function renderInlineMarkdown(text, keyPrefix) {
  return inlineMarkdownParts(text).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.type === "strong") return <strong key={key}>{renderInlineMarkdown(part.content, key)}</strong>;
    if (part.type === "em") return <em key={key}>{renderInlineMarkdown(part.content, key)}</em>;
    if (part.type === "code") return <code key={key}>{part.content}</code>;
    if (part.type === "link") return renderMessageLink(part, key);
    return part.content;
  });
}

function renderMessageLink({ label, url, content }, key) {
  const trailing = label ? "" : (url.match(/[\])},.!?;:]+$/)?.[0] || "");
  const cleanUrl = url.slice(0, url.length - trailing.length);
  const href = /^www\./i.test(cleanUrl) ? `https://${cleanUrl}` : cleanUrl;
  let parsed;
  try {
    parsed = new URL(href, window.location.origin);
  } catch (_error) {
    return content;
  }
  if (!/^https?:$/.test(parsed.protocol) || href.includes("\\") || parsed.username || parsed.password) return content;

  const external = parsed.hostname !== window.location.hostname && !/^(www\.)?prakashshop\.in$/i.test(parsed.hostname);
  return (
    <span key={key}>
      <a
        className={`ai-response-link ${external ? "external" : "internal"}`}
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer noopener" : undefined}
      >
        <span>{label || cleanUrl}</span>
        {external ? <ArrowUpRight aria-hidden="true" size={14} /> : null}
      </a>
      {trailing}
    </span>
  );
}

function repairWrappedMarkdownLinks(text) {
  // Repair folded destinations before splitting paragraphs, so their link label and URL stay together.
  return String(text || "").replace(
    /(\[[^\]\r\n]+\]\()((?:https?:\/\/|\/(?!\/))[^\s()<>]+(?:(?:[ \t]*\r?\n){1,2}[ \t]*[^\s()<>]+)+)(\))/gi,
    (_match, start, destination, end) => start + destination.replace(/[ \t]*\r?\n[ \t]*/g, "") + end,
  );
}

function FormattedMessage({ text }) {
  const lines = repairWrappedMarkdownLinks(text).split(/\r?\n/);

  return (
    <div className="ai-formatted-text">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        const key = `line-${index}`;
        const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
        const bullet = trimmed.match(/^[-*]\s+(.+)$/);
        const numbered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);

        if (!trimmed) return <div className="ai-md-break" key={key} aria-hidden="true" />;
        if (heading) {
          const level = heading[1].length;
          return <p className={`ai-md-heading level-${level}`} key={key}>{renderInlineMarkdown(heading[2], key)}</p>;
        }
        if (bullet) {
          return (
            <div className="ai-md-list-item" key={key}>
              <span aria-hidden="true">-</span>
              <p>{renderInlineMarkdown(bullet[1], key)}</p>
            </div>
          );
        }
        if (numbered) {
          return (
            <div className="ai-md-list-item numbered" key={key}>
              <span>{numbered[1]}.</span>
              <p>{renderInlineMarkdown(numbered[2], key)}</p>
            </div>
          );
        }
        return <p key={key}>{renderInlineMarkdown(line, key)}</p>;
      })}
    </div>
  );
}

function offlinePulseMessage(promptText, imageCount = 0) {
  const prompt = String(promptText || "").toLowerCase();
  if (imageCount > 0) {
    return "Internet connection is unavailable, so I cannot safely inspect the uploaded image or verify a matching product right now. Please reconnect and send it again. Meanwhile, keep the product label, model number, visible fault and required use ready for a more accurate match.";
  }
  if (/\b(cart|checkout|total|coupon|order)\b/.test(prompt)) {
    return "Internet connection is unavailable, so I cannot verify live prices, coupon eligibility or the checkout total right now. Your browser cart remains available in this session—please reconnect, refresh the cart, and confirm the latest order summary before checkout.";
  }
  if (/\b(repair|service|fault|problem|issue|not working|kharab|fan|cooler|ac|tv|fridge|speaker)\b/.test(prompt)) {
    return "Internet connection is unavailable, so live diagnosis and booking are temporarily unavailable. For safety, switch the appliance off and disconnect it from power if there is heat, smoke, sparking or a burning smell. Note the product type, model and exact symptom, then reconnect and send those details so Pulse AI can guide you or open the correct repair booking.";
  }
  if (/\b(buy|product|price|stock|available|suggest|recommend|speaker|wire|mcb|switch|light|rgb)\b/.test(prompt)) {
    return "Internet connection is unavailable, so I cannot verify current stock, price or offers without risking outdated information. Please reconnect and resend your requirement with the product type, budget and key specification; Pulse AI will then show only matching available products.";
  }
  return "Internet connection is unavailable right now. Your message is saved in this chat, but live shop information cannot be verified offline. Please reconnect and send it again for an accurate product, offer or repair response.";
}

export function ScienceAIPage() {
  const { items: cartItems, totals } = useCart();
  const [chatState, setChatState] = useState(() => {
    const state = loadScienceAIState();
    if (!readPulseAISearchPrompt()) return state;

    const activeSession = state.sessions.find((item) => item.id === state.activeSessionId);
    if (!activeSession?.messages.some((message) => message.role === "user")) return state;

    const nextSession = createSession();
    return {
      activeSessionId: nextSession.id,
      sessions: [nextSession, ...state.sessions].slice(0, MAX_TEMPORARY_CHAT_SESSIONS),
    };
  });
  const [input, setInput] = useState("");
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [replyStatus, setReplyStatus] = useState(null);
  const [replyReveal, setReplyReveal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("pulse-ai-theme");
    return saved === "dark" || saved === "light" ? saved : "light";
  });
  const [, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [navOpen, setNavOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth > 860));
  const [visualViewport, setVisualViewport] = useState(() => ({
    height: typeof window === "undefined" ? 0 : (window.visualViewport?.height || window.innerHeight),
    top: typeof window === "undefined" ? 0 : (window.visualViewport?.offsetTop || 0),
  }));
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const [mediaMenuPosition, setMediaMenuPosition] = useState({ left: -9999, top: -9999 });
  const endRef = useRef(null);
  const uploadButtonRef = useRef(null);
  const mediaMenuRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const dragDepth = useRef(0);
  const activeReply = useRef(null);
  const revealTimer = useRef(null);
  const sessions = chatState.sessions;
  const session = useMemo(
    () => sessions.find((item) => item.id === chatState.activeSessionId) || sessions[0],
    [chatState.activeSessionId, sessions],
  );
  const displayedChatTitle = session.title === "New Chat" ? "Pulse AI" : session.title;
  const messages = useMemo(() => session.messages || [welcomeMessage], [session.messages]);
  const hasStarted = useMemo(() => messages.some((message) => message.role === "user"), [messages]);
  const heroAnimationData = useScienceAIHeroAnimationData(!hasStarted);
  const visibleMessages = useMemo(
    () => (hasStarted ? messages.filter((message) => message.text !== welcomeMessage.text) : []),
    [hasStarted, messages],
  );
  const lastMessageId = visibleMessages[visibleMessages.length - 1]?.id || "";
  const revealEnd = replyReveal?.id === lastMessageId ? replyReveal.end : null;
  useEffect(() => {
    if (!lastMessageId && !busy) return;
    endRef.current?.scrollIntoView({ behavior: busy || revealEnd !== null ? "auto" : "smooth" });
  }, [lastMessageId, busy, revealEnd]);

  useEffect(() => () => window.clearInterval(revealTimer.current), []);

  useEffect(() => {
    const timer = window.setTimeout(() => saveScienceAIState(chatState), 500);
    return () => window.clearTimeout(timer);
  }, [chatState]);

  useEffect(() => {
    localStorage.setItem("pulse-ai-theme", theme);
  }, [theme]);

  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const syncViewport = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setVisualViewport({
        height: viewport?.height || window.innerHeight,
        top: viewport?.offsetTop || 0,
      }));
    };
    document.body.classList.add("pulse-ai-route-active");
    syncViewport();
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.classList.remove("pulse-ai-route-active");
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (!mediaMenuOpen) return undefined;

    let frame = 0;
    const updateMediaMenuPosition = () => {
      frame = 0;
      const button = uploadButtonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const menuWidth = mediaMenuRef.current?.offsetWidth || 168;
      const menuHeight = mediaMenuRef.current?.offsetHeight || 102;
      const gap = 10;
      const edge = 8;
      const left = Math.min(Math.max(rect.left, edge), window.innerWidth - menuWidth - edge);
      const topAbove = rect.top - menuHeight - gap;
      const topBelow = rect.bottom + gap;
      const top = topAbove >= edge ? topAbove : Math.min(topBelow, window.innerHeight - menuHeight - edge);

      setMediaMenuPosition({ left, top: Math.max(edge, top) });
    };
    const scheduleMediaMenuPosition = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateMediaMenuPosition);
    };

    updateMediaMenuPosition();
    scheduleMediaMenuPosition();

    const closeOnOutsideClick = (event) => {
      const target = event.target;
      if (uploadButtonRef.current?.contains(target) || mediaMenuRef.current?.contains(target)) return;
      setMediaMenuOpen(false);
    };

    window.addEventListener("resize", scheduleMediaMenuPosition, { passive: true });
    window.addEventListener("scroll", scheduleMediaMenuPosition, { capture: true, passive: true });
    document.addEventListener("pointerdown", closeOnOutsideClick);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMediaMenuPosition);
      window.removeEventListener("scroll", scheduleMediaMenuPosition, true);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [mediaMenuOpen]);

  const updateSessionById = useCallback((sessionId, updater) => {
    setChatState((current) => ({
      ...current,
      sessions: current.sessions.map((item) => (
        item.id === sessionId ? { ...updater(item), updatedAt: Date.now() } : item
      )),
    }));
  }, []);

  const conversationHistory = useMemo(
    () => {
      const recentMessages = messages
        .filter((message) => !message.isError && message.text !== welcomeMessage.text)
        .slice(-18);
      const imageMessageIndexes = recentMessages
        .map((message, index) => ((message.images || []).some((image) => image.base64) ? index : -1))
        .filter((index) => index >= 0)
        .slice(-2);
      return recentMessages.map((message, index) => ({
        role: message.role === "user" ? "user" : "ai",
        text: message.text,
        images: imageMessageIndexes.includes(index)
          ? (message.images || [])
            .filter((image) => image.base64)
            .slice(0, 1)
            .map((image) => ({ base64: image.base64, mimeType: image.mimeType }))
          : [],
      }));
    },
    [messages],
  );

  const conversationMemory = useMemo(() => {
    const memory = normalizeConversationMemory(session.memory);
    const userMessages = messages.filter((item) => item.role === "user");
    return {
      ...memory,
      firstUserQuestion: firstQuestionFromSession(session),
      previousChatsSummary: cleanMemoryText(session.priorChatsSummary, MAX_PREVIOUS_CHATS_SUMMARY_LENGTH),
      totalUserMessages: userMessages.length,
    };
  }, [messages, session]);

  const addFiles = async (fileList) => {
    const valid = Array.from(fileList || []).filter((file) => file.type.startsWith("image/") && file.size <= 4 * 1024 * 1024);
    const remainingSlots = 5 - images.length;
    if (remainingSlots <= 0) {
      setError("You can add up to 5 images.");
      return;
    }
    if (!valid.length) {
      setError("Please add image files under 4MB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const payloads = await Promise.all(valid.slice(0, remainingSlots).map(fileToPayload));
      setImages((current) => [...current, ...payloads].slice(0, 5));
    } catch (err) {
      setError(err.message || "Unable to prepare images.");
    } finally {
      setUploading(false);
    }
  };

  const closeNavOnMobile = () => {
    if (typeof window !== "undefined" && window.innerWidth <= 860) setNavOpen(false);
  };

  const finishReplyReveal = useCallback(() => {
    window.clearInterval(revealTimer.current);
    setReplyReveal(null);
  }, []);

  const addAssistantMessage = useCallback(({ text, suggestions = [], linkCards = [], warning, memory, isError = false, targetSessionId }) => {
    const replyText = repairWrappedMarkdownLinks(text);
    const message = { id: createMessageId("ai"), role: "ai", text: replyText, suggestions, linkCards, warning, isError };
    updateSessionById(targetSessionId, (targetSession) => ({
      ...targetSession,
      memory: memory ? normalizeConversationMemory(memory) : targetSession.memory,
      messages: [...targetSession.messages, message],
    }));

    if (isError || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const wordEnds = Array.from(replyText.matchAll(/\S+\s*/g), (match) => match.index + match[0].length);
    const wordsPerFrame = Math.max(3, Math.ceil(wordEnds.length / 30));
    if (wordEnds.length <= wordsPerFrame) return;

    let wordsShown = wordsPerFrame;
    setReplyReveal({ id: message.id, end: wordEnds[wordsShown - 1] });
    revealTimer.current = window.setInterval(() => {
      wordsShown += wordsPerFrame;
      if (wordsShown >= wordEnds.length) {
        finishReplyReveal();
        return;
      }
      setReplyReveal({ id: message.id, end: wordEnds[wordsShown - 1] });
    }, 40);
  }, [finishReplyReveal, updateSessionById]);

  const newChat = () => {
    const nextSession = createSession(buildPreviousChatsSummary(sessions));
    setChatState((current) => ({
      activeSessionId: nextSession.id,
      sessions: [nextSession, ...current.sessions].slice(0, MAX_TEMPORARY_CHAT_SESSIONS),
    }));
    setInput("");
    setImages([]);
    setError("");
    closeNavOnMobile();
  };

  const deleteChat = () => {
    if (revealEnd !== null) finishReplyReveal();
    if (activeReply.current?.sessionId === session.id) {
      activeReply.current = null;
      setBusy(false);
      setReplyStatus(null);
    }
    setChatState((current) => {
      const remaining = current.sessions.filter((item) => item.id !== current.activeSessionId);
      if (remaining.length) return { sessions: remaining, activeSessionId: remaining[0].id };
      const nextSession = createSession();
      return { sessions: [nextSession], activeSessionId: nextSession.id };
    });
    setInput("");
    setImages([]);
    setError("");
    closeNavOnMobile();
  };

  const selectChat = (sessionId) => {
    if (!sessions.some((item) => item.id === sessionId)) return;
    setChatState((current) => ({ ...current, activeSessionId: sessionId }));
    setInput("");
    setImages([]);
    setError("");
    closeNavOnMobile();
  };

  const sendMessage = useCallback(async (overrideText) => {
    const text = String(overrideText ?? input).trim();
    if ((!text && images.length === 0) || activeReply.current) return;
    finishReplyReveal();

    const targetSessionId = session.id;
    const reply = { sessionId: targetSessionId };
    activeReply.current = reply;
    setReplyStatus({ ...reply, text: REPLY_STATUS.thinking });
    const userMessage = { id: createMessageId("user"), role: "user", text, images };
    const shouldTitle = session.titleGenerated !== true;
    updateSessionById(targetSessionId, (targetSession) => ({
      ...targetSession,
      messages: [...targetSession.messages, userMessage],
    }));
    setInput("");
    setImages([]);
    setBusy(true);
    setError("");

    try {
      const response = await apiRequest("/science-ai/chat", {
        method: "POST",
        timeout: 65000,
        onProgress: (stage) => {
          const text = REPLY_STATUS[stage];
          if (activeReply.current === reply && typeof text === "string") {
            setReplyStatus({ ...reply, text });
          }
        },
        body: JSON.stringify({
          message: text,
          images: images.map((image) => ({
            base64: image.base64,
            mimeType: image.mimeType,
            name: image.name,
          })),
          conversationHistory,
          conversationMemory,
          cart: {
            items: couponOrderItems(cartItems),
            couponCode: getAppliedCouponCode(),
          },
          customerId: getPulseAICustomerId(),
          sessionId: targetSessionId,
          generateTitle: shouldTitle,
        }),
      });
      if (activeReply.current !== reply) return;
      setReplyStatus(null);
      const answer = response.data?.response || "I could not generate a response. Please try again.";
      const suggestions = response.data?.suggestions || [];
      const linkCards = normalizeLinkCards(response.data?.linkCards);
      const warning = response.data?.warning || "";
      const memory = response.data?.memory || null;
      const generatedChatTitle = String(response.data?.chatTitle || "").trim();
      if (shouldTitle && generatedChatTitle) {
        updateSessionById(targetSessionId, (targetSession) => ({
          ...targetSession,
          title: generatedChatTitle.slice(0, 60),
          titleGenerated: true,
        }));
      }
      addAssistantMessage({ text: answer, suggestions, linkCards, warning, memory, targetSessionId });
    } catch (err) {
      if (activeReply.current !== reply) return;
      setReplyStatus(null);
      const rawMessage = String(err?.message || "");
      const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
      const isTimeout = /timed?\s*out|timeout/i.test(rawMessage);
      const message = isOffline
        ? offlinePulseMessage(text, images.length)
        : isTimeout
          ? "Pulse AI took too long to reply. Please try again."
          : "Pulse AI could not reach the chat service. Please try again in a moment.";
      setError(message);
      addAssistantMessage({
        text: message,
        suggestions: [],
        linkCards: [],
        warning: isOffline ? "No internet connection. Live shop data could not be checked." : "",
        isError: true,
        targetSessionId,
      });
    } finally {
      if (activeReply.current === reply) {
        activeReply.current = null;
        setBusy(false);
      }
    }
  }, [addAssistantMessage, cartItems, conversationHistory, conversationMemory, finishReplyReveal, images, input, session.id, session.titleGenerated, updateSessionById]);

  useEffect(() => {
    const prompt = consumePulseAISearchPrompt();
    if (prompt) void sendMessage(prompt);
  }, [sendMessage]);

  const onDragEnter = (event) => {
    event.preventDefault();
    dragDepth.current += 1;
    if (Array.from(event.dataTransfer?.items || []).some((item) => item.kind === "file")) setDragging(true);
  };

  const onDragLeave = (event) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDrop = (event) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const mediaMenuPortal = mediaMenuOpen && typeof document !== "undefined" ? createPortal(
    <div
      ref={mediaMenuRef}
      className={`ai-media-menu-layer open ${theme}`}
      style={{ left: `${mediaMenuPosition.left}px`, top: `${mediaMenuPosition.top}px` }}
    >
      <div className="ai-media-menu" role="menu">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setMediaMenuOpen(false);
            galleryInputRef.current?.click();
          }}
        >
          <Images size={18} />
          <span>Gallery</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setMediaMenuOpen(false);
            cameraInputRef.current?.click();
          }}
        >
          <Camera size={18} />
          <span>Camera</span>
        </button>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <div
        className={`science-ai-page ${theme} ${navOpen ? "nav-open" : "nav-closed"} ${dragging ? "dragging" : ""}`}
        style={{
          "--ai-viewport-height": `${Math.round(visualViewport.height)}px`,
          "--ai-viewport-top": `${Math.round(visualViewport.top)}px`,
        }}
        onDragEnter={onDragEnter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragging && <div className="ai-drop-overlay"><ImagePlus size={34} /> Drop images anywhere</div>}

        {navOpen && <button className="ai-sidebar-scrim" type="button" aria-label="Close menu" onClick={() => setNavOpen(false)} />}

      <aside className="science-ai-sidebar">
        <div className="ai-sidebar-head">
          <a className="ai-brand" href="/pulse-ai">
            <span className="ai-brand-mark"><PulseOrbAnimation className="pulse-orb-animation--brand" /></span>
            <strong>Pulse AI</strong>
          </a>
          <button type="button" className="ai-icon-button" onClick={() => setNavOpen(false)} aria-label="Hide menu">
            <PanelLeftClose size={18} />
          </button>
        </div>
        <a className="ai-back-nav" href="/" aria-label="Back to home">
          <ChevronLeft size={16} aria-hidden="true" />
          Back
        </a>
        <button type="button" onClick={newChat}><Plus size={16} /> New Chat</button>
        <button type="button" onClick={deleteChat} className="ai-delete-chat"><Trash2 size={16} /> Delete Current Chat</button>
        <p className="ai-session-storage-note">Temporary chats stay in this tab and clear when the tab is closed.</p>
        <div className="ai-session-list" aria-label="Temporary chats">
          {sessions.map((item) => {
            const isActive = item.id === session.id;
            const queryCount = item.messages.filter((message) => message.role === "user").length;
            return (
              <button
                type="button"
                className={`ai-session-item${isActive ? " active" : ""}`}
                onClick={() => selectChat(item.id)}
                aria-current={isActive ? "true" : undefined}
                key={item.id}
              >
                <span>{item.title}</span>
                <small>{isActive ? "Current chat" : `${queryCount} ${queryCount === 1 ? "query" : "queries"}`}</small>
              </button>
            );
          })}
        </div>
        <div className="ai-sidebar-card">
          <span>Product help</span>
          <strong>Ask naturally to compare products, find available shop items, or get practical repair guidance.</strong>
        </div>
      </aside>

      <main className="science-ai-chat">
        <header className="science-ai-topbar">
          <button className="ai-nav-toggle" type="button" onClick={() => setNavOpen((current) => !current)} aria-label={navOpen ? "Hide menu" : "Show menu"}>
            {navOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
          </button>
          <div className="ai-title-block">
            <h1 title={displayedChatTitle}>{displayedChatTitle}</h1>
          </div>
          <div className="ai-topbar-actions">
            <a className="ai-topbar-cart" href="/cart" aria-label={`Open cart with ${totals.quantity} items`}>
              <img src={cartImage} alt="" aria-hidden="true" />
              <span>Cart</span>
              {totals.quantity > 0 ? <small>{totals.quantity}</small> : null}
            </a>
            <button className="ai-theme-toggle" type="button" onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              <span>{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
          </div>
        </header>

        <section className="ai-messages" aria-live="polite">
          {!hasStarted && <EmptyState animationData={heroAnimationData} />}

          {visibleMessages.map((message, index) => (
            <article
              className={`ai-message ${message.role}`}
              aria-label={message.role === "user" ? "Your message" : "Pulse AI response"}
              aria-busy={message.id === replyReveal?.id || undefined}
              key={message.id || `${message.role}-${index}`}
            >
              <div className={`ai-avatar${message.role === "user" ? "" : " ai-avatar--pulse"}`} aria-hidden="true">
                {message.role === "user" ? "You" : <PulseOrbAnimation className="pulse-orb-animation--avatar" deferUntilVisible />}
              </div>
              <div
                className={message.role === "user" ? "ai-bubble-user" : "ai-reply"}
              >
                {message.images?.length > 0 && (
                  <div className="ai-message-images-pro">
                    {message.images
                      .filter((image) => image.preview)
                      .map((image) => (
                        <img
                          src={image.preview}
                          alt={image.name || "Uploaded"}
                          key={image.id || image.preview}
                          className="ai-message-image-pro"
                        />
                    ))}
                  </div>
                )}
                <div className="ai-message-body">
                  <FormattedMessage text={message.id === replyReveal?.id ? message.text.slice(0, replyReveal.end) : message.text} />
                  {message.id === replyReveal?.id && <span className="ai-stream-cursor" aria-hidden="true" />}
                </div>
                {message.id !== replyReveal?.id && message.warning && (
                  <small className="ai-response-warning-pro">
                    {message.warning}
                  </small>
                )}
                {message.id !== replyReveal?.id && message.suggestions?.length > 0 && (
                  <div className="ai-suggestion-block">
                    <SuggestionCards suggestions={message.suggestions} theme={theme} />
                  </div>
                )}
                {message.id !== replyReveal?.id && message.linkCards?.length > 0 && (
                  <WebsiteLinkChips links={message.linkCards} />
                )}
              </div>
       
            </article>
          ))}
          {replyStatus?.sessionId === session.id && (
            <article className="ai-message ai" aria-label="Pulse AI">
              <div className="ai-avatar ai-avatar--pulse" aria-hidden="true"><PulseOrbAnimation className="pulse-orb-animation--avatar" deferUntilVisible /></div>
              <div className="ai-reply"><AITextLoading text={replyStatus.text} /></div>
            </article>
          )}
          <div ref={endRef} />
        </section>

          <footer className="science-ai-composer">

          {images.length > 0 && (
            <div className="ai-image-preview-grid">
              {images.map((image) => (
                <div className="ai-image-chip" key={image.id}>
                  <img src={image.preview} alt={image.name} />
                  <button type="button" onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))} aria-label="Remove image">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <AIChatInput
            value={input}
            onChange={setInput}
            onSubmit={sendMessage}
            onAttach={() => setMediaMenuOpen((current) => !current)}
            attachButtonRef={uploadButtonRef}
            hasAttachments={images.length > 0}
            disabled={busy || uploading}
            busy={busy || uploading}
            className="pulse-ai-composer-shell"
          />

          <div className="ai-media-hidden-inputs" aria-hidden="true">
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
          {uploading && <div className="ai-uploading">Preparing images...</div>}
        </footer>
      </main>
      </div>
      {mediaMenuPortal}
    </>
  );
}

function EmptyState({ animationData }) {
  return (
    <div className="ai-empty-state">
      <div className="ai-empty-copy">
        <span className="ai-empty-kicker">Prakash Electronics assistant</span>
        <h2>Pulse AI</h2>
        <p>
          Pulse AI is your friendly commerce <br />and repair assistant for products, wiring <br />accessories, RGB lights, electrical parts, and service bookings.
        </p>
      </div>

      <div className="ai-empty-visual" aria-hidden="true">
        <div className="ai-empty-animation-shell">
          {animationData ? (
            <LottieSvgAnimation
              data={animationData}
              title="Pulse AI animation"
              className="ai-empty-lottie"
            />
          ) : (
            <div className="ai-empty-lottie ai-empty-lottie-loading" />
          )}
        </div>
        <div className="ai-empty-badge ai-empty-badge-top">
          <PulseOrbAnimation className="pulse-orb-animation--badge" />
          <span>Shop & Repair Guide</span>
        </div>
        <div className="ai-empty-badge ai-empty-badge-bottom">
          <Wrench size={16} />
          <span>Smart Suggestions</span>
        </div>
      </div>
    </div>
  );
}

function SuggestionCards({ suggestions, theme }) {
  const { addItem, getQuantity } = useCart();
  const availableSuggestions = (suggestions || []).filter((item) => item.available);
  const suggestionTrackRef = useRef(null);
  const suggestionDragRef = useRef({ active: false, pointerId: null, startX: 0, startScrollLeft: 0 });
  const [suggestionEdges, setSuggestionEdges] = useState({ previous: false, next: false });

  useEffect(() => {
    const track = suggestionTrackRef.current;
    if (!track) return undefined;
    let frame = 0;

    const updateEdges = () => {
      frame = 0;
      const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
      const nextEdges = {
        previous: track.scrollLeft > 3,
        next: track.scrollLeft < maxScrollLeft - 3,
      };
      setSuggestionEdges((current) => (
        current.previous === nextEdges.previous && current.next === nextEdges.next
          ? current
          : nextEdges
      ));
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateEdges);
    };

    scheduleUpdate();
    track.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(scheduleUpdate)
      : null;
    resizeObserver?.observe(track);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      track.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [availableSuggestions.length]);

  if (!availableSuggestions.length) return null;

  const scrollSuggestions = (direction) => {
    const track = suggestionTrackRef.current;
    if (!track) return;
    const firstCard = track.querySelector(".ai-suggestion-card");
    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap) || 12;
    const distance = (firstCard?.getBoundingClientRect().width || track.clientWidth * 0.8) + gap;
    track.scrollBy({ left: direction * distance, behavior: "smooth" });
  };

  const beginSuggestionDrag = (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || event.target.closest("a, button")) return;
    const track = event.currentTarget;
    suggestionDragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: track.scrollLeft,
    };
    track.classList.add("is-dragging");
    track.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const moveSuggestionDrag = (event) => {
    const drag = suggestionDragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    event.currentTarget.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startX);
    event.preventDefault();
  };

  const endSuggestionDrag = (event) => {
    const drag = suggestionDragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    suggestionDragRef.current.active = false;
    event.currentTarget.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cartOverrides = (item) => {
    const sourceCollection = String(item.sourceCollection || "").toLowerCase();
    const projectPart = sourceCollection.includes("project");
    return {
      sourceType: projectPart ? "project-part" : "shop-product",
      sourceId: item.productId || item.slug || item.name,
      productId: item.productId,
      productSlug: item.slug,
      productName: item.name,
      productCategory: projectPart ? SCIENCE_PROJECTS_CATEGORY : item.category,
      originalCategory: projectPart ? item.category : "",
      productImageUrl: item.imageUrl,
      productDescription: item.shortDescription,
      availability: item.availability || item.status,
      stockQuantity: item.stockQuantity ?? item.quantity,
      price: item.price,
    };
  };

  const addSuggestionToCart = (item) => {
    const result = addItem(item, cartOverrides(item));
    notifyCartResult(result, item.name);
  };

  const offerPrice = (item) => {
    const value = Number(item.effectivePrice);
    return Number.isFinite(value) && value >= 0 ? value : item.price;
  };

  const hasPublicOffer = (item) => item.publicCoupon
    && Number.isFinite(Number(item.publicCoupon.finalPrice))
    && Number(item.publicCoupon.finalPrice) < Number(item.price);

  const cartIconColor = theme === "light" ? "#0f172a" : "#ffffff";

  return (
    <div className="ai-suggestions">
      <div className="ai-suggestions-head">
        <strong>Suggested for you</strong>
        <span>{availableSuggestions.length} available</span>
      </div>
      <div
        className="ai-suggestion-carousel"
      >
        {suggestionEdges.previous ? (
          <button
            className="ai-suggestion-nav previous"
            type="button"
            onClick={() => scrollSuggestions(-1)}
            aria-label="Show previous product suggestion"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        ) : null}
        <div
          ref={suggestionTrackRef}
          className="ai-suggestion-grid"
          role="region"
          aria-label="Product suggestions. Swipe or drag horizontally to browse."
          tabIndex={0}
          onPointerDown={beginSuggestionDrag}
          onPointerMove={moveSuggestionDrag}
          onPointerUp={endSuggestionDrag}
          onPointerCancel={endSuggestionDrag}
          onDragStart={(event) => event.preventDefault()}
        >
          {availableSuggestions.map((item) => (
            <article className="ai-suggestion-card" key={`${item.name}-${item.component}`}>
              <div className="ai-suggestion-image">
                {item.imageUrl ? (
                  <OptimizedImage
                    src={item.imageUrl}
                    alt={item.name}
                    width={720}
                    height={540}
                    sizes="(max-width: 520px) 88vw, (max-width: 900px) 42vw, 280px"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <PackageSearch size={34} />
                )}
              </div>
              <div className="ai-suggestion-content">
                <div className="ai-suggestion-meta">
                  <span className="available">{item.status}</span>
                  <span className="ai-suggestion-price">
                    {hasPublicOffer(item) ? <del>{formatINR(item.price)}</del> : null}
                    <strong>{formatINR(offerPrice(item))}</strong>
                  </span>
                </div>
                <h3>{item.name}</h3>
                <div className="ai-suggestion-context">
                  <small>{item.component}</small>
                  {hasPublicOffer(item) ? (
                    <div className="ai-suggestion-offer">
                      <code>{item.publicCoupon.code}</code>
                      <span>Save {formatINR(item.publicCoupon.discountAmount)}</span>
                    </div>
                  ) : null}
                </div>
                <div className="ai-suggestion-actions">
                  <a href={`/product/${encodeURIComponent(item.slug || item.productId)}`}>
                    {item.hasVariants ? "Choose options" : "View Product"}
                    <ArrowUpRight size={15} />
                  </a>
                  {!item.hasVariants && <button
                    className={`ai-cart-icon-button ${getQuantity(item, cartOverrides(item)) ? "added" : ""}`}
                    type="button"
                    onClick={() => addSuggestionToCart(item)}
                    aria-label={`Add ${item.name} to cart`}
                    title={getQuantity(item, cartOverrides(item)) ? `In cart (${getQuantity(item, cartOverrides(item))})` : "Add to cart"}
                    disabled={getQuantity(item, cartOverrides(item)) >= getCartStockLimit(cartOverrides(item))}
                  >
                    {getQuantity(item, cartOverrides(item)) ? (
                      <Check size={16} color={cartIconColor} style={{ color: cartIconColor, stroke: cartIconColor }} />
                    ) : (
                      <ShoppingCart size={16} color={cartIconColor} style={{ color: cartIconColor, stroke: cartIconColor }} />
                    )}
                  </button>}
                  <span>{item.category || "Component"}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
        {suggestionEdges.next ? (
          <button
            className="ai-suggestion-nav next"
            type="button"
            onClick={() => scrollSuggestions(1)}
            aria-label="Show next product suggestion"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function WebsiteLinkChips({ links }) {
  return (
    <div className="ai-website-links" role="group" aria-label="Helpful website links">
      {links.map((link) => {
        return (
          <a
            className="ai-website-link-chip"
            href={link.url}
            key={link.url}
            target={link.openInNewTab ? "_blank" : undefined}
            rel={link.openInNewTab ? "noreferrer noopener" : undefined}
            title={link.title}
          >
            <WebsiteLinkThumbnail
              imageUrl={previewImageForLink(link)}
              faviconUrl={faviconUrlForLink(link)}
            />
            <strong>{link.title}</strong>
            <ArrowUpRight className="ai-website-link-arrow" size={14} aria-hidden="true" />
          </a>
        );
      })}
    </div>
  );
}
