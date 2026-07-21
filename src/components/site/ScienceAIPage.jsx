import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Bot, Camera, Check, ChevronDown, Cpu, ImagePlus, Images, Moon, PackageSearch, PanelLeftClose, PanelLeftOpen, Plus, Send, ShoppingCart, Sun, Trash2 } from "lucide-react";
import { apiRequest } from "../../api/client";
import { SCIENCE_PROJECTS_CATEGORY, getCartStockLimit, useCart } from "../../context/CartContext";
import { LottieSvgAnimation } from "./LottieSvgAnimation";
import { OptimizedImage } from "./OptimizedImage";

const welcomeMessage = {
  role: "ai",
  text: "Hello, I am Science AI. Tell me your project idea or upload component photos, and I will guide the build and suggest matching shop parts.",
};

const SCIENCE_AI_SESSION_KEY = "prakash:science-ai-session:v2";

function useScienceAIHeroAnimationData() {
  const [animationData, setAnimationData] = useState(null);

  useEffect(() => {
    let mounted = true;

    fetch(`/hero.json?v=${Date.now()}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (mounted) setAnimationData(data);
      })
      .catch(() => {
        if (mounted) setAnimationData(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return animationData;
}

function createSession() {
  const id = `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, title: "New Chat", messages: [welcomeMessage], createdAt: Date.now(), updatedAt: Date.now() };
}

function normalizeStoredMessage(message = {}, keepImages = true) {
  return {
    id: message.id || createMessageId(message.role === "user" ? "user" : "ai"),
    role: message.role === "user" ? "user" : "ai",
    text: String(message.text || ""),
    images: keepImages
      ? (message.images || []).slice(0, 5).map((image) => ({
          id: image.id || image.name || image.preview,
          name: image.name || "Uploaded image",
          preview: image.preview || "",
          base64: image.base64 || "",
          mimeType: image.mimeType || "image/jpeg",
        })).filter((image) => image.preview || image.base64)
      : [],
    suggestions: Array.isArray(message.suggestions) ? message.suggestions : [],
    warning: message.warning || "",
    isError: Boolean(message.isError),
    isStreaming: false,
  };
}

function normalizeStoredSession(session = {}, keepImages = true) {
  const messages = Array.isArray(session.messages)
    ? session.messages.map((message) => normalizeStoredMessage(message, keepImages)).filter(Boolean)
    : [];
  return {
    id: session.id || `chat-${Date.now()}`,
    title: session.title || "New Chat",
    messages: messages.length ? messages : [welcomeMessage],
    createdAt: session.createdAt || Date.now(),
    updatedAt: session.updatedAt || Date.now(),
  };
}

function loadScienceAISession() {
  if (typeof window === "undefined") return createSession();
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SCIENCE_AI_SESSION_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return createSession();
    return normalizeStoredSession(parsed);
  } catch (_error) {
    return createSession();
  }
}

function saveScienceAISession(session) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SCIENCE_AI_SESSION_KEY, JSON.stringify(normalizeStoredSession(session)));
  } catch (_error) {
    try {
      window.sessionStorage.setItem(SCIENCE_AI_SESSION_KEY, JSON.stringify(normalizeStoredSession(session, false)));
    } catch (__error) {
      // Session storage can be unavailable or full; chat still works in memory.
    }
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

function priceLabel(price) {
  return price === null || price === undefined || price === "" ? "Price on request" : `Rs. ${Number(price).toLocaleString("en-IN")}`;
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
    return <span key={key}>{part.content}</span>;
  });
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
  const [session, setSession] = useState(loadScienceAISession);
  const [input, setInput] = useState("");
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("science-ai-theme") || "dark");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [navOpen, setNavOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth > 860));
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const [mediaMenuPosition, setMediaMenuPosition] = useState({ left: -9999, top: -9999 });
  const heroAnimationData = useScienceAIHeroAnimationData();
  const endRef = useRef(null);
  const textareaRef = useRef(null);
  const uploadButtonRef = useRef(null);
  const mediaMenuRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const dragDepth = useRef(0);
  const streamTimer = useRef(null);
  const streamResolve = useRef(null);
  const messages = useMemo(() => session.messages || [welcomeMessage], [session.messages]);
  const hasStarted = useMemo(() => messages.some((message) => message.role === "user"), [messages]);
  const visibleMessages = useMemo(
    () => (hasStarted ? messages.filter((message) => message.text !== welcomeMessage.text) : []),
    [hasStarted, messages],
  );
  const messageScrollKey = useMemo(
    () => visibleMessages.map((message) => `${message.id || ""}:${String(message.text || "").length}`).join("|"),
    [visibleMessages],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageScrollKey, busy]);

  useEffect(() => {
    saveScienceAISession(session);
  }, [session]);

  useEffect(() => {
    localStorage.setItem("science-ai-theme", theme);
  }, [theme]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 156)}px`;
  }, [input]);

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

  const updateActiveSession = (updater) => {
    setSession((current) => ({ ...updater(current), updatedAt: Date.now() }));
  };

  const conversationHistory = useMemo(
    () =>
      messages
        .filter((message) => !(message.role === "ai" && message.text === welcomeMessage.text))
        .slice(-12)
        .map((message) => ({
          role: message.role === "user" ? "user" : "ai",
          text: message.text,
          images: (message.images || [])
            .filter((image) => image.base64)
            .map((image) => ({ base64: image.base64, mimeType: image.mimeType })),
        })),
    [messages],
  );

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

  const revealAssistantMessage = ({ text, suggestions, warning, isError = false }) => new Promise((resolve) => {
    stopStreaming();
    streamResolve.current = resolve;
    const id = createMessageId("ai");
    const chunks = textChunks(text);
    let index = 0;

    updateActiveSession((session) => ({
      ...session,
      messages: [...session.messages, { id, role: "ai", text: "", isStreaming: true, isError }],
    }));

    streamTimer.current = window.setInterval(() => {
      index += 1;
      const partial = chunks.slice(0, index).join("");
      const done = index >= chunks.length;

      updateActiveSession((session) => ({
        ...session,
        messages: session.messages.map((message) => (
          message.id === id
            ? {
                ...message,
                text: partial,
                isStreaming: !done,
                suggestions: done ? suggestions : [],
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
    stopStreaming();
    setBusy(false);
    setSession(createSession());
    setInput("");
    setImages([]);
    setError("");
    closeNavOnMobile();
  };

  const deleteChat = () => {
    stopStreaming();
    setBusy(false);
    setSession((current) => ({ ...current, title: "New Chat", messages: [welcomeMessage], updatedAt: Date.now() }));
    setInput("");
    setImages([]);
    setError("");
    closeNavOnMobile();
  };

  const sendMessage = async () => {
    const text = input.trim();
    if ((!text && images.length === 0) || busy) return;

    const userMessage = { id: createMessageId("user"), role: "user", text, images };
    const shouldTitle = session.title === "New Chat";
    updateActiveSession((session) => ({
      ...session,
      title: shouldTitle ? titleFrom(text) : session.title,
      messages: [...session.messages, userMessage],
    }));
    setInput("");
    setImages([]);
    setBusy(true);
    setError("");

    try {
      const response = await apiRequest("/science-ai/chat", {
        method: "POST",
        timeout: 45000,
        body: JSON.stringify({
          message: text,
          images: images.map((image) => ({ base64: image.base64, mimeType: image.mimeType })),
          conversationHistory,
        }),
      });
      const answer = response.data?.response || "I could not generate a response. Please try again.";
      const suggestions = response.data?.suggestions || [];
      const warning = response.data?.warning || "";
      await revealAssistantMessage({ text: answer, suggestions, warning });
    } catch (err) {
      const message = err.message || "Science AI is unavailable right now.";
      setError(message);
      await revealAssistantMessage({ text: message, suggestions: [], warning: "", isError: true });
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
        onDragEnter={onDragEnter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragging && <div className="ai-drop-overlay"><ImagePlus size={34} /> Drop images anywhere</div>}

        {navOpen && <button className="ai-sidebar-scrim" type="button" aria-label="Close menu" onClick={() => setNavOpen(false)} />}

      <aside className="science-ai-sidebar">
        <div className="ai-sidebar-head">
          <a className="ai-brand" href="/projects-parts">
            <span><Bot size={22} /></span>
            <strong>Science AI</strong>
          </a>
          <button type="button" className="ai-icon-button" onClick={() => setNavOpen(false)} aria-label="Hide menu">
            <PanelLeftClose size={18} />
          </button>
        </div>
        <button type="button" onClick={newChat}><Plus size={16} /> New Chat</button>
        <button type="button" onClick={deleteChat} className="ai-delete-chat"><Trash2 size={16} /> Delete Chat</button>
        <div className="ai-session-list single">
          <div className="ai-session-item active">
            <span>{session.title}</span>
            <small>Saved in this tab. Clears when the tab is closed.</small>
          </div>
        </div>
        <div className="ai-sidebar-card">
          <span>Smart suggestions</span>
          <strong>Ask for project parts and I will match shop components automatically.</strong>
        </div>
      </aside>

      <main className="science-ai-chat">
        <header className="science-ai-topbar">
          <button className="ai-nav-toggle" type="button" onClick={() => setNavOpen((current) => !current)} aria-label={navOpen ? "Hide menu" : "Show menu"}>
            {navOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
          </button>
          <div className="ai-title-block">
            <p>Prakash Electronics assistant</p>
            <h1>{session.title === "New Chat" ? "Science AI" : session.title}</h1>
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
              <div className="ai-bubble">
                {message.images?.length > 0 && (
                  <div className="ai-message-images">
                    {message.images.filter((image) => image.preview).map((image) => <img src={image.preview} alt={image.name || "Uploaded"} key={image.id || image.preview} />)}
                  </div>
                )}
                <FormattedMessage text={message.text} />
                {message.isStreaming && <span className="ai-stream-cursor" aria-hidden="true" />}
                {message.warning && <small className="ai-response-warning">{message.warning}</small>}
                {!message.isStreaming && message.suggestions?.length > 0 && <SuggestionCards suggestions={message.suggestions} />}
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
          <div className="composer-row">
            <div className={`ai-media-picker ${mediaMenuOpen ? "open" : ""}`}>
              <button
                ref={uploadButtonRef}
                className="image-upload-button"
                type="button"
                onClick={() => setMediaMenuOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={mediaMenuOpen}
                aria-label="Add photo"
              >
                <ImagePlus size={20} />
                <ChevronDown size={14} />
              </button>
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
            <textarea
              ref={textareaRef}
              value={input}
              placeholder="Ask about Products..."
              rows={1}
              wrap="soft"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button type="button" onClick={sendMessage} disabled={busy || uploading || (!input.trim() && images.length === 0)} aria-label="Send message">
              <Send size={20} />
            </button>
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
        <h2>Science AI</h2>
        <p>
          Science AI is your smart project partner for school models.
        </p>
      </div>

      <div className="ai-empty-visual" aria-hidden="true">
        <div className="ai-empty-animation-shell">
          {animationData ? (
            <LottieSvgAnimation
              data={animationData}
              title="Science AI animation"
              className="ai-empty-lottie"
            />
          ) : (
            <div className="ai-empty-lottie ai-empty-lottie-loading" />
          )}
        </div>
        <div className="ai-empty-badge ai-empty-badge-top">
          <Bot size={16} />
          <span>AI Project Guide</span>
        </div>
        <div className="ai-empty-badge ai-empty-badge-bottom">
          <Cpu size={16} />
          <span>Parts Match</span>
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
    addItem(item, cartOverrides(item));
  };

  return (
    <div className="ai-suggestions">
      <div className="ai-suggestions-head">
        <strong>Suggested parts</strong>
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
                <strong>{priceLabel(item.price)}</strong>
              </div>
              <h3>{item.name}</h3>
              <small>{item.component}</small>
              <p>{item.shortDescription}</p>
              <div className="ai-suggestion-actions">
                <a href={`/product-detail/${encodeURIComponent(item.productId || item.slug)}`}>
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
