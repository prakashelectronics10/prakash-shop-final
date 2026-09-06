import { ArrowRight } from "lucide-react";

export function MenuVertical({ menuItems = [], color = "#2563eb", onNavigate }) {
  return (
    <ul className="mobile-nav-menu" aria-label="Primary navigation">
      {menuItems.map((item, index) => {
        const active = Boolean(item.active);

        return (
          <li
            key={`${item.href}-${index}`}
            className={`mobile-nav-menu-item${active ? " is-active" : ""}`}
          >
            <span
              className="mobile-nav-menu-arrow"
              style={{ color }}
              aria-hidden="true"
            >
              <ArrowRight strokeWidth={2.5} />
            </span>

            <a
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className="mobile-nav-menu-link"
            >
              {item.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
