import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileText,
  Filter,
  Loader2,
  Palette,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import {
  calculateInvoiceTotals,
  defaultInvoiceForm,
  displayInvoiceStatus,
  emptyInvoiceItem,
  formatCurrency,
  formatDate,
  formToInvoicePayload,
  invoicePrintHtml,
  invoiceTemplates,
  invoiceThemePresets,
  invoiceToForm,
} from "./invoiceUtils";
import "./InvoiceModule.css";

const API_BASE = process.env.REACT_APP_API_URL || process.env.VITE_API_URL || "/api";

function getInvoiceRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/admin/invoice";
  if (path === "/admin/invoice/create") return { mode: "create" };
  if (path === "/admin/invoice/history") return { mode: "history" };
  const detail = path.match(/^\/admin\/invoice\/([^/]+)$/);
  if (detail) return { mode: "detail", id: detail[1] };
  return { mode: "dashboard" };
}

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/api/")) {
    if (/^https?:\/\//i.test(API_BASE)) return `${API_BASE.replace(/\/api\/?$/i, "")}${path}`;
    return path;
  }
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export default function InvoiceModule({ apiFetch }) {
  const [route, setRoute] = useState(getInvoiceRoute);
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(defaultInvoiceForm());
  const [filters, setFilters] = useState({ search: "", status: "all", sort: "newest", dateFrom: "", dateTo: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [successInvoice, setSuccessInvoice] = useState(null);

  const totals = useMemo(() => calculateInvoiceTotals(form.items), [form.items]);

  const navigate = (path) => {
    window.history.pushState({}, "", path);
    setRoute(getInvoiceRoute());
  };

  const loadInvoices = async (nextFilters = filters) => {
    setLoading(true);
    setMessage("");
    try {
      const query = new URLSearchParams();
      query.set("limit", "80");
      Object.entries(nextFilters).forEach(([key, value]) => {
        if (value) query.set(key, value);
      });
      const response = await apiFetch(`/invoices?${query.toString()}`);
      setInvoices(response.data?.items || []);
      setStats(response.data?.stats || {});
    } catch (error) {
      setMessage(error.message || "Unable to load invoices");
    } finally {
      setLoading(false);
    }
  };

  const loadNextNumber = async () => {
    try {
      const response = await apiFetch("/invoices/next-number");
      return response.data?.invoiceNumber || "Auto generated";
    } catch (_error) {
      return "Auto generated";
    }
  };

  const loadInvoice = async (id) => {
    if (!id) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await apiFetch(`/invoices/${id}`);
      setSelectedInvoice(response.data);
    } catch (error) {
      setMessage(error.message || "Unable to load invoice");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onPop = () => setRoute(getInvoiceRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (route.mode === "detail") loadInvoice(route.id);
    if (route.mode === "create" && !editingId) {
      loadNextNumber().then((invoiceNumber) => setForm(defaultInvoiceForm(invoiceNumber)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.mode, route.id]);

  const updateFilters = (patch) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    loadInvoices(next);
  };

  const startCreate = async () => {
    setEditingId("");
    setSuccessInvoice(null);
    setSelectedInvoice(null);
    setForm(defaultInvoiceForm(await loadNextNumber()));
    navigate("/admin/invoice/create");
  };

  const startEdit = (invoice) => {
    setEditingId(invoice._id || invoice.id);
    setSuccessInvoice(null);
    setSelectedInvoice(invoice);
    setForm(invoiceToForm(invoice));
    navigate("/admin/invoice/create");
  };

  const saveInvoice = async () => {
    setSaving(true);
    setMessage("");
    try {
      const payload = formToInvoicePayload({ ...form, totals });
      const response = editingId
        ? await apiFetch(`/invoices/${editingId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch("/invoices/create", { method: "POST", body: JSON.stringify(payload) });
      setSuccessInvoice(response.data);
      setSelectedInvoice(response.data);
      setEditingId(response.data?._id || response.data?.id || "");
      await loadInvoices();
    } catch (error) {
      setMessage(error.message || "Invoice save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteInvoice = async (invoice) => {
    const id = invoice?._id || invoice?.id;
    if (!id) return;
    if (!window.confirm(`Delete invoice ${invoice.invoiceNumber}?`)) return;
    setLoading(true);
    try {
      await apiFetch(`/invoices/${id}`, { method: "DELETE" });
      setSelectedInvoice(null);
      await loadInvoices();
      navigate("/admin/invoice/history");
    } catch (error) {
      setMessage(error.message || "Invoice delete failed");
    } finally {
      setLoading(false);
    }
  };

  const printInvoice = (invoice) => {
    const printable = invoice || { ...form, totals };
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=920,height=860");
    if (!printWindow) {
      setMessage("Popup blocked. Allow popups to print the invoice.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(invoicePrintHtml(printable));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 350);
  };

  const downloadPdf = async (invoice) => {
    const id = invoice?._id || invoice?.id;
    if (!id) {
      setMessage("Save the invoice before downloading the PDF.");
      return;
    }
    setPdfLoading(true);
    window.setTimeout(() => setPdfLoading(false), 900);
    window.open(apiUrl(`/invoices/${id}/pdf`), "_blank", "noopener,noreferrer");
  };

  const shareInvoice = async (invoice) => {
    if (!invoice) return;
    const url = apiUrl(invoice.pdfUrl || `/invoices/${invoice._id || invoice.id}/pdf`);
    try {
      if (navigator.share) {
        await navigator.share({
          title: invoice.invoiceNumber,
          text: `Invoice ${invoice.invoiceNumber} - ${formatCurrency(invoice.totals?.grandTotal)}`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage("Invoice PDF link copied.");
    } catch (error) {
      setMessage(error.message || "Unable to share invoice");
    }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("image", file);
    setMessage("");
    try {
      const response = await apiFetch("/admin/upload/image", { method: "POST", body: formData, timeout: 45000 });
      setForm((current) => ({
        ...current,
        business: {
          ...current.business,
          logoUrl: response.data?.url || "",
          logoPublicId: response.data?.publicId || "",
        },
      }));
    } catch (error) {
      setMessage(error.message || "Logo upload failed");
    }
  };

  if (successInvoice && route.mode === "create") {
    return (
      <InvoiceSuccessScreen
        invoice={successInvoice}
        onDownload={() => downloadPdf(successInvoice)}
        onPrint={() => printInvoice(successInvoice)}
        onShare={() => shareInvoice(successInvoice)}
        onView={() => navigate(`/admin/invoice/${successInvoice._id || successInvoice.id}`)}
        onCreateAnother={startCreate}
        pdfLoading={pdfLoading}
      />
    );
  }

  return (
    <section className="invoice-module">
      {message && <div className="invoice-alert glass-panel">{message}</div>}
      {route.mode === "dashboard" && (
        <InvoiceDashboard
          stats={stats}
          invoices={invoices.slice(0, 6)}
          loading={loading}
          onCreate={startCreate}
          onHistory={() => navigate("/admin/invoice/history")}
          onOpen={(invoice) => navigate(`/admin/invoice/${invoice._id || invoice.id}`)}
          onRefresh={() => loadInvoices()}
        />
      )}
      {route.mode === "history" && (
        <InvoiceHistory
          invoices={invoices}
          filters={filters}
          loading={loading}
          onChangeFilters={updateFilters}
          onCreate={startCreate}
          onOpen={(invoice) => navigate(`/admin/invoice/${invoice._id || invoice.id}`)}
          onEdit={startEdit}
          onDelete={deleteInvoice}
          onDownload={downloadPdf}
          onPrint={printInvoice}
        />
      )}
      {route.mode === "create" && (
        <InvoiceForm
          form={form}
          setForm={setForm}
          totals={totals}
          saving={saving}
          editing={Boolean(editingId)}
          onSave={saveInvoice}
          onCancel={() => navigate(editingId ? `/admin/invoice/${editingId}` : "/admin/invoice")}
          onPrint={() => printInvoice()}
          onUploadLogo={uploadLogo}
        />
      )}
      {route.mode === "detail" && (
        <InvoiceDetail
          invoice={selectedInvoice}
          loading={loading}
          onBack={() => navigate("/admin/invoice/history")}
          onEdit={startEdit}
          onDelete={deleteInvoice}
          onDownload={downloadPdf}
          onPrint={printInvoice}
          onShare={shareInvoice}
          pdfLoading={pdfLoading}
        />
      )}
    </section>
  );
}

function InvoiceDashboard({ stats, invoices, loading, onCreate, onHistory, onOpen, onRefresh }) {
  const cards = [
    { label: "Total Invoices", value: stats.totalInvoices || 0, tone: "blue" },
    { label: "Paid", value: stats.paidInvoices || 0, tone: "green" },
    { label: "Pending", value: stats.pendingInvoices || 0, tone: "amber" },
    { label: "Overdue", value: stats.overdueInvoices || 0, tone: "red" },
  ];

  return (
    <div className="invoice-page-grid">
      <div className="invoice-hero glass-panel">
        <div>
          <p className="eyebrow">Invoice Management System</p>
          <h2>Generate branded invoices with live preview, themes, PDF export, and history.</h2>
          <p>Built for fast billing from desktop, tablet, and admin mobile workflows.</p>
        </div>
        <div className="invoice-hero-actions">
          <button className="invoice-primary" type="button" onClick={onCreate}>
            <Plus size={18} />
            Create Invoice
          </button>
          <button className="invoice-ghost" type="button" onClick={onHistory}>
            <FileText size={18} />
            History
          </button>
          <button className="invoice-icon-button" type="button" onClick={onRefresh} aria-label="Refresh invoices">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="invoice-stat-grid">
        {cards.map((card) => (
          <article className={`invoice-stat-card glass-panel ${card.tone}`} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>This month ready</small>
          </article>
        ))}
      </div>

      <div className="invoice-two-pane">
        <div className="invoice-panel glass-panel">
          <div className="invoice-panel-head">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h3>Latest Invoices</h3>
            </div>
            <button className="invoice-ghost compact" type="button" onClick={onHistory}>View All</button>
          </div>
          {loading ? <InvoiceLoading /> : null}
          {!loading && invoices.length === 0 ? <p className="muted">No invoices yet. Create the first invoice to start history.</p> : null}
          <div className="invoice-history-stack">
            {invoices.map((invoice) => (
              <InvoiceHistoryCard key={invoice._id || invoice.id} invoice={invoice} onOpen={() => onOpen(invoice)} />
            ))}
          </div>
        </div>
        <div className="invoice-panel glass-panel">
          <div className="invoice-panel-head">
            <div>
              <p className="eyebrow">Premium templates</p>
              <h3>Template System</h3>
            </div>
            <Palette size={20} />
          </div>
          <div className="invoice-template-showcase">
            {invoiceTemplates.map((template) => (
              <div className={`invoice-template-mini ${template.value}`} key={template.value}>
                <span />
                <strong>{template.label}</strong>
                <small>Live preview ready</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoiceHistory({ invoices, filters, loading, onChangeFilters, onCreate, onOpen, onEdit, onDelete, onDownload, onPrint }) {
  return (
    <div className="invoice-page-grid">
      <div className="invoice-panel glass-panel">
        <div className="invoice-history-header">
          <div>
            <p className="eyebrow">Invoices</p>
            <h2>Invoice List / History</h2>
          </div>
          <button className="invoice-primary" type="button" onClick={onCreate}>
            <Plus size={18} />
            Create Invoice
          </button>
        </div>
        <div className="invoice-filters">
          <label className="invoice-search">
            <Search size={18} />
            <input
              value={filters.search}
              onChange={(event) => onChangeFilters({ search: event.target.value })}
              placeholder="Search invoice number, customer, phone..."
            />
          </label>
          <SelectControl
            icon={<Filter size={16} />}
            value={filters.status}
            onChange={(status) => onChangeFilters({ status })}
            options={[
              ["all", "All"],
              ["paid", "Paid"],
              ["pending", "Pending"],
              ["partial", "Partial"],
              ["overdue", "Overdue"],
            ]}
          />
          <SelectControl
            value={filters.sort}
            onChange={(sort) => onChangeFilters({ sort })}
            options={[
              ["newest", "Newest"],
              ["oldest", "Oldest"],
              ["amountHigh", "Amount high"],
              ["amountLow", "Amount low"],
              ["dueDate", "Due date"],
            ]}
          />
          <input className="invoice-filter-input" type="date" value={filters.dateFrom} onChange={(event) => onChangeFilters({ dateFrom: event.target.value })} />
          <input className="invoice-filter-input" type="date" value={filters.dateTo} onChange={(event) => onChangeFilters({ dateTo: event.target.value })} />
        </div>

        {loading ? <InvoiceLoading /> : null}
        {!loading && invoices.length === 0 ? <p className="muted">No invoices match the selected filters.</p> : null}
        <div className="invoice-history-stack">
          {invoices.map((invoice) => (
            <InvoiceHistoryCard
              key={invoice._id || invoice.id}
              invoice={invoice}
              onOpen={() => onOpen(invoice)}
              actions={
                <>
                  <button type="button" onClick={() => onEdit(invoice)}><Edit3 size={15} />Edit</button>
                  <button type="button" onClick={() => onDownload(invoice)}><Download size={15} />PDF</button>
                  <button type="button" onClick={() => onPrint(invoice)}><Printer size={15} />Print</button>
                  <button className="danger" type="button" onClick={() => onDelete(invoice)}><Trash2 size={15} />Delete</button>
                </>
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function InvoiceForm({ form, setForm, totals, saving, editing, onSave, onCancel, onPrint, onUploadLogo }) {
  const update = (path, value) => {
    setForm((current) => {
      const [section, key] = path.split(".");
      if (!key) return { ...current, [path]: value };
      return { ...current, [section]: { ...current[section], [key]: value } };
    });
  };

  const updateItem = (index, patch) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const addItem = () => setForm((current) => ({ ...current, items: [...current.items, emptyInvoiceItem()] }));
  const removeItem = (index) => {
    setForm((current) => ({
      ...current,
      items: current.items.length > 1 ? current.items.filter((_, itemIndex) => itemIndex !== index) : current.items,
    }));
  };

  return (
    <div className="invoice-create-grid">
      <div className="invoice-form-stack">
        <div className="invoice-panel glass-panel">
          <div className="invoice-panel-head">
            <div>
              <p className="eyebrow">{editing ? "Edit invoice" : "Create Invoice"}</p>
              <h2>Business & Customer Details</h2>
            </div>
            <button className="invoice-ghost compact" type="button" onClick={onCancel}>Cancel</button>
          </div>
          <div className="invoice-form-grid">
            <TextField label="Shop/Business Name" value={form.business.name} onChange={(value) => update("business.name", value)} required />
            <TextField label="Contact Number" value={form.business.contactNumber} onChange={(value) => update("business.contactNumber", value)} required />
            <TextField label="Email Address" value={form.business.email} onChange={(value) => update("business.email", value)} type="email" required />
            <TextField label="Website URL" value={form.business.websiteUrl} onChange={(value) => update("business.websiteUrl", value)} />
            <TextField label="GST Number (optional)" value={form.business.gstNumber} onChange={(value) => update("business.gstNumber", value)} />
            <LogoField value={form.business.logoUrl} onChange={(value) => update("business.logoUrl", value)} onUpload={onUploadLogo} />
            <TextArea label="Shop Address" value={form.business.address} onChange={(value) => update("business.address", value)} required />
          </div>
        </div>

        <div className="invoice-panel glass-panel">
          <h3>Customer Details</h3>
          <div className="invoice-form-grid">
            <TextField label="Customer Name" value={form.customer.name} onChange={(value) => update("customer.name", value)} required />
            <TextField label="Phone Number" value={form.customer.phone} onChange={(value) => update("customer.phone", value)} required />
            <TextField label="Email (optional)" value={form.customer.email} onChange={(value) => update("customer.email", value)} type="email" />
            <TextField label="Customer ID (optional)" value={form.customer.customerId} onChange={(value) => update("customer.customerId", value)} />
            <TextArea label="Address" value={form.customer.address} onChange={(value) => update("customer.address", value)} required />
          </div>
        </div>

        <div className="invoice-panel glass-panel">
          <h3>Invoice Details</h3>
          <div className="invoice-form-grid">
            <TextField label="Invoice Number" value={form.invoiceNumber} onChange={(value) => update("invoiceNumber", value)} readOnly />
            <TextField label="Invoice Date" value={form.invoiceDate} onChange={(value) => update("invoiceDate", value)} type="date" required />
            <TextField label="Due Date" value={form.dueDate} onChange={(value) => update("dueDate", value)} type="date" required />
            <SelectField
              label="Payment Status"
              value={form.paymentStatus}
              onChange={(value) => update("paymentStatus", value)}
              options={[
                ["paid", "Paid"],
                ["pending", "Pending"],
                ["partial", "Partial"],
              ]}
            />
          </div>
        </div>

        <div className="invoice-panel glass-panel">
          <div className="invoice-panel-head">
            <div>
              <h3>Product / Service Items</h3>
              <p className="muted">Totals update live as you type.</p>
            </div>
            <button className="invoice-ghost compact" type="button" onClick={addItem}>
              <Plus size={16} />
              Add Item
            </button>
          </div>
          <div className="invoice-items-stack">
            {form.items.map((item, index) => (
              <InvoiceItemCard key={index} item={item} index={index} onChange={(patch) => updateItem(index, patch)} onRemove={() => removeItem(index)} canRemove={form.items.length > 1} />
            ))}
          </div>
          <InvoiceTotals totals={totals} />
        </div>

        <div className="invoice-panel glass-panel">
          <InvoiceThemePicker
            template={form.template}
            theme={form.theme}
            onTemplateChange={(template) => update("template", template)}
            onThemeChange={(theme) => setForm((current) => ({ ...current, theme: { ...current.theme, ...theme } }))}
          />
        </div>

        <div className="invoice-panel glass-panel">
          <TextArea label="Notes" value={form.notes} onChange={(value) => update("notes", value)} />
          <TextField label="Signature Label" value={form.signatureLabel} onChange={(value) => update("signatureLabel", value)} />
          <div className="invoice-action-row">
            <button className="invoice-ghost" type="button" onClick={onPrint}>
              <Printer size={17} />
              Print Preview
            </button>
            <button className="invoice-primary" type="button" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
              {saving ? "Generating..." : editing ? "Update Invoice" : "Generate Invoice"}
            </button>
          </div>
        </div>
      </div>

      <aside className="invoice-preview-sticky">
        <InvoicePreview invoice={{ ...form, totals }} />
      </aside>
    </div>
  );
}

function InvoiceItemCard({ item, index, onChange, onRemove, canRemove }) {
  const calculated = calculateInvoiceTotals([item]);
  return (
    <article className="invoice-item-card">
      <div className="invoice-item-head">
        <strong>Item {index + 1}</strong>
        <button type="button" onClick={onRemove} disabled={!canRemove} aria-label="Remove item">
          <Trash2 size={16} />
        </button>
      </div>
      <div className="invoice-item-grid">
        <TextField label="Product/Service Name" value={item.name} onChange={(value) => onChange({ name: value })} required />
        <TextField label="Quantity" value={item.quantity} onChange={(value) => onChange({ quantity: value })} type="number" />
        <TextField label="Unit Price" value={item.unitPrice} onChange={(value) => onChange({ unitPrice: value })} type="number" />
        <TextField label="Discount" value={item.discount} onChange={(value) => onChange({ discount: value })} type="number" />
        <TextField label="Tax %" value={item.taxRate} onChange={(value) => onChange({ taxRate: value })} type="number" />
        <div className="invoice-item-total">
          <span>Total Price</span>
          <strong>{formatCurrency(calculated.grandTotal)}</strong>
        </div>
      </div>
    </article>
  );
}

function InvoiceThemePicker({ template, theme, onTemplateChange, onThemeChange }) {
  const colorFields = [
    ["primaryColor", "Theme color"],
    ["accentColor", "Accent color"],
    ["buttonColor", "Button color"],
    ["headerColor", "Header color"],
  ];

  return (
    <div className="invoice-theme-picker">
      <div className="invoice-panel-head">
        <div>
          <p className="eyebrow">Preview & Theme</p>
          <h3>Template and Colors</h3>
        </div>
        <Palette size={20} />
      </div>
      <div className="invoice-template-grid">
        {invoiceTemplates.map((item) => (
          <button
            className={template === item.value ? "active" : ""}
            type="button"
            key={item.value}
            onClick={() => onTemplateChange(item.value)}
          >
            <span className={`template-thumb ${item.value}`} />
            {item.label}
          </button>
        ))}
      </div>
      <div className="invoice-preset-row">
        {invoiceThemePresets.map((preset) => (
          <button
            type="button"
            key={preset.name}
            className="invoice-color-preset"
            onClick={() => onThemeChange(preset)}
            aria-label={`Apply ${preset.name} theme`}
            title={preset.name}
          >
            <span style={{ background: preset.primaryColor }} />
            <span style={{ background: preset.accentColor }} />
          </button>
        ))}
      </div>
      <div className="invoice-color-grid">
        {colorFields.map(([key, label]) => (
          <label className="invoice-color-field" key={key}>
            <span>{label}</span>
            <input type="color" value={theme[key]} onChange={(event) => onThemeChange({ [key]: event.target.value })} />
            <em>{theme[key]}</em>
          </label>
        ))}
      </div>
    </div>
  );
}

function InvoicePreview({ invoice }) {
  const totals = invoice.totals || calculateInvoiceTotals(invoice.items);
  const status = displayInvoiceStatus(invoice);
  const theme = invoice.theme || invoiceThemePresets[0];
  const previewStyle = {
    "--invoice-primary": theme.primaryColor,
    "--invoice-accent": theme.accentColor,
    "--invoice-header": theme.headerColor,
    "--invoice-bg": theme.backgroundColor,
    "--invoice-text": theme.textColor,
  };

  return (
    <div className={`invoice-preview ${invoice.template || "modern-blue"}`} style={previewStyle}>
      <div className="invoice-preview-header">
        <div className="invoice-preview-brand">
          {invoice.business?.logoUrl ? <img src={invoice.business.logoUrl} alt="" /> : <span>PE</span>}
          <div>
            <h3>{invoice.business?.name || "Business Name"}</h3>
            <p>{invoice.business?.address || "Business address"}</p>
          </div>
        </div>
        <div className="invoice-preview-title">
          <strong>INVOICE</strong>
          <span>{invoice.invoiceNumber || "Auto generated"}</span>
          <InvoiceStatusBadge status={status} />
        </div>
      </div>

      <div className="invoice-preview-meta">
        <div>
          <span>Bill To</span>
          <strong>{invoice.customer?.name || "Customer Name"}</strong>
          <small>{invoice.customer?.phone || "Phone number"}</small>
          <small>{invoice.customer?.address || "Customer address"}</small>
        </div>
        <div>
          <span>Invoice Date</span>
          <strong>{formatDate(invoice.invoiceDate)}</strong>
          <span>Due Date</span>
          <strong>{formatDate(invoice.dueDate)}</strong>
        </div>
      </div>

      <div className="invoice-preview-table">
        <div className="invoice-preview-row head">
          <span>Item</span>
          <span>Qty</span>
          <span>Total</span>
        </div>
        {(invoice.items || []).map((item, index) => {
          const row = calculateInvoiceTotals([item]);
          return (
            <div className="invoice-preview-row" key={`${item.name}-${index}`}>
              <span>{item.name || `Item ${index + 1}`}</span>
              <span>{item.quantity || 0}</span>
              <span>{formatCurrency(row.grandTotal)}</span>
            </div>
          );
        })}
      </div>

      <InvoiceTotals totals={totals} compact />

      <div className="invoice-preview-footer">
        <p>{invoice.notes || "Thank you for your business."}</p>
        <div>
          <span />
          <small>{invoice.signatureLabel || "Authorised Signature"}</small>
        </div>
      </div>
    </div>
  );
}

function InvoiceStatusBadge({ status }) {
  const safeStatus = String(status || "pending").toLowerCase();
  return <span className={`invoice-status-badge ${safeStatus}`}>{safeStatus}</span>;
}

function InvoiceHistoryCard({ invoice, onOpen, actions }) {
  const status = displayInvoiceStatus(invoice);
  return (
    <article className="invoice-history-card">
      <button type="button" className="invoice-history-main" onClick={onOpen}>
        <span className="invoice-history-icon"><FileText size={18} /></span>
        <span>
          <strong>{invoice.invoiceNumber}</strong>
          <small>{invoice.customer?.name || "Customer"} - {formatDate(invoice.invoiceDate)}</small>
        </span>
        <b>{formatCurrency(invoice.totals?.grandTotal)}</b>
        <InvoiceStatusBadge status={status} />
      </button>
      {actions ? <div className="invoice-history-actions">{actions}</div> : null}
    </article>
  );
}

function InvoiceDetail({ invoice, loading, onBack, onEdit, onDelete, onDownload, onPrint, onShare, pdfLoading }) {
  if (loading) return <InvoiceLoading />;
  if (!invoice) {
    return (
      <div className="invoice-panel glass-panel">
        <p className="muted">Invoice not found.</p>
        <button className="invoice-ghost" type="button" onClick={onBack}>Back to history</button>
      </div>
    );
  }

  return (
    <div className="invoice-detail-grid">
      <div className="invoice-panel glass-panel">
        <div className="invoice-history-header">
          <div>
            <p className="eyebrow">Invoice Detail</p>
            <h2>{invoice.invoiceNumber}</h2>
          </div>
          <InvoiceStatusBadge status={displayInvoiceStatus(invoice)} />
        </div>
        <div className="invoice-action-row">
          <button className="invoice-ghost" type="button" onClick={onBack}>History</button>
          <button className="invoice-ghost" type="button" onClick={() => onEdit(invoice)}><Edit3 size={16} />Edit</button>
          <button className="invoice-ghost" type="button" onClick={() => onPrint(invoice)}><Printer size={16} />Print</button>
          <button className="invoice-primary" type="button" onClick={() => onDownload(invoice)} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
            Download PDF
          </button>
          <button className="invoice-ghost" type="button" onClick={() => onShare(invoice)}><Share2 size={16} />Share</button>
          <button className="invoice-danger" type="button" onClick={() => onDelete(invoice)}><Trash2 size={16} />Delete</button>
        </div>
        <InvoicePreview invoice={invoice} />
      </div>
      <InvoicePDFViewer invoice={invoice} />
    </div>
  );
}

function InvoicePDFViewer({ invoice }) {
  const url = apiUrl(invoice.pdfUrl || `/invoices/${invoice._id || invoice.id}/pdf`);
  return (
    <aside className="invoice-panel glass-panel invoice-pdf-viewer">
      <div className="invoice-panel-head">
        <div>
          <p className="eyebrow">PDF Preview</p>
          <h3>Downloadable Invoice</h3>
        </div>
        <Eye size={20} />
      </div>
      <iframe title="Invoice PDF" src={url} />
      <a className="invoice-primary" href={url} target="_blank" rel="noreferrer">
        <Download size={17} />
        Open PDF
      </a>
    </aside>
  );
}

function InvoiceSuccessScreen({ invoice, onDownload, onPrint, onShare, onView, onCreateAnother, pdfLoading }) {
  return (
    <div className="invoice-success glass-panel">
      <div className="invoice-success-check">
        <CheckCircle2 size={58} />
      </div>
      <h2>Invoice Generated Successfully</h2>
      <p>Your invoice has been created, saved to the database, and is ready for export.</p>
      <div className="invoice-success-summary">
        <span>Invoice Number</span><strong>{invoice.invoiceNumber}</strong>
        <span>Customer</span><strong>{invoice.customer?.name}</strong>
        <span>Total Amount</span><strong>{formatCurrency(invoice.totals?.grandTotal)}</strong>
        <span>Status</span><InvoiceStatusBadge status={displayInvoiceStatus(invoice)} />
      </div>
      <div className="invoice-action-row center">
        <button className="invoice-primary" type="button" onClick={onView}>View Invoice</button>
        <button className="invoice-ghost" type="button" onClick={onDownload} disabled={pdfLoading}>
          {pdfLoading ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
          Download PDF
        </button>
        <button className="invoice-ghost" type="button" onClick={onPrint}><Printer size={16} />Print</button>
        <button className="invoice-ghost" type="button" onClick={onShare}><Share2 size={16} />Share</button>
        <button className="invoice-ghost" type="button" onClick={onCreateAnother}><Plus size={16} />Create Another</button>
      </div>
    </div>
  );
}

function InvoiceTotals({ totals, compact = false }) {
  return (
    <div className={`invoice-totals ${compact ? "compact" : ""}`}>
      <div><span>Subtotal</span><strong>{formatCurrency(totals.subtotal)}</strong></div>
      <div><span>Discount</span><strong>-{formatCurrency(totals.discountTotal)}</strong></div>
      <div><span>Tax</span><strong>{formatCurrency(totals.taxTotal)}</strong></div>
      <div className="grand"><span>Grand Total</span><strong>{formatCurrency(totals.grandTotal)}</strong></div>
    </div>
  );
}

function TextField({ label, value, onChange, type = "text", required = false, readOnly = false }) {
  return (
    <label className="invoice-field">
      <span>{label}{required ? " *" : ""}</span>
      <input type={type} value={value ?? ""} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange, required = false }) {
  return (
    <label className="invoice-field wide">
      <span>{label}{required ? " *" : ""}</span>
      <textarea value={value ?? ""} onChange={(event) => onChange(event.target.value)} rows={3} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="invoice-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function SelectControl({ value, onChange, options, icon }) {
  return (
    <label className="invoice-select-control">
      {icon}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function LogoField({ value, onChange, onUpload }) {
  return (
    <div className="invoice-field">
      <span>Business Logo</span>
      <div className="invoice-logo-field">
        <span className="invoice-logo-preview">
          {value ? <img src={value} alt="" /> : <FileText size={18} />}
        </span>
        <input value={value || ""} onChange={(event) => onChange(event.target.value)} placeholder="Logo URL" />
        <label className="invoice-upload-button">
          Upload
          <input type="file" accept="image/*" onChange={(event) => onUpload(event.target.files?.[0])} />
        </label>
      </div>
    </div>
  );
}

function InvoiceLoading() {
  return (
    <div className="invoice-loading">
      <Loader2 className="spin" size={20} />
      Loading invoices...
    </div>
  );
}
