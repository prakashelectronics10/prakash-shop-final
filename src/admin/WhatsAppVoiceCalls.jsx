import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import AdminToggle from "./AdminToggle";

const base = "/whatsapp/admin/voice";
const states = ["incoming", "active", "completed", "missed", "failed"];
const languages = { hi: "Hindi", en: "English", hinglish: "Hinglish" };
const topics = { catalog: "Catalog", order: "Order", repair: "Repair", payment: "Payment", general_support: "General support" };

function durationLabel(call) {
  const seconds = call.durationSeconds ?? (call.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(call.startedAt)) / 1000)) : 0);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function WhatsAppVoiceCalls({ apiFetch }) {
  const [settings, setSettings] = useState(null);
  const [config, setConfig] = useState(null);
  const [settingsError, setSettingsError] = useState("");
  const [callsError, setCallsError] = useState("");
  const [calls, setCalls] = useState(null);
  const [state, setState] = useState("");
  const [callback, setCallback] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState("");

  useEffect(() => {
    let current = true;
    apiFetch(`${base}/settings`).then(({ data }) => {
      if (current) {
        setSettings(data.settings);
        setConfig(data.config);
      }
    }).catch((error) => { if (current) setSettingsError(error.message); });
    return () => { current = false; };
  }, [apiFetch]);

  useEffect(() => {
    let current = true;
    const params = new URLSearchParams({ page });
    if (state) params.set("state", state);
    if (callback) params.set("callback", callback);
    const load = async () => {
      try {
        const { data } = await apiFetch(`${base}/calls?${params}`);
        if (current) {
          setCalls(data.calls);
          setHasMore(data.hasMore);
          setCallsError("");
        }
      } catch (error) {
        if (current) setCallsError(error.message);
      }
    };
    load();
    const timer = window.setInterval(load, 8000);
    return () => { current = false; window.clearInterval(timer); };
  }, [apiFetch, state, callback, page, refresh]);

  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const changeFilter = (setFilter, value) => {
    setPage(1);
    setCalls(null);
    setHasMore(false);
    setFilter(value);
  };

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setSettingsError("");
    try {
      const { data } = await apiFetch(`${base}/settings`, { method: "PUT", body: JSON.stringify(settings) });
      setSettings(data.settings);
      setConfig(data.config);
      toast.success("Voice settings saved");
    } catch (error) {
      setSettingsError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function resolveCallback(id) {
    setResolving(id);
    try {
      await apiFetch(`${base}/calls/${encodeURIComponent(id)}/callback`, { method: "PATCH" });
      setRefresh((value) => value + 1);
      toast.success("Callback marked resolved");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setResolving("");
    }
  }

  return (
    <div className="wa-voice">
      <section className="wa-panel glass-panel">
        <div className="wa-panel-toolbar"><h2>Voice settings</h2></div>
        {settingsError && <p role="alert">{settingsError}</p>}
        {!settings && !settingsError && <p className="wa-empty">Loading voice settings…</p>}
        {settings && (
          <form className="wa-voice-settings" onSubmit={save}>
            <AdminToggle label="Answer incoming calls"
              description={config.enabled && config.configured ? `Maximum call length ${config.maxDuration} seconds` : "Voice calling requires server configuration."}
              checked={settings.enabled} onChange={(value) => update("enabled", value)}
              disabled={saving || (!settings.enabled && (!config.enabled || !config.configured))} />
            <div className="wa-voice-fields">
              <label className="wa-field">AI provider
                <input readOnly value={config.providerLabel || settings.provider || ""} />
              </label>
              <label className="wa-field">Realtime model
                {config.supportedModels ? (
                  <select value={settings.model} onChange={(ev) => update("model", ev.target.value)}>
                    {config.supportedModels.map((model) => <option key={model}>{model}</option>)}
                  </select>
                ) : (
                  <input required maxLength={80} value={settings.model || ""} onChange={(ev) => update("model", ev.target.value)} />
                )}
              </label>
              <label className="wa-field">Voice
                <select value={settings.voice || ""} onChange={(ev) => update("voice", ev.target.value)}>
                  {config.supportedVoices.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="wa-field">Concurrent call limit
                <input required type="number" min={1} max={config.maxConcurrent} value={settings.maxConcurrent}
                  onChange={(ev) => update("maxConcurrent", ev.target.value === "" ? "" : Number(ev.target.value))} />
              </label>
            </div>
            <label className="wa-field">Greeting
              <textarea required maxLength={500} value={settings.greeting} onChange={(ev) => update("greeting", ev.target.value)} />
            </label>
            <fieldset className="wa-voice-languages">
              <legend>Supported languages</legend>
              {Object.entries(languages).map(([code, label]) => (
                <AdminToggle key={code} label={label} selection checked={settings.languages.includes(code)}
                  disabled={settings.languages.length === 1 && settings.languages.includes(code)}
                  onChange={(checked) => update("languages", checked
                    ? [...settings.languages, code] : settings.languages.filter((item) => item !== code))} />
              ))}
            </fieldset>
            <div><button className="wa-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save voice settings"}</button></div>
          </form>
        )}
      </section>
      <section className="wa-panel glass-panel">
        <div className="wa-panel-toolbar">
          <h2>Call history</h2>
          <div className="wa-toolbar-actions">
            <div className="wa-field">
              <select aria-label="Call status" value={state} onChange={(ev) => changeFilter(setState, ev.target.value)}>
                <option value="">All statuses</option>
                {states.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}
              </select>
            </div>
            <div className="wa-field">
              <select aria-label="Callback status" value={callback} onChange={(ev) => changeFilter(setCallback, ev.target.value)}>
                <option value="">All calls</option>
                <option value="requested">Open callbacks</option>
                <option value="resolved">Resolved callbacks</option>
              </select>
            </div>
          </div>
        </div>
        {callsError && <p role="alert">{callsError}</p>}
        {!calls && !callsError && <p className="wa-empty">Loading calls…</p>}
        {calls?.length === 0 && <p className="wa-empty">No calls match these filters.</p>}
        <div className="wa-account-list">
          {calls?.map((call) => (
            <article key={call._id} className="wa-account-card wa-voice-call">
              <div>
                <h3>{call.caller || "Caller ID unavailable"}</h3>
                <div className="wa-account-meta">
                  <span className={`wa-badge ${["failed", "missed"].includes(call.state) ? "off" : "on"}`}>{call.state}</span>
                  <time dateTime={call.createdAt}>{new Date(call.createdAt).toLocaleString()}</time>
                  <span>{durationLabel(call)}</span>
                  {call.model && <span>{[call.providerLabel, call.model, call.voice].filter(Boolean).join(" · ")}</span>}
                  {call.callback && <span>Callback {call.callback}</span>}
                  {call.summaryTopic && <span>Topic · {topics[call.summaryTopic]}</span>}
                  {call.errorCode && <span>Error · {call.errorCode.replaceAll("_", " ")}</span>}
                  {call.usage && <span>{Object.entries(call.usage).filter(([key]) => !key.startsWith("cached"))
                    .reduce((sum, [, value]) => sum + value, 0).toLocaleString()} model tokens</span>}
                  {call.estimatedCostUSD != null && <span>Estimated API cost {call.estimatedCostUSD.toLocaleString("en-US",
                    { style: "currency", currency: "USD", maximumFractionDigits: 4 })}</span>}
                </div>
              </div>
              {call.callback === "requested" && <button className="wa-secondary" type="button"
                disabled={Boolean(resolving)} onClick={() => resolveCallback(call._id)}>Resolve callback</button>}
            </article>
          ))}
        </div>
        {(page > 1 || hasMore) && (
          <nav aria-label="Call history pages" className="wa-toolbar-actions">
            <button className="wa-secondary" type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <span>Page {page}</span>
            <button className="wa-secondary" type="button" disabled={!hasMore} onClick={() => setPage((value) => value + 1)}>Next</button>
          </nav>
        )}
      </section>
    </div>
  );
}
