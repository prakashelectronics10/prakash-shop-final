import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  Bot,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import "./ManageWhatsAppModule.css";

const TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "greeting", label: "Greeting" },
  { id: "ai", label: "AI replies" },
  { id: "customers", label: "Customers" },
];

const BUTTON_TYPES = [
  { value: "url", label: "Go Now (URL)" },
  { value: "copy_code", label: "Copy code" },
  { value: "quick_reply", label: "Quick reply" },
];

const emptyAccountForm = () => ({
  label: "",
  phoneNumberId: "",
  businessAccountId: "",
  displayPhoneNumber: "",
  accessToken: "",
  isActive: true,
  notes: "",
});

const emptyButton = () => ({
  id: `btn_${Date.now()}`,
  type: "url",
  label: "Go Now",
  url: "",
  code: "",
  payload: "",
});

const emptyGreetingMessage = () => ({
  id: `msg_${Date.now()}`,
  type: "text",
  bodyText: "",
  footerText: "",
  imageUrl: "",
  imagePublicId: "",
  imageSourceUrl: "",
  imageUrls: [],
  imagePublicIds: [],
  buttons: [],
});

const emptyGreeting = () => ({
  enabled: true,
  enableWelcomeMessage: true,
  iceBreakers: ["View offers", "Book a repair", "Shop products"],
  messages: [emptyGreetingMessage()],
});

const emptyAI = () => ({
  enabled: true,
  systemPromptExtra: "",
  sendProductImages: true,
  sendOfferImages: true,
  maxImagesPerReply: 3,
  allowButtons: true,
  pauseOnHumanReply: true,
});

