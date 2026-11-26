import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import AdminFormModal from "./AdminFormModal";
import AdminToggle from "./AdminToggle";

const endpoint = "/product-reviews/admin/whatsapp";

function AddRecipient({ apiFetch, onClose, onAdded }) {
  const formId = useId();
  const [whatsappNumber, setNumber] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);

  useEffect(() => {
    if (!seconds) return undefined;
    const timeout = setTimeout(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => clearTimeout(timeout);
  }, [seconds]);

  async function sendCode() {
    setBusy(true);
    setError("");
    try {
      const { data } = await apiFetch(`${endpoint}/otp`, { method: "POST", body: JSON.stringify({ whatsappNumber }) });
      setChallengeId(data.challengeId);
      setOtp("");
      setSeconds(Math.ceil(data.resendAvailableInMs / 1000));
    } catch (requestError) {
      setError(requestError.message || "Couldn’t send the WhatsApp code.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!challengeId) { await sendCode(); return; }
    setBusy(true);
    setError("");
    try {
      const { data } = await apiFetch(`${endpoint}/recipients`, { method: "POST", body: JSON.stringify({ challengeId, otp }) });
      onAdded(data);
    } catch (requestError) {
      setError(requestError.message || "Couldn’t verify the WhatsApp number.");
      setBusy(false);
    }
  }

  return (
    <AdminFormModal open title="Add WhatsApp number" onClose={close}
      subtitle={challengeId ? `Enter the six-digit code sent to ${whatsappNumber}.` : "Verify a number before it can receive review alerts and moderate reviews."}
      footer={<>
        <button type="button" className="ghost-button" onClick={close} disabled={busy}>Cancel</button>
        <button type="submit" form={formId} className="primary-button" disabled={busy}>{busy ? "Please wait…" : challengeId ? "Verify and add" : "Send WhatsApp code"}</button>
      </>}>
      <form id={formId} className="admin-review-whatsapp-form" onSubmit={submit}>
        {challengeId ? (
          <label className="field" key="otp">Verification code
            <input autoFocus type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" maxLength={6} pattern="[0-9]{6}"
              required disabled={busy} value={otp} onChange={(event) => { setOtp(event.target.value.replace(/\D/g, "")); setError(""); }} />
          </label>
        ) : (
          <label className="field" key="number">WhatsApp number
            <input autoFocus type="tel" autoComplete="tel" placeholder="+91 98765 43210" maxLength={24}
              required disabled={busy} value={whatsappNumber} onChange={(event) => { setNumber(event.target.value); setError(""); }} />
          </label>
        )}
        {error && <p className="orders-error" role="alert">{error}</p>}
        {challengeId && (
          <div className="admin-review-actions">
            <button type="button" className="ghost-button" onClick={sendCode} disabled={busy || seconds > 0}>{seconds ? `Resend in ${seconds}s` : "Resend code"}</button>
            <button type="button" className="ghost-button" onClick={() => { setChallengeId(""); setError(""); }} disabled={busy}>Change number</button>
          </div>
        )}
      </form>
    </AdminFormModal>
  );
}

export default function ReviewWhatsAppSettings({ apiFetch }) {
  const [settings, setSettings] = useState(null);
  const [modalRoot, setModalRoot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const closeModal = useCallback(() => setModalRoot(null), []);

  useEffect(() => {
    let current = true;
    setError("");
    apiFetch(endpoint, { cache: "no-store" }).then(({ data }) => {
      if (!Array.isArray(data?.recipients)) throw new Error("Missing WhatsApp settings.");
      if (current) setSettings(data);
    }).catch(() => {
      if (current) setError("Couldn’t load WhatsApp alert settings.");
    });
    return () => { current = false; };
  }, [apiFetch, version]);

  async function change(path, options, message) {
    setBusy(true);
    setError("");
    try {
      const { data } = await apiFetch(`${endpoint}${path}`, options);
      setSettings(data);
      toast.success(message);
    } catch (requestError) {
      setError(requestError.message || "Couldn’t update WhatsApp alert settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="admin-review-whatsapp glass-panel" aria-label="Review WhatsApp alerts">
        <div className="admin-product-reviews-head">
          <AdminToggle label="WhatsApp review alerts" checked={settings?.enabled}
            description="Send new reviews to the verified numbers below."
            disabled={busy || !settings || (!settings.available && !settings.enabled)}
            onChange={(enabled) => change("", { method: "PATCH", body: JSON.stringify({ enabled }) }, `WhatsApp alerts ${enabled ? "enabled" : "turned off"}`)} />
          <button type="button" className="ghost-button" disabled={busy || !settings}
            onClick={(event) => setModalRoot(event.currentTarget.closest(".admin-shell") || document.body)}><Plus size={16} /> Add WhatsApp number</button>
        </div>
        {settings && !settings.available && <p className="muted">A WhatsApp Business account and signed webhook are required to enable alerts.</p>}
        {error && <p className="orders-error" role="alert">{error}{!settings && <> <button type="button" className="ghost-button" onClick={() => setVersion((current) => current + 1)}>Try again</button></>}</p>}
        {settings?.recipients.length === 0 && <p className="muted">No verified numbers yet.</p>}
        {settings?.recipients.length > 0 && <ul className="admin-review-whatsapp-recipients" aria-label="Verified WhatsApp numbers">
          {settings.recipients.map(({ _id, whatsappNumber }) => (
            <li key={_id}>
              <span><ShieldCheck size={17} aria-hidden="true" /> +91 {whatsappNumber}</span>
              <button type="button" className="ghost-button" aria-label={`Remove WhatsApp number ${whatsappNumber}`} disabled={busy}
                onClick={() => change(`/recipients/${_id}`, { method: "DELETE" }, "WhatsApp number removed")}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>}
      </section>
      {modalRoot && createPortal(<AddRecipient apiFetch={apiFetch} onClose={closeModal} onAdded={(data) => {
        setSettings(data);
        closeModal();
        toast.success("WhatsApp number verified and added");
      }} />, modalRoot)}
    </>
  );
}
