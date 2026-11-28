import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Bot,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import AdminToggle from "./AdminToggle";
import WhatsAppVoiceCalls from "./WhatsAppVoiceCalls";
import WhatsAppCustomers from "./WhatsAppCustomers";
import "./ManageWhatsAppModule.css";

const TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "greeting", label: "Greeting" },
  { id: "ai", label: "AI replies" },
  { id: "customers", label: "Customers" },
  { id: "voice", label: "Voice calls" },
];

const BUTTON_TYPES = [
  { value: "url", label: "Go Now (URL)" },
  { value: "copy_code", label: "Copy code (monospace block)" },
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
  headerText: "",
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
  orderTemplateName: "",
  orderTemplateLanguage: "en",
  adWelcomeSequenceId: "",
  iceBreakers: ["View offers", "Book a repair", "Shop products"],
  messages: [emptyGreetingMessage()],
});

const emptyAI = () => ({
  enabled: true,
  systemPromptExtra: "",
  sendProductImages: true,
  sendOfferImages: true,
  codEnabled: false,
  enhancedPaymentsEnabled: false,
  paymentTemplateName: "pulse_order_payment",
  paymentTemplateLanguage: "en",
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
          orderTemplateName: response.data.orderTemplateName || "",
          orderTemplateLanguage: response.data.orderTemplateLanguage || "en",
          adWelcomeSequenceId: response.data.adWelcomeSequenceId || "",
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

  useEffect(() => {
    if (!selectedAccountId) return;
    if (tab === "greeting") loadGreeting(selectedAccountId);
    if (tab === "ai") loadAI(selectedAccountId);
  }, [tab, selectedAccountId, loadGreeting, loadAI]);

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

  const publishAdWelcome = async () => {
    if (!selectedAccountId) return;
    setBusy(true);
    try {
      const { data } = await apiFetch("/whatsapp/admin/greeting/ad-welcome", {
        method: "POST",
        body: JSON.stringify({ accountId: selectedAccountId }),
      });
      setGreeting((current) => ({ ...current, adWelcomeSequenceId: data.sequenceId }));
      toast.success("Ad welcome sequence published");
    } catch (error) {
      toast.error(error.message || "Unable to publish ad welcome");
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

      {tab === "voice" && <WhatsAppVoiceCalls apiFetch={apiFetch} />}

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
                Meta supports a welcome screen for Click-to-WhatsApp ads. Opening a regular WhatsApp chat
                does not send this app a chat-open event.
              </p>
              <AdminToggle
                className="wa-toggle-row"
                label={<strong>Enable greeting sequence</strong>}
                description="Send the greeting once before the first eligible order update."
                checked={greeting.enabled}
                onChange={(enabled) => setGreeting((current) => ({ ...current, enabled }))}
              />
              <Field label="Approved order welcome template (optional)"
                hint="Used when no WhatsApp service window is open and the customer has opted in. Use a static template without placeholders.">
                <input value={greeting.orderTemplateName}
                  pattern="[a-z0-9_]+" maxLength={512}
                  onChange={(event) => setGreeting((current) => ({ ...current, orderTemplateName: event.target.value }))} />
              </Field>
              <Field label="Order welcome template language">
                <input value={greeting.orderTemplateLanguage} required maxLength={6} placeholder="en"
                  onChange={(event) => setGreeting((current) => ({ ...current, orderTemplateLanguage: event.target.value }))} />
              </Field>
              <div className="wa-button-card">
                <div className="wa-button-card-head"><strong>Click-to-WhatsApp ad welcome</strong></div>
                <p className="wa-hint">Save the greeting, then publish its first text message and ice breakers to Meta.
                  Select the published sequence in Ads Manager for each ad that should show the welcome on open.</p>
                <button type="button" className="wa-secondary" disabled={busy || !greeting.enabled} onClick={publishAdWelcome}>
                  {greeting.adWelcomeSequenceId ? "Update ad welcome sequence" : "Publish ad welcome sequence"}
                </button>
                {greeting.adWelcomeSequenceId && <p className="wa-hint">Sequence ID <code>{greeting.adWelcomeSequenceId}</code></p>}
              </div>
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
                  <Field label="Header (optional)" hint="Up to 60 characters">
                    <input type="text" maxLength={60} value={message.headerText || ""}
                      onChange={(event) => updateGreetingMessage(index, { headerText: event.target.value })} />
                  </Field>
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
                    <p className="wa-hint">
                      Copy code sends a WhatsApp monospace code block (customer tap-and-hold to copy).
                      Native one-tap clipboard buttons need Meta AUTH/marketing templates.
                    </p>
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
              <AdminToggle
                className="wa-toggle-row"
                label={<strong>Enable AI auto-replies</strong>}
                description={`For ${selectedAccount?.label || "this account"} after greeting / on customer questions.`}
                checked={aiSettings.enabled}
                onChange={(enabled) => setAISettings((current) => ({ ...current, enabled }))}
              />
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
                <AdminToggle
                  label="Allow cash on delivery"
                  description="Confirm WhatsApp orders with payment due on delivery. Prepaid orders require verified Razorpay payment."
                  checked={aiSettings.codEnabled}
                  onChange={(codEnabled) => setAISettings((current) => ({ ...current, codEnabled }))}
                />
                <AdminToggle
                  className="wa-toggle-row"
                  label={<strong>Send offer images</strong>}
                  checked={aiSettings.sendOfferImages}
                  onChange={(sendOfferImages) => setAISettings((current) => ({ ...current, sendOfferImages }))}
                />
                <AdminToggle
                  className="wa-toggle-row"
                  label={<strong>Send product images</strong>}
                  checked={aiSettings.sendProductImages}
                  onChange={(sendProductImages) => setAISettings((current) => ({ ...current, sendProductImages }))}
                />
                <AdminToggle
                  className="wa-toggle-row"
                  label={<strong>Allow AI buttons</strong>}
                  checked={aiSettings.allowButtons}
                  onChange={(allowButtons) => setAISettings((current) => ({ ...current, allowButtons }))}
                />
                <AdminToggle
                  className="wa-toggle-row"
                  label={<strong>Pause AI when admin replies</strong>}
                  checked={aiSettings.pauseOnHumanReply}
                  onChange={(pauseOnHumanReply) => setAISettings((current) => ({ ...current, pauseOnHumanReply }))}
                />
              </div>
              <h3>WhatsApp payment card</h3>
              <p>Online orders use the approved order_details_with_product_list template with a product image and Review and Pay button.</p>
              <AdminToggle
                className="wa-toggle-row"
                label={<strong>Enhanced Payment Links activated</strong>}
                description="Enable after Meta activates this account. Prepaid checkout stays unavailable until activation, an approved template, and the payment webhook are configured."
                checked={aiSettings.enhancedPaymentsEnabled}
                onChange={(enhancedPaymentsEnabled) => setAISettings((current) => ({ ...current, enhancedPaymentsEnabled }))}
              />
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
        <WhatsAppCustomers key={selectedAccountId} accountId={selectedAccountId} accountSelect={AccountSelect} apiFetch={apiFetch} uploadImage={uploadImage} />
      )}

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
            <AdminToggle
              className="wa-toggle-row"
              label={<strong>Active</strong>}
              checked={accountForm.isActive}
              onChange={(isActive) => setAccountForm((current) => ({ ...current, isActive }))}
            />
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
