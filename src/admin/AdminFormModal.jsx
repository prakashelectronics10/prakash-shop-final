import { useEffect } from "react";
import { X } from "lucide-react";

export default function AdminFormModal({ open, title, subtitle, onClose, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="admin-form-modal-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="admin-form-modal-backdrop" aria-label="Close dialog" onClick={onClose} />
      <div className={`admin-form-modal ${wide ? "wide" : ""}`}>
        <header className="admin-form-modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="admin-form-modal-close" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="admin-form-modal-body">{children}</div>
        {footer ? <footer className="admin-form-modal-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