function Field({ label, hint, children }) {
  return (
    <div className="wa-field">
      <label>
        {label}
        {hint ? <em> — {hint}</em> : null}
      </label>
      {children}
    </div>
  );
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ManageWhatsAppModule({ apiFetch }) {
  const [tab, setTab] = useState("accounts");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [envDefaults, setEnvDefaults] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm());

  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [greeting, setGreeting] = useState(emptyGreeting());
  const [greetingLoading, setGreetingLoading] = useState(false);
  const [aiSettings, setAISettings] = useState(emptyAI());
  const [aiLoading, setAILoading] = useState(false);

  const [conversations, setConversations] = useState([]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [composer, setComposer] = useState("");
  const chatEndRef = useRef(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/whatsapp/admin/accounts");
      const list = response.data?.accounts || [];
      setAccounts(list);
      setEnvDefaults(response.data?.envDefaults || null);
      setSelectedAccountId((current) => current || list[0]?._id || list[0]?.id || "");
    } catch (error) {
      toast.error(error.message || "Unable to load WhatsApp accounts");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const loadGreeting = useCallback(async (accountId) => {
    if (!accountId) {
      setGreeting(emptyGreeting());
      return;
    }
    setGreetingLoading(true);
    try {
      const response = await apiFetch(`/whatsapp/admin/greeting?accountId=${encodeURIComponent(accountId)}`);
      if (response.data) {
        setGreeting({
          enabled: response.data.enabled !== false,
          enableWelcomeMessage: response.data.enableWelcomeMessage !== false,
          iceBreakers: response.data.iceBreakers?.length
            ? response.data.iceBreakers
            : ["View offers", "Book a repair", "Shop products"],
          messages: response.data.messages?.length
            ? response.data.messages
            : [emptyGreetingMessage()],
        });
      } else {
        setGreeting(emptyGreeting());
      }
    } catch (error) {
      toast.error(error.message || "Unable to load greeting");
      setGreeting(emptyGreeting());
    } finally {
      setGreetingLoading(false);
    }
  }, [apiFetch]);

  const loadAI = useCallback(async (accountId) => {
    if (!accountId) {
      setAISettings(emptyAI());
      return;
    }
    setAILoading(true);
    try {
      const response = await apiFetch(`/whatsapp/admin/ai-settings?accountId=${encodeURIComponent(accountId)}`);
      setAISettings(response.data ? { ...emptyAI(), ...response.data } : emptyAI());
    } catch (error) {
      toast.error(error.message || "Unable to load AI settings");
      setAISettings(emptyAI());
    } finally {
      setAILoading(false);
    }
  }, [apiFetch]);

  const loadConversations = useCallback(async (accountId, search = "") => {
    if (!accountId) {
      setConversations([]);
      return;
    }
    setConversationsLoading(true);
    try {
      const query = new URLSearchParams({ accountId, search });
      const response = await apiFetch(`/whatsapp/admin/conversations?${query.toString()}`);
      setConversations(response.data || []);
    } catch (error) {
      toast.error(error.message || "Unable to load customers");
    } finally {
      setConversationsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (!selectedAccountId) return;
    if (tab === "greeting") loadGreeting(selectedAccountId);
    if (tab === "ai") loadAI(selectedAccountId);
    if (tab === "customers") loadConversations(selectedAccountId, conversationSearch);
  }, [tab, selectedAccountId, loadGreeting, loadAI, loadConversations, conversationSearch]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeConversation]);

  const openCreateModal = () => {
    setEditingId(null);
    setAccountForm(emptyAccountForm());
    setModalOpen(true);
  };

  const openEditModal = (account) => {
    setEditingId(account._id || account.id);
    setAccountForm({
      label: account.label || "",
      phoneNumberId: account.phoneNumberId || "",
      businessAccountId: account.businessAccountId || "",
      displayPhoneNumber: account.displayPhoneNumber || "",
      accessToken: "",
      isActive: account.isActive !== false,
      notes: account.notes || "",
    });
    setModalOpen(true);
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (editingId) {
        const payload = { ...accountForm };
        if (!payload.accessToken) delete payload.accessToken;
        await apiFetch(`/whatsapp/admin/accounts/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("Account updated");
      } else {
        await apiFetch("/whatsapp/admin/accounts", {
          method: "POST",
          body: JSON.stringify(accountForm),
        });
        toast.success("Account added");
      }
      setModalOpen(false);
      await loadAccounts();
    } catch (error) {
      toast.error(error.message || "Unable to save account");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async (account) => {
    const id = account._id || account.id;
    if (!window.confirm(`Remove WhatsApp account “${account.label}”?`)) return;
    setBusy(true);
    try {
      await apiFetch(`/whatsapp/admin/accounts/${id}`, { method: "DELETE" });
      toast.success("Account removed");
      if (selectedAccountId === id) setSelectedAccountId("");
      await loadAccounts();
    } catch (error) {
      toast.error(error.message || "Unable to delete account");
    } finally {
      setBusy(false);
    }
  };

  const importFromEnv = async () => {
    setBusy(true);
    try {
      const response = await apiFetch("/whatsapp/admin/accounts/import-env", { method: "POST" });
      toast.success(response.imported ? "Imported account from .env" : "Account already exists");
      await loadAccounts();
    } catch (error) {
      toast.error(error.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file) => {
    const formData = new FormData();
    formData.append("image", file);
    const response = await apiFetch("/admin/upload/image", {
      method: "POST",
      body: formData,
      timeout: 45000,
    });
    return {
      url: response.data?.url || "",
      publicId: response.data?.publicId || "",
    };
  };

  const saveGreeting = async (event) => {
    event.preventDefault();
    if (!selectedAccountId) return toast.error("Select an account first");
    setBusy(true);
    try {
      const response = await apiFetch("/whatsapp/admin/greeting", {
        method: "PUT",
        body: JSON.stringify({ accountId: selectedAccountId, ...greeting }),
      });
      toast.success("Greeting saved");
      if (response.warning) toast(response.warning, { icon: "⚠️" });
      await loadGreeting(selectedAccountId);
    } catch (error) {
      toast.error(error.message || "Unable to save greeting");
    } finally {
      setBusy(false);
    }
  };

  const saveAI = async (event) => {
    event.preventDefault();
    if (!selectedAccountId) return toast.error("Select an account first");
    setBusy(true);
    try {
      await apiFetch("/whatsapp/admin/ai-settings", {
        method: "PUT",
        body: JSON.stringify({ accountId: selectedAccountId, ...aiSettings }),
      });
      toast.success("AI settings saved");
    } catch (error) {
      toast.error(error.message || "Unable to save AI settings");
    } finally {
      setBusy(false);
    }
  };

  const openConversation = async (conversation) => {
    setActiveConversation(conversation);
    setMessagesLoading(true);
    try {
      const response = await apiFetch(`/whatsapp/admin/conversations/${conversation._id || conversation.id}/messages`);
      setActiveConversation(response.data?.conversation || conversation);
      setMessages(response.data?.messages || []);
      await loadConversations(selectedAccountId, conversationSearch);
    } catch (error) {
      toast.error(error.message || "Unable to open chat");
    } finally {
      setMessagesLoading(false);
    }
  };

  const sendText = async (event) => {
    event?.preventDefault?.();
    if (!activeConversation || !composer.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/whatsapp/admin/conversations/send-text", {
        method: "POST",
        body: JSON.stringify({
          conversationId: activeConversation._id || activeConversation.id,
          text: composer.trim(),
        }),
      });
      setComposer("");
      await openConversation(activeConversation);
    } catch (error) {
      toast.error(error.message || "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const sendImageFile = async (file) => {
    if (!activeConversation || !file) return;
    setBusy(true);
    try {
      const uploaded = await uploadImage(file);
      await apiFetch("/whatsapp/admin/conversations/send-image", {
        method: "POST",
        body: JSON.stringify({
          conversationId: activeConversation._id || activeConversation.id,
          mediaUrl: uploaded.url,
          mediaPublicId: uploaded.publicId,
        }),
      });
      await openConversation(activeConversation);
    } catch (error) {
      toast.error(error.message || "Image send failed");
    } finally {
      setBusy(false);
    }
  };

  const sendDocumentFile = async (file) => {
    if (!activeConversation || !file) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("document", file);
      const uploaded = await apiFetch("/whatsapp/admin/conversations/upload-document", {
        method: "POST",
        body: formData,
        timeout: 60000,
      });
      await apiFetch("/whatsapp/admin/conversations/send-document", {
        method: "POST",
        body: JSON.stringify({
          conversationId: activeConversation._id || activeConversation.id,
          mediaUrl: uploaded.data?.url,
          filename: uploaded.data?.filename || file.name,
          mediaPublicId: uploaded.data?.publicId || "",
          mediaMimeType: uploaded.data?.mimeType || file.type,
        }),
      });
      await openConversation(activeConversation);
    } catch (error) {
      toast.error(error.message || "Document send failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleTakeover = async (humanTakeover) => {
    if (!activeConversation) return;
    try {
      const response = await apiFetch(`/whatsapp/admin/conversations/${activeConversation._id || activeConversation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ humanTakeover, aiEnabled: !humanTakeover }),
      });
      setActiveConversation(response.data);
      toast.success(humanTakeover ? "AI paused — you are replying" : "AI replies enabled");
    } catch (error) {
      toast.error(error.message || "Unable to update chat mode");
    }
  };

  const updateGreetingMessage = (index, patch) => {
    setGreeting((current) => ({
      ...current,
      messages: current.messages.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const selectedAccount = useMemo(
    () => accounts.find((item) => String(item._id || item.id) === String(selectedAccountId)),
    [accounts, selectedAccountId],
  );

  const AccountSelect = (
    <div className="wa-greeting-select">
      <label htmlFor="wa-account-select">WhatsApp account</label>
      <select
        id="wa-account-select"
        value={selectedAccountId}
        onChange={(event) => setSelectedAccountId(event.target.value)}
      >
        {accounts.map((account) => {
          const id = account._id || account.id;
          return (
            <option key={id} value={id}>
              {account.label}
              {account.displayPhoneNumber ? ` (${account.displayPhoneNumber})` : ""}
            </option>
          );
        })}
      </select>
    </div>
  );

  return (
    <div className="wa-module">
      <div className="wa-module-header">
        <div>
          <h1>Manage WhatsApp</h1>
          <p>Accounts, greeting sequences, AI replies, and customer inbox.</p>
        </div>
        <div className="wa-tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "accounts" && (
        <section className="wa-panel glass-panel">
          <div className="wa-panel-toolbar">
            <h2>WhatsApp business accounts</h2>
            <div className="wa-toolbar-actions">
              {envDefaults?.hasPhoneNumberId ? (
                <button type="button" className="wa-secondary" disabled={busy} onClick={importFromEnv}>
                  Import from .env
                </button>
              ) : null}
              <button type="button" className="wa-primary" disabled={busy} onClick={openCreateModal}>
                <Plus size={16} /> Add account
              </button>
            </div>
          </div>
          {envDefaults ? (
            <p className="wa-env-note">
              Webhook: <strong>https://prakashshop.in{envDefaults.callbackPath}</strong>
              {" · "}
              Messaging {envDefaults.enabled ? "enabled" : "set WHATSAPP_ENABLED=true"}
            </p>
          ) : null}
          {loading ? (
            <div className="wa-empty"><LoaderCircle size={22} /> Loading…</div>
          ) : accounts.length === 0 ? (
            <div className="wa-empty">No accounts yet. Add WABA + Phone Number ID + token.</div>
          ) : (
            <div className="wa-account-list">
              {accounts.map((account) => {
                const id = account._id || account.id;
                return (
                  <article key={id} className="wa-account-card">
                    <div>
                      <h3>{account.label}</h3>
                      <div className="wa-account-meta">
                        <span className={`wa-badge ${account.isActive ? "on" : "off"}`}>
                          {account.isActive ? "Active" : "Inactive"}
                        </span>
                        <span>Phone ID · {account.phoneNumberId}</span>
                        <span>WABA · {account.businessAccountId}</span>
                      </div>
                    </div>
                    <div className="wa-account-actions">
                      <button type="button" onClick={() => openEditModal(account)} aria-label="Edit"><Pencil size={16} /></button>
                      <button type="button" onClick={() => deleteAccount(account)} aria-label="Delete"><Trash2 size={16} /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "greeting" && (
        <section className="wa-panel glass-panel">
          <div className="wa-panel-toolbar"><h2>Greeting sequence</h2></div>
          {accounts.length === 0 ? (
            <div className="wa-empty">Add an account first.</div>
          ) : greetingLoading ? (
            <div className="wa-empty"><LoaderCircle size={22} /> Loading…</div>
          ) : (
            <form className="wa-greeting-layout" onSubmit={saveGreeting}>
              {AccountSelect}
              <p className="wa-hint">
                Meta <strong>Welcome Message</strong> notifies us when a customer opens chat the first time
                (<code>request_welcome</code>). Then this multi-step greeting is sent automatically.
              </p>
              <label className="wa-toggle-row">
                <input
                  type="checkbox"
                  checked={greeting.enabled}
                  onChange={(event) => setGreeting((current) => ({ ...current, enabled: event.target.checked }))}
                />
                <span>
                  <strong>Enable greeting sequence</strong>
                  <small>Sent on first chat open / first contact (with cooldown).</small>
                </span>
              </label>
              <label className="wa-toggle-row">
                <input
                  type="checkbox"
                  checked={greeting.enableWelcomeMessage}
                  onChange={(event) => setGreeting((current) => ({
                    ...current,
                    enableWelcomeMessage: event.target.checked,
                  }))}
                />
                <span>
                  <strong>Enable Meta welcome trigger</strong>
                  <small>Syncs Conversational Components so chat-open fires a webhook.</small>
                </span>
              </label>
              <Field label="Ice breakers" hint="up to 4, max 80 chars each (no emoji)">
                <textarea
                  value={(greeting.iceBreakers || []).join("\n")}
                  placeholder={"View offers\nBook a repair\nShop products"}
                  onChange={(event) => setGreeting((current) => ({
                    ...current,
                    iceBreakers: event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 4),
                  }))}
                />
              </Field>

              {(greeting.messages || []).map((message, index) => (
                <div key={message.id || index} className="wa-button-card">
                  <div className="wa-button-card-head">
                    <strong>Message {index + 1}</strong>
                    <button
                      type="button"
                      className="wa-icon-btn"
                      disabled={greeting.messages.length <= 1}
                      onClick={() => setGreeting((current) => ({
                        ...current,
                        messages: current.messages.filter((_, i) => i !== index),
                      }))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <Field label="Text">
                    <textarea
                      value={message.bodyText}
                      maxLength={1024}
                      onChange={(event) => updateGreetingMessage(index, { bodyText: event.target.value })}
                    />
                  </Field>
                  <Field label="Footer (optional)">
                    <input
                      type="text"
                      maxLength={60}
                      value={message.footerText || ""}
                      onChange={(event) => updateGreetingMessage(index, { footerText: event.target.value })}
                    />
                  </Field>
                  <div className="wa-image-actions">
                    {(message.imageUrls || (message.imageUrl ? [message.imageUrl] : [])).map((url) => (
                      <div key={url} className="wa-image-preview" style={{ width: 120, aspectRatio: "1" }}>
                        <img src={url} alt="" />
                      </div>
                    ))}
                    <label className="wa-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px" }}>
                      <UploadCloud size={16} /> Add image
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (!file) return;
                          setBusy(true);
                          try {
                            const uploaded = await uploadImage(file);
                            const urls = [...(message.imageUrls || []), uploaded.url].filter(Boolean);
                            updateGreetingMessage(index, {
                              imageUrl: urls[0] || "",
                              imageUrls: urls,
                              imagePublicIds: [...(message.imagePublicIds || []), uploaded.publicId].filter(Boolean),
                              type: message.buttons?.length ? "interactive" : "image",
                            });
                          } catch (error) {
                            toast.error(error.message || "Upload failed");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                    </label>
                    {(message.imageUrls || []).length ? (
                      <button
                        type="button"
                        className="wa-danger"
                        onClick={() => updateGreetingMessage(index, {
                          imageUrl: "",
                          imageUrls: [],
                          imagePublicIds: [],
                          imagePublicId: "",
                        })}
                      >
                        Clear images
                      </button>
                    ) : null}
                  </div>
                  <div className="wa-buttons-block">
                    <div className="wa-button-card-head">
                      <strong>Buttons</strong>
                      <button
                        type="button"
                        className="wa-secondary"
                        disabled={(message.buttons || []).length >= 3}
                        onClick={() => updateGreetingMessage(index, {
                          buttons: [...(message.buttons || []), emptyButton()],
                          type: "interactive",
                        })}
                      >
                        <Plus size={14} /> Add button
                      </button>
                    </div>
                    {(message.buttons || []).map((button, buttonIndex) => (
                      <div key={button.id || buttonIndex} className="wa-grid-2">
                        <Field label="Type">
                          <select
                            value={button.type}
                            onChange={(event) => {
                              const buttons = message.buttons.map((item, i) => (
                                i === buttonIndex ? { ...item, type: event.target.value } : item
                              ));
                              updateGreetingMessage(index, { buttons });
                            }}
                          >
                            {BUTTON_TYPES.map((item) => (
                              <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Label">
                          <input
                            maxLength={20}
                            value={button.label}
                            onChange={(event) => {
                              const buttons = message.buttons.map((item, i) => (
                                i === buttonIndex ? { ...item, label: event.target.value } : item
                              ));
                              updateGreetingMessage(index, { buttons });
                            }}
                          />
                        </Field>
                        {button.type === "url" ? (
                          <Field label="URL">
                            <input
                              type="url"
                              value={button.url}
                              onChange={(event) => {
                                const buttons = message.buttons.map((item, i) => (
                                  i === buttonIndex ? { ...item, url: event.target.value } : item
                                ));
                                updateGreetingMessage(index, { buttons });
                              }}
                            />
                          </Field>
                        ) : null}
                        {button.type === "copy_code" ? (
                          <Field label="Code">
                            <input
                              maxLength={15}
                              value={button.code}
                              onChange={(event) => {
                                const buttons = message.buttons.map((item, i) => (
                                  i === buttonIndex ? { ...item, code: event.target.value } : item
                                ));
                                updateGreetingMessage(index, { buttons });
                              }}
                            />
                          </Field>
                        ) : null}
                        <button
                          type="button"
                          className="wa-danger"
                          onClick={() => updateGreetingMessage(index, {
                            buttons: message.buttons.filter((_, i) => i !== buttonIndex),
                          })}
                        >
                          Remove button
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="wa-form-actions">
                <button
                  type="button"
                  className="wa-secondary"
                  disabled={greeting.messages.length >= 10}
                  onClick={() => setGreeting((current) => ({
                    ...current,
                    messages: [...current.messages, emptyGreetingMessage()],
                  }))}
                >
                  <Plus size={14} /> Add message
                </button>
                <button type="submit" className="wa-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save greeting"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {tab === "ai" && (
        <section className="wa-panel glass-panel">
          <div className="wa-panel-toolbar">
            <h2><Bot size={18} style={{ marginRight: 8 }} />AI replies</h2>
          </div>
          {accounts.length === 0 ? (
            <div className="wa-empty">Add an account first.</div>
          ) : aiLoading ? (
            <div className="wa-empty"><LoaderCircle size={22} /> Loading…</div>
          ) : (
            <form className="wa-greeting-layout" onSubmit={saveAI}>
              {AccountSelect}
              <p className="wa-hint">
                Uses Pulse AI knowledge, catalog/offer images, and can attach images + buttons when useful.
                Extra instructions below are WhatsApp-specific.
              </p>
              <label className="wa-toggle-row">
                <input
                  type="checkbox"
                  checked={aiSettings.enabled}
                  onChange={(event) => setAISettings((current) => ({ ...current, enabled: event.target.checked }))}
                />
                <span>
                  <strong>Enable AI auto-replies</strong>
                  <small>For {selectedAccount?.label || "this account"} after greeting / on customer questions.</small>
                </span>
              </label>
              <Field label="Extra WhatsApp AI instructions">
                <textarea
                  value={aiSettings.systemPromptExtra}
                  placeholder="Tone, languages, what to push, when to hand off to human…"
                  onChange={(event) => setAISettings((current) => ({
                    ...current,
                    systemPromptExtra: event.target.value,
                  }))}
                />
              </Field>
              <div className="wa-grid-2">
                <label className="wa-toggle-row">
                  <input
                    type="checkbox"
                    checked={aiSettings.sendOfferImages}
                    onChange={(event) => setAISettings((current) => ({
                      ...current,
                      sendOfferImages: event.target.checked,
                    }))}
                  />
                  <span><strong>Send offer images</strong></span>
                </label>
                <label className="wa-toggle-row">
                  <input
                    type="checkbox"
                    checked={aiSettings.sendProductImages}
                    onChange={(event) => setAISettings((current) => ({
                      ...current,
                      sendProductImages: event.target.checked,
                    }))}
                  />
                  <span><strong>Send product images</strong></span>
                </label>
                <label className="wa-toggle-row">
                  <input
                    type="checkbox"
                    checked={aiSettings.allowButtons}
                    onChange={(event) => setAISettings((current) => ({
                      ...current,
                      allowButtons: event.target.checked,
                    }))}
                  />
                  <span><strong>Allow AI buttons</strong></span>
                </label>
                <label className="wa-toggle-row">
                  <input
                    type="checkbox"
                    checked={aiSettings.pauseOnHumanReply}
                    onChange={(event) => setAISettings((current) => ({
                      ...current,
                      pauseOnHumanReply: event.target.checked,
                    }))}
                  />
                  <span><strong>Pause AI when admin replies</strong></span>
                </label>
              </div>
              <Field label="Max images per AI reply">
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={aiSettings.maxImagesPerReply}
                  onChange={(event) => setAISettings((current) => ({
                    ...current,
                    maxImagesPerReply: Number(event.target.value),
                  }))}
                />
              </Field>
              <div className="wa-form-actions">
                <button type="submit" className="wa-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save AI settings"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {tab === "customers" && (
        <section className="wa-panel glass-panel wa-inbox">
          <div className="wa-panel-toolbar">
            <h2><MessageSquare size={18} style={{ marginRight: 8 }} />Customers</h2>
          </div>
          {accounts.length === 0 ? (
            <div className="wa-empty">Add an account first.</div>
          ) : (
            <>
              <div className="wa-inbox-toolbar">
                {AccountSelect}
                <input
                  className="wa-search"
                  value={conversationSearch}
                  placeholder="Search name or number…"
                  onChange={(event) => setConversationSearch(event.target.value)}
                />
              </div>
              <div className="wa-inbox-list">
                {conversationsLoading ? (
                  <div className="wa-empty"><LoaderCircle size={22} /> Loading chats…</div>
                ) : conversations.length === 0 ? (
                  <div className="wa-empty">No customers yet for this account.</div>
                ) : (
                  conversations.map((conversation) => {
                    const id = conversation._id || conversation.id;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="wa-chat-row"
                        onClick={() => openConversation(conversation)}
                      >
                        <div className="wa-chat-avatar">
                          {(conversation.customerName || conversation.customerWaId || "?").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="wa-chat-row-body">
                          <div className="wa-chat-row-top">
                            <strong>{conversation.customerName || conversation.customerWaId}</strong>
                            <span>{formatTime(conversation.lastMessageAt)}</span>
                          </div>
                          <div className="wa-chat-row-preview">
                            <span>{conversation.lastMessagePreview || "—"}</span>
                            {conversation.unreadCount > 0 ? (
                              <em>{conversation.unreadCount}</em>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </section>
      )}

      {activeConversation ? (
        <div className="wa-drawer-layer" role="dialog" aria-modal="true">
          <button type="button" className="wa-drawer-backdrop" aria-label="Close" onClick={() => setActiveConversation(null)} />
          <aside className="wa-chat-drawer">
            <header>
              <div>
                <h2>{activeConversation.customerName || activeConversation.customerWaId}</h2>
                <span>{activeConversation.customerWaId}</span>
              </div>
              <div className="wa-chat-header-actions">
                <button
                  type="button"
                  className={activeConversation.humanTakeover ? "wa-primary" : "wa-secondary"}
                  onClick={() => toggleTakeover(!activeConversation.humanTakeover)}
                >
                  {activeConversation.humanTakeover ? "AI paused" : "Take over"}
                </button>
                <button type="button" className="wa-icon-btn" aria-label="Close" onClick={() => setActiveConversation(null)}>
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="wa-chat-thread">
              {messagesLoading ? (
                <div className="wa-empty"><LoaderCircle size={22} /> Loading messages…</div>
              ) : (
                messages.map((message) => {
                  const outbound = message.direction === "outbound";
                  return (
                    <div key={message._id || message.id} className={`wa-bubble-row ${outbound ? "out" : "in"}`}>
                      <div className={`wa-bubble ${outbound ? "out" : "in"}`}>
                        {message.type === "image" && message.mediaUrl ? (
                          <a href={message.mediaUrl} target="_blank" rel="noreferrer">
                            <img src={message.mediaUrl} alt="" />
                          </a>
                        ) : null}
                        {message.type === "document" && message.mediaUrl ? (
                          <a className="wa-doc-link" href={message.mediaUrl} target="_blank" rel="noreferrer">
                            <FileText size={16} /> {message.mediaFilename || "Document"}
                          </a>
                        ) : null}
                        {message.text ? <p>{message.text}</p> : null}
                        <small>
                          {message.sender === "ai" ? "AI · " : message.sender === "admin" ? "You · " : ""}
                          {formatTime(message.createdAt)}
                        </small>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <form className="wa-composer" onSubmit={sendText}>
              <label className="wa-composer-icon" title="Image">
                <ImageIcon size={18} />
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    sendImageFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              <label className="wa-composer-icon" title="Document">
                <Paperclip size={18} />
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,application/pdf"
                  hidden
                  onChange={(event) => {
                    sendDocumentFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              <input
                value={composer}
                placeholder="Type a message"
                onChange={(event) => setComposer(event.target.value)}
              />
              <button type="submit" className="wa-send" disabled={busy || !composer.trim()} aria-label="Send">
                <Send size={18} />
              </button>
            </form>
          </aside>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="wa-modal-layer" role="dialog" aria-modal="true">
          <button type="button" className="wa-modal-backdrop" aria-label="Close" onClick={() => !busy && setModalOpen(false)} />
          <form className="wa-modal" onSubmit={saveAccount}>
            <header>
              <h3>{editingId ? "Edit account" : "Add WhatsApp account"}</h3>
              <button type="button" onClick={() => !busy && setModalOpen(false)} aria-label="Close"><X size={18} /></button>
            </header>
            <Field label="Account name">
              <input required value={accountForm.label} onChange={(event) => setAccountForm((current) => ({ ...current, label: event.target.value }))} />
            </Field>
            <Field label="Phone Number ID">
              <input required value={accountForm.phoneNumberId} onChange={(event) => setAccountForm((current) => ({ ...current, phoneNumberId: event.target.value }))} />
            </Field>
            <Field label="WABA ID">
              <input required value={accountForm.businessAccountId} onChange={(event) => setAccountForm((current) => ({ ...current, businessAccountId: event.target.value }))} />
            </Field>
            <Field label="Display phone">
              <input value={accountForm.displayPhoneNumber} onChange={(event) => setAccountForm((current) => ({ ...current, displayPhoneNumber: event.target.value }))} />
            </Field>
            <Field label={editingId ? "Access token (blank = keep)" : "Access token"}>
              <input required={!editingId} value={accountForm.accessToken} onChange={(event) => setAccountForm((current) => ({ ...current, accessToken: event.target.value }))} />
            </Field>
            <Field label="Notes">
              <textarea value={accountForm.notes} onChange={(event) => setAccountForm((current) => ({ ...current, notes: event.target.value }))} />
            </Field>
            <label className="wa-toggle-row">
              <input type="checkbox" checked={accountForm.isActive} onChange={(event) => setAccountForm((current) => ({ ...current, isActive: event.target.checked }))} />
              <span><strong>Active</strong></span>
            </label>
            <footer>
              <button type="button" className="wa-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="wa-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
