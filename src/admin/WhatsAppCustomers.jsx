import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ArrowDown, ArrowLeft, Ban, FileText, Image as ImageIcon, MessageSquare, Paperclip, Search, Send, Trash2 } from "lucide-react";

const API_BASE = process.env.REACT_APP_API_URL || process.env.VITE_API_URL || "/api";
const inboxApi = "/whatsapp/admin/conversations";
const idOf = (item) => String(item?._id || item?.id || "");
const matchesSearch = (item, search) => [item.customerName, item.customerWaId, item.lastMessagePreview]
  .some((value) => (value || "").toLowerCase().includes(search.toLowerCase()));
const newestFirst = (a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0) || idOf(b).localeCompare(idOf(a));
const oldestFirst = (a, b) => new Date(a.createdAt) - new Date(b.createdAt) || idOf(a).localeCompare(idOf(b));
const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const formatDate = (formatter, value) => value && Number.isFinite(+new Date(value)) ? formatter.format(new Date(value)) : "";

function MessageText({ text }) {
  const parts = text.split(/(```[\s\S]+?```|https?:\/\/[^\s<>]+|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
  return <p className="wa-rich-text">{parts.map((part, i) => {
    if (/^```[\s\S]+```$/.test(part)) return <code key={i} className="wa-mono">{part.slice(3, -3)}</code>;
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a>;
    if (/^\*[^*]+\*$/.test(part)) return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^~[^~]+~$/.test(part)) return <s key={i}>{part.slice(1, -1)}</s>;
    return part;
  })}</p>;
}

const MessageBubble = memo(function MessageBubble({ message }) {
  const direction = message.direction === "outbound" ? "out" : "in";
  const reactions = new Map();
  for (const { emoji } of message.reactions || []) {
    if (emoji) reactions.set(emoji, (reactions.get(emoji) || 0) + 1);
  }
  const sender = { ai: "Pulse AI", admin: "Admin", system: "System" }[message.sender];
  return <div className={`wa-bubble-row ${direction}`}>
    <div className={`wa-bubble ${direction}`}>
      {["image", "interactive", "sticker"].includes(message.type) && message.mediaUrl && (
        <a href={message.mediaUrl} target="_blank" rel="noreferrer"><img src={message.mediaUrl} alt="Chat attachment" loading="lazy" /></a>
      )}
      {message.type === "document" && message.mediaUrl && (
        <a className="wa-doc-link" href={message.mediaUrl} target="_blank" rel="noreferrer"><FileText size={16} />{message.mediaFilename || "Document"}</a>
      )}
      {message.text ? <MessageText text={message.text} /> : !message.mediaUrl && <p>{message.mediaFilename || ({ audio: "Voice message", image: "Image", video: "Video", document: "Document", sticker: "Sticker" }[message.type] || "Message")}</p>}
      {reactions.size > 0 && <div className="wa-reactions" aria-label="Reactions">
        {[...reactions].map(([emoji, count]) => <span key={emoji}>{emoji}{count > 1 ? ` ${count}` : ""}</span>)}
      </div>}
      <small className={message.status === "failed" ? "wa-message-failed" : undefined}>
        {[sender, formatDate(timeFormat, message.createdAt), direction === "out" && message.status && message.status[0].toUpperCase() + message.status.slice(1)].filter(Boolean).join(" · ")}
      </small>
    </div>
  </div>;
});

function mergeMessages(previous, incoming) {
  const byId = new Map(previous.map((message) => [idOf(message), message]));
  for (const message of incoming) {
    const old = byId.get(idOf(message));
    byId.set(idOf(message), old && JSON.stringify(old) === JSON.stringify(message) ? old : { ...old, ...message });
  }
  const next = [...byId.values()].sort(oldestFirst);
  return next.length === previous.length && next.every((item, i) => item === previous[i]) ? previous : next;
}

function newerConversation(previous, incoming) {
  if (!previous) return incoming;
  const newer = new Date(incoming.updatedAt || 0) >= new Date(previous.updatedAt || 0) ? incoming : previous;
  return JSON.stringify(previous) === JSON.stringify(newer) ? previous : newer;
}

export default function WhatsAppCustomers({ apiFetch, accountId, accountSelect, uploadImage }) {
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState(null);
  const [listError, setListError] = useState(false);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState(null);
  const [threadError, setThreadError] = useState(false);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [newMessages, setNewMessages] = useState(false);
  const activeId = useRef("");
  const removedIds = useRef(new Set());
  const searchRef = useRef("");
  const listRequest = useRef(0);
  const listChanges = useRef(new Map());
  const threadRequest = useRef(0);
  const messageChanges = useRef(new Map());
  const sidebar = useRef(null);
  const sidebarScroll = useRef(0);
  const thread = useRef(null);
  const threadContent = useRef(null);
  const pinned = useRef(true);
  const previousTail = useRef("");
  const openAfterRefresh = useRef(false);
  const newestId = idOf(messages?.at(-1));
  const selectedId = idOf(active);

  const updateConversation = useCallback((incoming) => {
    const id = idOf(incoming);
    if (!id || removedIds.current.has(id)) return;
    listChanges.current.set(id, newerConversation(listChanges.current.get(id), incoming));
    if (activeId.current === id) setActive((prev) => idOf(prev) === id ? newerConversation(prev, incoming) : prev);
    setConversations((prev) => {
      if (!prev) return prev;
      const old = prev.find((item) => idOf(item) === id);
      const next = newerConversation(old, incoming);
      if (old === next || (!old && !matchesSearch(next, searchRef.current))) return prev;
      const others = prev.filter((item) => idOf(item) !== id);
      return matchesSearch(next, searchRef.current) ? [...others, next].sort(newestFirst).slice(0, 100) : others;
    });
  }, []);

  const closeChat = useCallback(() => {
    activeId.current = "";
    threadRequest.current += 1;
    setActive(null);
    setMessages(null);
    setComposer("");
    setNewMessages(false);
    setPendingAction(null);
  }, []);

  const removeConversation = useCallback((id) => {
    removedIds.current.add(id);
    listChanges.current.delete(id);
    setConversations((prev) => prev?.filter((item) => idOf(item) !== id) || prev);
    if (activeId.current === id) closeChat();
  }, [closeChat]);

  const loadConversations = useCallback(async () => {
    if (!accountId) return;
    const currentSearch = searchRef.current;
    const request = ++listRequest.current;
    listChanges.current.clear();
    try {
      const params = new URLSearchParams({ accountId, search: currentSearch });
      const response = await apiFetch(`${inboxApi}?${params}`);
      if (request !== listRequest.current || currentSearch !== searchRef.current) return;
      const changes = listChanges.current;
      const byId = new Map((response.data || []).map((item) => [idOf(item), item]));
      for (const [id, item] of changes) byId.set(id, newerConversation(byId.get(id), item));
      changes.clear();
      setConversations([...byId.values()].filter((item) => !removedIds.current.has(idOf(item)) && matchesSearch(item, currentSearch)).sort(newestFirst).slice(0, 100));
      setListError(false);
    } catch {
      if (request === listRequest.current) setListError(true);
    }
  }, [accountId, apiFetch]);

  const loadThread = useCallback(async (id, quiet = false) => {
    if (!id || id !== activeId.current) return;
    const request = ++threadRequest.current;
    messageChanges.current.clear();
    try {
      const response = await apiFetch(`${inboxApi}/${id}/messages`);
      if (activeId.current !== id || request !== threadRequest.current) return;
      updateConversation(response.data?.conversation);
      const changed = [...messageChanges.current.values()];
      const incoming = mergeMessages(response.data?.messages || [], changed);
      setMessages((prev) => mergeMessages(prev || [], incoming));
      setThreadError(false);
    } catch (error) {
      if (activeId.current !== id || request !== threadRequest.current) return;
      if (error.status === 404) removeConversation(id);
      else if (!quiet) setThreadError(true);
    }
  }, [apiFetch, removeConversation, updateConversation]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      searchRef.current = search.trim();
      void loadConversations();
    }, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [search, loadConversations]);

  useEffect(() => {
    if (!accountId) return undefined;
    let connected = false;
    let connectedBefore = false;
    let lastRefresh = Date.now();
    let source;
    const refresh = () => {
      lastRefresh = Date.now();
      void loadConversations();
      void loadThread(activeId.current, true);
    };
    const listen = (name, callback) => source.addEventListener(name, ({ data }) => {
      let payload;
      try { payload = JSON.parse(data).payload; } catch { return; }
      if (payload) callback(payload);
    });
    if (typeof EventSource !== "undefined") {
      const params = new URLSearchParams({ accountId });
      source = new EventSource(`${API_BASE}/whatsapp/admin/events?${params}`, { withCredentials: true });
      source.onopen = () => {
        connected = true;
        if (connectedBefore) refresh();
        connectedBefore = true;
      };
      source.onerror = () => { connected = false; };
      listen("whatsapp:conversation", ({ conversation }) => updateConversation(conversation));
      const receiveMessage = ({ conversation, message }) => {
        updateConversation(conversation);
        if (!activeId.current || String(message?.conversationId) !== activeId.current) return;
        messageChanges.current.set(idOf(message), message);
        setMessages((prev) => mergeMessages(prev || [], [message]));
      };
      listen("whatsapp:message", receiveMessage);
      listen("whatsapp:reaction", receiveMessage);
      listen("whatsapp:customer-deleted", ({ conversationId }) => removeConversation(String(conversationId)));
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden" && (!connected || Date.now() - lastRefresh >= 30_000)) refresh();
    }, 10000);
    document.addEventListener("visibilitychange", onVisibility);
    function onVisibility() {
      if (document.visibilityState === "visible" && Date.now() - lastRefresh >= 10000) refresh();
    }
    return () => {
      source?.close();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      listRequest.current += 1;
      threadRequest.current += 1;
    };
  }, [accountId, loadConversations, loadThread, removeConversation, updateConversation]);

  const jumpToLatest = useCallback(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
    pinned.current = true;
    setNewMessages(false);
  }, []);

  useLayoutEffect(() => {
    if (!newestId || newestId === previousTail.current) return;
    previousTail.current = newestId;
    if (pinned.current || openAfterRefresh.current) jumpToLatest();
    else setNewMessages(true);
    openAfterRefresh.current = false;
  }, [newestId, jumpToLatest]);

  useLayoutEffect(() => {
    if (!selectedId && sidebar.current) sidebar.current.scrollTop = sidebarScroll.current;
  }, [selectedId]);

  useEffect(() => {
    if (!threadContent.current || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => { if (pinned.current) jumpToLatest(); });
    observer.observe(threadContent.current);
    return () => observer.disconnect();
  }, [selectedId, jumpToLatest]);

  function openChat(conversation) {
    const id = idOf(conversation);
    if (activeId.current === id) return;
    if (sidebar.current) sidebarScroll.current = sidebar.current.scrollTop;
    activeId.current = id;
    pinned.current = true;
    previousTail.current = "";
    openAfterRefresh.current = true;
    setMessages(null);
    setThreadError(false);
    setNewMessages(false);
    setComposer("");
    setActive(conversation);
    void loadThread(id);
  }

  async function send(kind, value) {
    const id = activeId.current;
    if (!id || !value || active.blockedAt || sending || saving) return;
    setSending(true);
    try {
      let payload = { conversationId: id };
      if (kind === "text") payload.text = value;
      if (kind === "image") {
        const { url, publicId } = await uploadImage(value);
        payload = { ...payload, mediaUrl: url, mediaPublicId: publicId };
      }
      if (kind === "document") {
        const body = new FormData();
        body.append("document", value);
        const { data } = await apiFetch(`${inboxApi}/upload-document`, { method: "POST", body, timeout: 60000 });
        payload = { ...payload, mediaUrl: data.url, mediaPublicId: data.publicId, filename: data.filename || value.name, mediaMimeType: data.mimeType || value.type };
      }
      const { data } = await apiFetch(`${inboxApi}/send-${kind}`, { method: "POST", body: JSON.stringify(payload) });
      if (activeId.current !== id) return;
      if (kind === "text") setComposer((current) => current.trim() === value ? "" : current);
      if (data) {
        messageChanges.current.set(idOf(data), data);
        setMessages((prev) => mergeMessages(prev || [], [data]));
      }
      jumpToLatest();
      void loadThread(id, true);
    } catch (error) {
      toast.error(error.message || "Message could not be sent");
    } finally {
      setSending(false);
    }
  }

  async function updateCustomer(action) {
    const id = activeId.current;
    if (!id || saving || sending) return;
    setSaving(true);
    try {
      if (action === "delete") {
        await apiFetch(`${inboxApi}/${id}`, { method: "DELETE" });
        removeConversation(id);
        toast.success("Chat deleted");
      } else {
        const takeover = !active.humanTakeover;
        const blocked = action === "block";
        const { data } = await apiFetch(`${inboxApi}/${id}${action === "takeover" ? "" : "/block"}`, {
          method: "PATCH", body: JSON.stringify(action === "takeover" ? { humanTakeover: takeover, aiEnabled: !takeover } : { blocked }),
        });
        updateConversation(data);
        if (action !== "takeover") toast.success(blocked ? "Customer blocked" : "Customer unblocked");
      }
      setPendingAction(null);
    } catch (error) {
      if (error.status === 404) removeConversation(id);
      toast.error(error.message || "Customer could not be updated");
    } finally {
      setSaving(false);
    }
  }

  const disabled = sending || saving || Boolean(active?.blockedAt);
  return <section className="wa-panel glass-panel wa-inbox">
    <div className="wa-panel-toolbar"><h2>Customers</h2></div>
    {!accountId ? <div className="wa-empty">Add an account first.</div> : (
      <div className={`wa-customer-layout${active ? " has-active-chat" : ""}`}>
        <div className="wa-customer-sidebar">
          <div className="wa-inbox-toolbar">
            {accountSelect}
            <label className="wa-search-field"><Search size={16} aria-hidden="true" /><input className="wa-search" aria-label="Search customers" placeholder="Search name or number" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          </div>
          {listError && <div className="wa-inbox-notice">Couldn’t refresh customers. <button type="button" onClick={loadConversations}>Retry</button></div>}
          <div className="wa-inbox-list" aria-label="Customer chats" ref={sidebar} onScroll={(event) => { sidebarScroll.current = event.currentTarget.scrollTop; }}>
            {!conversations ? !listError && <p className="wa-inbox-notice">Loading customers…</p> : conversations.length === 0 ? (
              <p className="wa-inbox-notice">{search.trim() ? "No customers match your search." : "No customers yet."}</p>
            ) : conversations.map((conversation) => {
              const id = idOf(conversation);
              return <button type="button" key={id} className="wa-chat-row" aria-current={id === selectedId ? "true" : undefined} onClick={() => openChat(conversation)}>
                <span className="wa-chat-avatar" aria-hidden="true">{(conversation.customerName || conversation.customerWaId || "?").slice(0, 1).toUpperCase()}</span>
                <span className="wa-chat-row-body">
                  <span className="wa-chat-row-top"><strong>{conversation.customerName || conversation.customerWaId}</strong><time dateTime={conversation.lastMessageAt}>{formatDate(dayFormat, conversation.lastMessageAt)}</time></span>
                  <span className="wa-chat-row-preview"><span>{conversation.lastMessagePreview || "No messages yet"}</span>{conversation.blockedAt ? <Ban size={15} aria-label="Blocked" /> : conversation.unreadCount > 0 && <em aria-label={`${conversation.unreadCount} unread`}>{conversation.unreadCount}</em>}</span>
                </span>
              </button>;
            })}
          </div>
        </div>
        {active ? <div className="wa-chat-pane">
          <header className="wa-chat-header">
            <button type="button" className="wa-icon-btn wa-chat-back" aria-label="Back to customers" onClick={closeChat}><ArrowLeft size={18} /></button>
            <div className="wa-chat-heading">
              <h3>{active.customerName || active.customerWaId}</h3>
              <span>{active.customerWaId}{active.blockedAt ? " · Blocked" : active.humanTakeover ? " · AI paused" : ""}</span>
            </div>
            <div className="wa-chat-header-actions">
              {!active.blockedAt && <button type="button" className="wa-secondary" disabled={sending || saving} onClick={() => updateCustomer("takeover")}>{active.humanTakeover ? "Resume AI" : "Take over"}</button>}
              <button type="button" className="wa-icon-btn" disabled={sending || saving} title={active.blockedAt ? "Unblock customer" : "Block customer"} aria-label={active.blockedAt ? "Unblock customer" : "Block customer"} onClick={() => setPendingAction(active.blockedAt ? "unblock" : "block")}><Ban size={17} /></button>
              <button type="button" className="wa-icon-btn wa-delete-chat" disabled={sending || saving} title="Delete customer" aria-label="Delete customer" onClick={() => setPendingAction("delete")}><Trash2 size={17} /></button>
            </div>
          </header>
          <div className="wa-chat-body">
            <div className="wa-chat-thread" ref={thread} onScroll={(event) => {
              const view = event.currentTarget;
              pinned.current = view.scrollHeight - view.scrollTop - view.clientHeight < 72;
              if (pinned.current) setNewMessages(false);
            }}>
              <div ref={threadContent}>
                {threadError && <div className="wa-inbox-notice">Couldn’t load messages. <button type="button" onClick={() => loadThread(selectedId)}>Retry</button></div>}
                {!messages ? !threadError && <p className="wa-inbox-notice">Loading messages…</p> : messages.length === 0 ? <p className="wa-inbox-notice">No messages yet.</p> : messages.map((message, i) => {
                  const day = formatDate(dayFormat, message.createdAt);
                  const previousDay = formatDate(dayFormat, messages[i - 1]?.createdAt);
                  return <Fragment key={idOf(message)}>{day && day !== previousDay && <div className="wa-chat-date"><time dateTime={message.createdAt}>{day}</time></div>}<MessageBubble message={message} /></Fragment>;
                })}
              </div>
            </div>
            {newMessages && <button type="button" className="wa-jump-latest" onClick={jumpToLatest}><ArrowDown size={15} /> New messages</button>}
          </div>
          {active.blockedAt ? <div className="wa-blocked-notice"><Ban size={16} /> Unblock this customer to reply.</div> : (
            <form className="wa-composer" onSubmit={(event) => { event.preventDefault(); void send("text", composer.trim()); }}>
              {[{ kind: "image", label: "Attach image", accept: "image/*", Icon: ImageIcon }, { kind: "document", label: "Attach document", accept: ".pdf,.doc,.docx,.txt,application/pdf", Icon: Paperclip }].map(({ kind, label, accept, Icon }) => (
                <label className="wa-composer-icon" key={kind} title={label}><Icon size={18} /><input aria-label={label} type="file" accept={accept} disabled={disabled} onChange={(event) => { void send(kind, event.target.files?.[0]); event.target.value = ""; }} /></label>
              ))}
              <textarea aria-label="Message" placeholder="Type a message" rows={1} value={composer} onChange={(event) => setComposer(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send("text", composer.trim()); }
              }} />
              <button type="submit" className="wa-send" disabled={disabled || !composer.trim()} aria-label="Send message"><Send size={17} /></button>
            </form>
          )}
        </div> : <div className="wa-chat-placeholder"><MessageSquare size={26} aria-hidden="true" /><p>Select a customer to open their chat.</p></div>}
      </div>
    )}
    {pendingAction && active && <div className="wa-modal-layer" role="dialog" aria-modal="true" aria-labelledby="wa-customer-action-title" onKeyDown={(event) => {
      if (event.key === "Escape" && !saving) setPendingAction(null);
    }}>
      <button type="button" className="wa-modal-backdrop" aria-label="Cancel" disabled={saving} onClick={() => setPendingAction(null)} />
      <div className="wa-modal wa-customer-confirm">
        <h3 id="wa-customer-action-title">{{ delete: "Delete customer chat?", block: "Block customer?", unblock: "Unblock customer?" }[pendingAction]}</h3>
        <p>{{ delete: "This removes the chat, saved memory and any inbox block. Their next message starts a new chat and can receive the greeting again. Orders and repair records stay linked to their original references.", block: "Pulse AI will ignore new messages and reject incoming calls from this customer on this account. You can unblock them here at any time.", unblock: "This customer can message and call the business again." }[pendingAction]}</p>
        <div className="wa-modal-actions">
          <button type="button" className="wa-secondary" disabled={saving} onClick={() => setPendingAction(null)} autoFocus>Cancel</button>
          <button type="button" className={pendingAction === "unblock" ? "wa-primary" : "wa-danger"} disabled={saving} onClick={() => updateCustomer(pendingAction)}>{{ delete: "Delete chat", block: "Block", unblock: "Unblock" }[pendingAction]}</button>
        </div>
      </div>
    </div>}
  </section>;
}
