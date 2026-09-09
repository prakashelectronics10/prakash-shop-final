import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Bot, Camera, Check, ImagePlus, Images, Link2, Moon, PackageSearch, PanelLeftClose, PanelLeftOpen, Plus, ShoppingCart, Sun, Trash2, Wrench } from "lucide-react";
import { apiRequest, apiUrl } from "../../api/client";
import { SCIENCE_PROJECTS_CATEGORY, getCartStockLimit, useCart } from "../../context/CartContext";
import { notifyCartResult } from "../../utils/cartToast";
import { couponOrderItems, getAppliedCouponCode } from "../../utils/coupons";
import { formatINR } from "../../utils/productPricing";
import { AIChatInput } from "../ui/AIChatInput";
import { LottieSvgAnimation } from "./LottieSvgAnimation";
import { OptimizedImage } from "./OptimizedImage";

const welcomeMessage = {
  role: "ai",
  text: "Hello, I am Pulse AI — your assistant for Prakash Electronics and Electricals. Ask about products, wiring accessories, RGB lights, home appliance repair, AC/cooler service, bookings, offers, or upload a photo and I will help with clear guidance and matching shop suggestions.",
};

const SCIENCE_AI_SESSIONS_KEY = "prakash:pulse-ai-sessions:v2";
const LEGACY_SCIENCE_AI_SESSION_KEY = "prakash:pulse-ai-session:v1";
const SCIENCE_AI_CUSTOMER_KEY = "prakash:pulse-ai-customer:v1";
const MAX_TEMPORARY_CHAT_SESSIONS = 25;
const MAX_PREVIOUS_CHATS_SUMMARY_LENGTH = 8000;

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
    const valid = (url.startsWith("/") && !url.startsWith("//")) || /^https?:\/\//i.test(url);
    let pathname = url;
    try { pathname = new URL(url, window.location.origin).pathname; } catch (_error) { /* handled by valid */ }
    if (!valid || /^\/product-detail(?:\/|$)/i.test(pathname) || safe.some((item) => item.url === url)) return safe;
    const type = ["internal", "external"].includes(card?.type)
      ? card.type
      : url.startsWith("/")
        ? "internal"
        : "external";
    safe.push({
      id: String(card?.id || `link:${url}`),
      title: String(card?.title || "Open link").trim().slice(0, 120),
      description: String(card?.description || "").trim().slice(0, 240),
      url,
      type,
      ctaLabel: String(card?.ctaLabel || (type === "internal" ? "View Page" : "Open Link")).trim().slice(0, 40),
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

function WebsiteLinkIcon({ link }) {
  const faviconUrl = faviconUrlForLink(link);
  const [failed, setFailed] = useState(!faviconUrl);

  useEffect(() => {
    setFailed(!faviconUrl);
  }, [faviconUrl]);

  return (
    <span className={`ai-website-link-icon ${!failed ? "has-favicon" : "fallback"}`}>
      {!failed ? (
        <img
          src={faviconUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : <Link2 size={17} />}
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
    isStreaming: false,
  };
}

function normalizeStoredSession(session = {}) {
  const messages = Array.isArray(session.messages)
    ? session.messages.map((message) => normalizeStoredMessage(message)).filter(Boolean)
    : [];
  return {
    id: session.id || `chat-${Date.now()}`,
    title: session.title || "New Chat",
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

function titleFrom(text) {
  const clean = String(text || "").trim().replace(/\s+/g, " ");
  if (!clean) return "Image analysis";
  return clean.length > 34 ? `${clean.slice(0, 34)}...` : clean;
}

function createMessageId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function textChunks(text) {
  const parts = String(text || "").match(/\S+\s*/g) || [String(text || "")];
  const chunks = [];
  for (let index = 0; index < parts.length; index += 5) {
    chunks.push(parts.slice(index, index + 5).join(""));
  }
  return chunks;
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
    return <span key={key}>{renderLinkifiedText(part.content, key)}</span>;
  });
}

function renderLinkifiedText(text, keyPrefix) {
  const value = String(text || "");
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|((?:https?:\/\/|www\.)[^\s<]+)/gi;
  const rendered = [];
  let cursor = 0;
  let match;
  while ((match = linkPattern.exec(value)) !== null) {
    if (match.index > cursor) rendered.push(value.slice(cursor, match.index));
    const markdownUrl = match[2] || "";
    const rawUrl = markdownUrl || match[3] || "";
    const trailing = markdownUrl ? "" : (rawUrl.match(/[\])},.!?;:]+$/)?.[0] || "");
    const cleanUrl = rawUrl.slice(0, rawUrl.length - trailing.length);
    const href = cleanUrl.startsWith("www.") ? `https://${cleanUrl}` : cleanUrl;
    let external = true;
    try {
      const parsed = new URL(href);
      external = parsed.hostname !== window.location.hostname && !/^(www\.)?prakashshop\.in$/i.test(parsed.hostname);
    } catch (_error) {
      external = true;
    }
    rendered.push(
      <a
        className={`ai-response-link ${external ? "external" : "internal"}`}
        href={href}
        key={`${keyPrefix}-link-${match.index}`}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer noopener" : undefined}
      >
        <span>{match[1] || cleanUrl}</span>
        {external ? <ArrowUpRight aria-hidden="true" size={14} /> : null}
      </a>,
    );
    if (trailing) rendered.push(trailing);
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) rendered.push(value.slice(cursor));
  return rendered.length ? rendered : value;
}

function FormattedMessage({ text }) {
  const lines = String(text || "").split(/\r?\n/);

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

export function ScienceAIPage() {
  const { items: cartItems } = useCart();
  const [chatState, setChatState] = useState(loadScienceAIState);
  const [input, setInput] = useState("");
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("pulse-ai-theme") || "dark");
  const [error, setError] = useState("");
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
  const streamTimer = useRef(null);
  const streamResolve = useRef(null);
  const streamScrollAt = useRef(0);
  const sessions = chatState.sessions;
  const session = useMemo(
    () => sessions.find((item) => item.id === chatState.activeSessionId) || sessions[0],
    [chatState.activeSessionId, sessions],
  );
  const messages = useMemo(() => session.messages || [welcomeMessage], [session.messages]);
  const hasStarted = useMemo(() => messages.some((message) => message.role === "user"), [messages]);
  const heroAnimationData = useScienceAIHeroAnimationData(!hasStarted);
  const visibleMessages = useMemo(
    () => (hasStarted ? messages.filter((message) => message.text !== welcomeMessage.text) : []),
    [hasStarted, messages],
  );
  const lastMessageId = visibleMessages[visibleMessages.length - 1]?.id || "";
  const isStreamingReply = useMemo(
    () => busy || visibleMessages.some((message) => message.isStreaming),
    [busy, visibleMessages],
  );
  const streamingTextLength = useMemo(() => {
    const streaming = visibleMessages.find((message) => message.isStreaming);
    return streaming ? String(streaming.text || "").length : 0;
  }, [visibleMessages]);

  // Scroll on send / new message only (not every stream chunk with smooth).
  useEffect(() => {
    if (!lastMessageId && !busy) return;
    endRef.current?.scrollIntoView({ behavior: isStreamingReply ? "auto" : "smooth" });
  }, [lastMessageId, busy, isStreamingReply]);

  // Throttled auto-scroll while text streams so the reply stays in view.
  useEffect(() => {
    if (!streamingTextLength) return;
    const now = Date.now();
    if (now - streamScrollAt.current < 220) return;
    streamScrollAt.current = now;
    endRef.current?.scrollIntoView({ behavior: "auto" });
  }, [streamingTextLength]);

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

    const updateMediaMenuPosition = () => {
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

    updateMediaMenuPosition();
    const frameId = window.requestAnimationFrame(updateMediaMenuPosition);

    const closeOnOutsideClick = (event) => {
      const target = event.target;
      if (uploadButtonRef.current?.contains(target) || mediaMenuRef.current?.contains(target)) return;
      setMediaMenuOpen(false);
    };

    window.addEventListener("resize", updateMediaMenuPosition);
    window.addEventListener("scroll", updateMediaMenuPosition, true);
    document.addEventListener("pointerdown", closeOnOutsideClick);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateMediaMenuPosition);
      window.removeEventListener("scroll", updateMediaMenuPosition, true);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [mediaMenuOpen]);

  useEffect(() => () => {
    if (streamTimer.current) window.clearInterval(streamTimer.current);
  }, []);

  const updateSessionById = (sessionId, updater) => {
    setChatState((current) => ({
      ...current,
      sessions: current.sessions.map((item) => (
        item.id === sessionId ? { ...updater(item), updatedAt: Date.now() } : item
      )),
    }));
  };

  const conversationHistory = useMemo(
    () => {
      const recentMessages = messages
        .filter((message) => !(message.role === "ai" && message.text === welcomeMessage.text))
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

  const stopStreaming = () => {
    if (streamTimer.current) {
      window.clearInterval(streamTimer.current);
      streamTimer.current = null;
    }
    if (streamResolve.current) {
      streamResolve.current();
      streamResolve.current = null;
    }
  };

  const closeNavOnMobile = () => {
    if (typeof window !== "undefined" && window.innerWidth <= 860) setNavOpen(false);
  };

  const revealAssistantMessage = ({ text, suggestions, linkCards = [], warning, memory, isError = false, targetSessionId = session.id }) => new Promise((resolve) => {
    stopStreaming();
    streamResolve.current = resolve;
    const id = createMessageId("ai");
    const chunks = textChunks(text);
    let index = 0;

    updateSessionById(targetSessionId, (targetSession) => ({
      ...targetSession,
      memory: memory ? normalizeConversationMemory(memory) : targetSession.memory,
      messages: [...targetSession.messages, { id, role: "ai", text: "", isStreaming: true, isError }],
    }));

    streamTimer.current = window.setInterval(() => {
      index += 1;
      const partial = chunks.slice(0, index).join("");
      const done = index >= chunks.length;

      updateSessionById(targetSessionId, (targetSession) => ({
        ...targetSession,
        messages: targetSession.messages.map((message) => (
          message.id === id
            ? {
                ...message,
                text: partial,
                isStreaming: !done,
                suggestions: done ? suggestions : [],
                linkCards: done ? normalizeLinkCards(linkCards) : [],
                warning: done ? warning : "",
              }
            : message
        )),
      }));

      if (done) {
        window.clearInterval(streamTimer.current);
        streamTimer.current = null;
        streamResolve.current = null;
        resolve();
      }
    }, 45);
  });

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
    stopStreaming();
    setBusy(false);
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

  const sendMessage = async (overrideText) => {
    const text = String(overrideText ?? input).trim();
    if ((!text && images.length === 0) || busy) return;

    const targetSessionId = session.id;
    const userMessage = { id: createMessageId("user"), role: "user", text, images };
    const shouldTitle = session.title === "New Chat";
    updateSessionById(targetSessionId, (targetSession) => ({
      ...targetSession,
      title: shouldTitle ? titleFrom(text) : targetSession.title,
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
        }),
      });
      const answer = response.data?.response || "I could not generate a response. Please try again.";
      const suggestions = response.data?.suggestions || [];
      const linkCards = normalizeLinkCards(response.data?.linkCards);
      const warning = response.data?.warning || "";
      const memory = response.data?.memory || null;
      await revealAssistantMessage({ text: answer, suggestions, linkCards, warning, memory, targetSessionId });
    } catch (err) {
      const message = err.message || "Pulse AI is unavailable right now.";
      setError(message);
      await revealAssistantMessage({ text: message, suggestions: [], linkCards: [], warning: "", isError: true, targetSessionId });
    } finally {
      setBusy(false);
    }
  };

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
            <span><Bot size={22} /></span>
            <strong>Pulse AI</strong>
          </a>
          <button type="button" className="ai-icon-button" onClick={() => setNavOpen(false)} aria-label="Hide menu">
            <PanelLeftClose size={18} />
          </button>
        </div>
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
            <p>Prakash Electronics assistant</p>
            <h1>{session.title === "New Chat" ? "Pulse AI" : session.title}</h1>
          </div>
          <button className="ai-theme-toggle" type="button" onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
        </header>

        <section className="ai-messages" aria-live="polite">
          {!hasStarted && <EmptyState animationData={heroAnimationData} />}

          {visibleMessages.map((message, index) => (
            <article className={`ai-message ${message.role} ${message.isError ? "error" : ""}`} key={message.id || `${message.role}-${index}`}>
              <div className="ai-avatar">{message.role === "user" ? "You" : <Bot size={18} />}</div>
              <div
                className={`ai-bubble-pro ${message.role === 'user' ? 'ai-bubble-user' : 'ai-bubble-ai'}${message.isError ? ' ai-bubble-error' : ''}`}
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
                  <FormattedMessage text={message.text} />
                </div>
                {message.isStreaming && (
                  <span className="ai-stream-cursor-pro" aria-hidden="true" />
                )}
                {message.warning && (
                  <small className="ai-response-warning-pro">
                    {message.warning}
                  </small>
                )}
                {!message.isStreaming && message.suggestions?.length > 0 && (
                  <div className="ai-suggestion-block">
                    <SuggestionCards suggestions={message.suggestions} />
                  </div>
                )}
                {!message.isStreaming && message.linkCards?.length > 0 && (
                  <WebsiteLinkCards links={message.linkCards} />
                )}
              </div>
       
            </article>
          ))}
          {busy && (
            <article className="ai-message ai">
              <div className="ai-avatar"><Bot size={18} /></div>
              <div className="ai-bubble typing"><span /><span /><span /></div>
            </article>
          )}
          <div ref={endRef} />
        </section>

        <footer className="science-ai-composer">
          {error && <div className="ai-error">{error}</div>}
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
          <Bot size={16} />
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

function SuggestionCards({ suggestions }) {
  const { addItem, getQuantity } = useCart();
  const availableSuggestions = (suggestions || []).filter((item) => item.available);
  if (!availableSuggestions.length) return null;

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

  return (
    <div className="ai-suggestions">
      <div className="ai-suggestions-head">
        <strong>Suggested for you</strong>
        <span>{availableSuggestions.length} available</span>
      </div>
      <div className="ai-suggestion-grid">
        {availableSuggestions.map((item) => (
          <article className="ai-suggestion-card" key={`${item.name}-${item.component}`}>
            <div className="ai-suggestion-image">
              {item.imageUrl ? <OptimizedImage src={item.imageUrl} alt={item.name} width={180} height={140} /> : <PackageSearch size={34} />}
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
              <p>{item.shortDescription}</p>
              <div className="ai-suggestion-actions">
                <a href={`/product/${encodeURIComponent(item.slug || item.productId)}`}>
                  View Product
                  <ArrowUpRight size={15} />
                </a>
                <button
                  className={`ai-cart-icon-button ${getQuantity(item, cartOverrides(item)) ? "added" : ""}`}
                  type="button"
                  onClick={() => addSuggestionToCart(item)}
                  aria-label={`Add ${item.name} to cart`}
                  title={getQuantity(item, cartOverrides(item)) ? `In cart (${getQuantity(item, cartOverrides(item))})` : "Add to cart"}
                  disabled={getQuantity(item, cartOverrides(item)) >= getCartStockLimit(cartOverrides(item))}
                >
                  {getQuantity(item, cartOverrides(item)) ? <Check size={16} /> : <ShoppingCart size={16} />}
                </button>
                <span>{item.category || "Component"}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function WebsiteLinkCards({ links }) {
  const safeLinks = normalizeLinkCards(links);
  if (!safeLinks.length) return null;

  return (
    <div className="ai-website-links" aria-label="Helpful website links">
      {safeLinks.map((link) => {
        const external = link.type === "external";
        return (
          <a
            className={`ai-website-link-card ${link.type}`}
            href={link.url}
            key={link.id || link.url}
            target={external && link.openInNewTab ? "_blank" : undefined}
            rel={external && link.openInNewTab ? "noreferrer noopener" : undefined}
            title={link.url}
          >
            <WebsiteLinkIcon link={link} />
            <span className="ai-website-link-copy">
              <strong>{link.title}</strong>
              {link.description ? <span>{link.description}</span> : null}
              <small title={link.url}>{link.url}</small>
            </span>
            <span className="ai-website-link-cta">
              {link.ctaLabel}
              <ArrowUpRight className="ai-website-link-arrow" size={15} />
            </span>
          </a>
        );
      })}
    </div>
  );
}
