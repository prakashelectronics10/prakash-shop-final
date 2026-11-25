import { ArrowRight } from "lucide-react";
import "./ArrowFillButton.css";

// Adapted from the supplied Hyperiux Vault Arrow Fill Button.
export function ArrowFillButton({ href, children, className = "" }) {
  return (
    <a className={`arrow-fill-button ${className}`.trim()} href={href}>
      <span>{children}</span>
      <span className="arrow-fill-button__fill" aria-hidden="true" />
      <span className="arrow-fill-button__label-fill" aria-hidden="true">{children}</span>
      <span className="arrow-fill-button__icon" aria-hidden="true">
        <ArrowRight className="arrow-fill-button__arrow-in" strokeWidth={1.8} />
        <ArrowRight className="arrow-fill-button__arrow-out" strokeWidth={1.8} />
      </span>
    </a>
  );
}
