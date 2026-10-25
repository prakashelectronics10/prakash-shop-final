import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link2, LoaderCircle, Pencil, Plus, Trash2, UploadCloud, X } from "lucide-react";
import "./ManageWhatsAppModule.css";

const TABS = [
  { id: "accounts", label: "Manage accounts" },
  { id: "greeting", label: "Greeting message" },
];

const BUTTON_TYPES = [
  { value: "url", label: "Go Now (open URL)" },
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

const emptyGreeting = () => ({
  enabled: true,
  bodyText: "",
  footerText: "",
  imageUrl: "",
  imagePublicId: "",
  imageSourceUrl: "",
  buttons: [],
});

function Field({ label, hint, children }) {
  return (
    <div className="wa-field">
      <label>
        {label}
        {hint ? <em style={{ fontStyle: "normal", fontWeight: 650, color: "var(--muted)" }}> — {hint}</em> : null}
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
  const [ogUrl, setOgUrl] = useState("");

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
      setGreeting(response.data ? {
        enabled: response.data.enabled !== false,
        bodyText: response.data.bodyText || "",
        footerText: response.data.footerText || "",
        imageUrl: response.data.imageUrl || "",
        imagePublicId: response.data.imagePublicId || "",
        imageSourceUrl: response.data.imageSourceUrl || "",
        buttons: Array.isArray(response.data.buttons) ? response.data.buttons : [],
      } : emptyGreeting());
      setOgUrl(response.data?.imageSourceUrl || "");
    } catch (error) {
      toast.error(error.message || "Unable to load greeting");
      setGreeting(emptyGreeting());
    } finally {
      setGreetingLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (tab === "greeting" && selectedAccountId) {
      loadGreeting(selectedAccountId);
    }
  }, [tab, selectedAccountId, loadGreeting]);

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
    if (!window.confirm(`Remove WhatsApp account “${account.label}”? Greeting for this account will also be deleted.`)) {
      return;
    }
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
    if (!file) return;
    const formData = new FormData();
    formData.append("image", file);
    setBusy(true);
    try {
      const response = await apiFetch("/admin/upload/image", {
        method: "POST",
        body: formData,
        timeout: 45000,
      });
      setGreeting((current) => ({
        ...current,
        imageUrl: response.data?.url || "",
        imagePublicId: response.data?.publicId || "",
        imageSourceUrl: "",
      }));
      setOgUrl("");
      toast.success("Image uploaded");
    } catch (error) {
      toast.error(error.message || "Image upload failed");
    } finally {
      setBusy(false);
    }
  };

  const resolveOg = async () => {
    if (!ogUrl.trim()) {
      toast.error("Enter a page URL first");
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch("/whatsapp/admin/og-image", {
        method: "POST",
        body: JSON.stringify({ url: ogUrl.trim() }),
      });
      setGreeting((current) => ({
        ...current,
        imageUrl: response.data?.imageUrl || "",
        imagePublicId: "",
        imageSourceUrl: response.data?.sourceUrl || ogUrl.trim(),
      }));
      toast.success("Open Graph image loaded");
    } catch (error) {
      toast.error(error.message || "Could not resolve OG image");
    } finally {
      setBusy(false);
    }
  };

  const saveGreeting = async (event) => {
    event.preventDefault();
    if (!selectedAccountId) {
      toast.error("Select a WhatsApp account first");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/whatsapp/admin/greeting", {
        method: "PUT",
        body: JSON.stringify({
          accountId: selectedAccountId,
          ...greeting,
        }),
      });
      toast.success("Greeting saved");
      await loadGreeting(selectedAccountId);
    } catch (error) {
      toast.error(error.message || "Unable to save greeting");
    } finally {
      setBusy(false);
    }
  };

  const updateButton = (index, patch) => {
    setGreeting((current) => ({
      ...current,
      buttons: current.buttons.map((button, i) => (i === index ? { ...button, ...patch } : button)),
    }));
  };

  const removeButton = (index) => {
    setGreeting((current) => ({
      ...current,
      buttons: current.buttons.filter((_, i) => i !== index),
    }));
  };

  const addButton = () => {
    if (greeting.buttons.length >= 3) {
      toast.error("WhatsApp allows max 3 buttons");
      return;
    }
    setGreeting((current) => ({
      ...current,
      buttons: [...current.buttons, emptyButton()],
    }));
  };

  const selectedAccount = useMemo(
    () => accounts.find((item) => String(item._id || item.id) === String(selectedAccountId)),
    [accounts, selectedAccountId],
  );

  return (
    <div className="wa-module">
      <div className="wa-module-header">
        <div>
          <h1>Manage WhatsApp</h1>
          <p>Accounts, greeting messages, and Cloud API setup for customer chats.</p>
        </div>
        <div className="wa-tabs" role="tablist" aria-label="WhatsApp sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
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
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Plus size={16} /> Add account
                </span>
              </button>
            </div>
          </div>

          {envDefaults ? (
            <p className="wa-env-note">
              Webhook callback: <strong>https://prakashshop.in{envDefaults.callbackPath}</strong>
              {" · "}
              Verify token: {envDefaults.webhookVerifyConfigured ? "configured in .env" : "missing in .env"}
              {" · "}
              Messaging: {envDefaults.enabled ? "WHATSAPP_ENABLED=true" : "set WHATSAPP_ENABLED=true after Meta verify"}
            </p>
          ) : null}

          {loading ? (
            <div className="wa-empty"><LoaderCircle className="spin" size={22} /> Loading accounts…</div>
          ) : accounts.length === 0 ? (
            <div className="wa-empty">
              No WhatsApp accounts yet. Add one with WABA ID, Phone Number ID, and access token.
            </div>
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
                        {account.displayPhoneNumber ? <span>{account.displayPhoneNumber}</span> : null}
                        <span>Phone ID · {account.phoneNumberId}</span>
                        <span>WABA · {account.businessAccountId}</span>
                        <span>Token · {account.accessTokenMasked || "••••"}</span>
                      </div>
                    </div>
                    <div className="wa-account-actions">
                      <button type="button" title="Edit" aria-label="Edit account" onClick={() => openEditModal(account)}>
                        <Pencil size={16} />
                      </button>
                      <button type="button" title="Delete" aria-label="Delete account" onClick={() => deleteAccount(account)}>
                        <Trash2 size={16} />
                      </button>
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
          <div className="wa-panel-toolbar">
            <h2>Greeting message</h2>
          </div>

          {accounts.length === 0 ? (
            <div className="wa-empty">Add a WhatsApp account first, then configure its greeting.</div>
          ) : (
            <form className="wa-greeting-layout" onSubmit={saveGreeting}>
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

              {greetingLoading ? (
                <div className="wa-empty"><LoaderCircle size={22} /> Loading greeting…</div>
              ) : (
                <>
                  <label className="wa-toggle-row">
                    <input
                      type="checkbox"
                      checked={greeting.enabled}
                      onChange={(event) => setGreeting((current) => ({ ...current, enabled: event.target.checked }))}
                    />
                    <span>
                      <strong>Send greeting on first message</strong>
                      <small>
                        When a customer messages {selectedAccount?.label || "this number"}, this greeting is sent
                        (cooldown applies so it is not repeated every message).
                      </small>
                    </span>
                  </label>

                  <Field label="Message text">
                    <textarea
                      value={greeting.bodyText}
                      maxLength={1024}
                      placeholder="Welcome to Prakash Electronics! How can we help you today?"
                      onChange={(event) => setGreeting((current) => ({ ...current, bodyText: event.target.value }))}
                    />
                  </Field>

                  <Field label="Footer (optional)" hint="max 60 characters">
                    <input
                      type="text"
                      value={greeting.footerText}
                      maxLength={60}
                      placeholder="Prakash Electronics"
                      onChange={(event) => setGreeting((current) => ({ ...current, footerText: event.target.value }))}
                    />
                  </Field>

                  <div className="wa-image-row">
                    <strong style={{ fontSize: 13 }}>Image</strong>
                    <p className="wa-hint">Upload an image, or paste a page URL to pull its Open Graph image.</p>
                    {greeting.imageUrl ? (
                      <div className="wa-image-preview">
                        <img src={greeting.imageUrl} alt="Greeting preview" />
                      </div>
                    ) : null}
                    <div className="wa-image-actions">
                      <label className="wa-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px" }}>
                        <UploadCloud size={16} /> Upload
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          hidden
                          onChange={(event) => {
                            uploadImage(event.target.files?.[0]);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      {greeting.imageUrl ? (
                        <button
                          type="button"
                          className="wa-danger"
                          onClick={() => setGreeting((current) => ({
                            ...current,
                            imageUrl: "",
                            imagePublicId: "",
                            imageSourceUrl: "",
                          }))}
                        >
                          Remove image
                        </button>
                      ) : null}
                    </div>
                    <div className="wa-grid-2">
                      <Field label="Page URL for OG image">
                        <input
                          type="url"
                          value={ogUrl}
                          placeholder="https://example.com/offer"
                          onChange={(event) => setOgUrl(event.target.value)}
                        />
                      </Field>
                      <div style={{ display: "flex", alignItems: "flex-end" }}>
                        <button type="button" className="wa-secondary" disabled={busy} onClick={resolveOg}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Link2 size={16} /> Fetch OG image
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="wa-buttons-block">
                    <div className="wa-button-card-head">
                      <strong>Buttons (CTA)</strong>
                      <button type="button" className="wa-secondary" onClick={addButton} disabled={greeting.buttons.length >= 3}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Plus size={14} /> Add button
                        </span>
                      </button>
                    </div>
                    <p className="wa-hint">
                      WhatsApp allows either one “Go Now” URL button, or up to 3 reply / copy-code buttons.
                      Copy code sends the code as a follow-up when the customer taps it.
                    </p>
                    {greeting.buttons.map((button, index) => (
                      <div key={button.id || index} className="wa-button-card">
                        <div className="wa-button-card-head">
                          <strong>Button {index + 1}</strong>
                          <button type="button" className="wa-icon-btn" aria-label="Remove button" onClick={() => removeButton(index)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="wa-grid-2">
                          <Field label="Type">
                            <select
                              value={button.type}
                              onChange={(event) => {
                                const type = event.target.value;
                                updateButton(index, {
                                  type,
                                  label: type === "url" ? "Go Now" : type === "copy_code" ? "Copy code" : "Reply",
                                });
                              }}
                            >
                              {BUTTON_TYPES.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Label" hint="max 20 chars">
                            <input
                              type="text"
                              maxLength={20}
                              value={button.label}
                              onChange={(event) => updateButton(index, { label: event.target.value })}
                            />
                          </Field>
                        </div>
                        {button.type === "url" ? (
                          <Field label="URL">
                            <input
                              type="url"
                              value={button.url}
                              placeholder="https://prakashshop.in"
                              onChange={(event) => updateButton(index, { url: event.target.value })}
                            />
                          </Field>
                        ) : null}
                        {button.type === "copy_code" ? (
                          <Field label="Code to copy">
                            <input
                              type="text"
                              maxLength={15}
                              value={button.code}
                              placeholder="SAVE10"
                              onChange={(event) => updateButton(index, { code: event.target.value })}
                            />
                          </Field>
                        ) : null}
                        {button.type === "quick_reply" ? (
                          <Field label="Payload (optional)">
                            <input
                              type="text"
                              maxLength={80}
                              value={button.payload}
                              placeholder="browse_shop"
                              onChange={(event) => updateButton(index, { payload: event.target.value })}
                            />
                          </Field>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="wa-form-actions">
                    <button type="submit" className="wa-primary" disabled={busy}>
                      {busy ? "Saving…" : "Save greeting"}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </section>
      )}

      {modalOpen ? (
        <div className="wa-modal-layer" role="dialog" aria-modal="true" aria-labelledby="wa-account-modal-title">
          <button type="button" className="wa-modal-backdrop" aria-label="Close" onClick={() => !busy && setModalOpen(false)} />
          <form className="wa-modal" onSubmit={saveAccount}>
            <header>
              <div>
                <h3 id="wa-account-modal-title">{editingId ? "Edit account" : "Add WhatsApp account"}</h3>
                <p className="wa-hint" style={{ marginTop: 4 }}>
                  Use IDs from Meta → WhatsApp → API Setup. Access token from System User.
                </p>
              </div>
              <button type="button" aria-label="Close" onClick={() => !busy && setModalOpen(false)}>
                <X size={18} />
              </button>
            </header>

            <Field label="Account name">
              <input
                required
                value={accountForm.label}
                placeholder="Prakash main line"
                onChange={(event) => setAccountForm((current) => ({ ...current, label: event.target.value }))}
              />
            </Field>
            <Field label="Phone Number ID" hint="not the +91 number">
              <input
                required
                value={accountForm.phoneNumberId}
                placeholder="123456789012345"
                onChange={(event) => setAccountForm((current) => ({ ...current, phoneNumberId: event.target.value }))}
              />
            </Field>
            <Field label="WhatsApp Business Account ID (WABA)">
              <input
                required
                value={accountForm.businessAccountId}
                placeholder="123456789012345"
                onChange={(event) => setAccountForm((current) => ({ ...current, businessAccountId: event.target.value }))}
              />
            </Field>
            <Field label="Display phone (optional)">
              <input
                value={accountForm.displayPhoneNumber}
                placeholder="+91 62002 67880"
                onChange={(event) => setAccountForm((current) => ({ ...current, displayPhoneNumber: event.target.value }))}
              />
            </Field>
            <Field label={editingId ? "Access token (leave blank to keep current)" : "Access token"}>
              <input
                required={!editingId}
                value={accountForm.accessToken}
                placeholder="EAAG…"
                onChange={(event) => setAccountForm((current) => ({ ...current, accessToken: event.target.value }))}
              />
            </Field>
            <Field label="Notes (optional)">
              <textarea
                value={accountForm.notes}
                maxLength={500}
                placeholder="Internal note"
                onChange={(event) => setAccountForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </Field>
            <label className="wa-toggle-row" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                checked={accountForm.isActive}
                onChange={(event) => setAccountForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              <span>
                <strong>Active</strong>
                <small>Inactive accounts will not send greetings.</small>
              </span>
            </label>

            <footer>
              <button type="button" className="wa-secondary" disabled={busy} onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="wa-primary" disabled={busy}>
                {busy ? "Saving…" : editingId ? "Update" : "Add account"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
