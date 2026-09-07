import { ChevronDown } from "lucide-react";
import { useState } from "react";

export function FaqSection({ eyebrow = "FAQs", title, description, items = [] }) {
  const [openIndex, setOpenIndex] = useState(0);

  if (!items.length) return null;

  return (
    <section className="internal-faq-section">
      <div className="internal-faq-inner">
        <header className="internal-faq-heading">
          <p className="internal-page-kicker">{eyebrow}</p>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </header>
        <div className="internal-faq-list">
          {items.map((item, index) => {
            const isOpen = index === openIndex;
            return (
              <article className={isOpen ? "is-open" : ""} key={item.question}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  >
                    <span>{item.question}</span>
                    <ChevronDown aria-hidden="true" />
                  </button>
                </h3>
                <div className="internal-faq-answer" aria-hidden={!isOpen}>
                  <div><p>{item.answer}</p></div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

