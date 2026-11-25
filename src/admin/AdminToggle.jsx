import { useId } from "react";
import "./AdminToggle.css";

export default function AdminToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  selection = false,
  accessibleLabel,
  className = "",
}) {
  const id = useId();
  return (
    <label className={`admin-toggle ${className}`.trim()}>
      <input
        className="admin-toggle-input"
        type="checkbox"
        role={selection ? undefined : "switch"}
        checked={Boolean(checked)}
        disabled={disabled}
        aria-label={accessibleLabel}
        aria-labelledby={accessibleLabel ? undefined : id}
        aria-describedby={description ? `${id}-description` : undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="admin-toggle-track" aria-hidden="true" />
      <span className="admin-toggle-copy">
        <span className="admin-toggle-label" id={id}>{label}</span>
        {description && <small id={`${id}-description`}>{description}</small>}
      </span>
    </label>
  );
}
