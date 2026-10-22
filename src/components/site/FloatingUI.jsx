import { useRef, useState } from "react";
import { ArrowUp, Bot } from "lucide-react";
import { useCart } from "../../context/CartContext";
import { useSiteData } from "../../context/SiteDataContext";
import { getWhatsappHref } from "../../utils/contactDefaults";
import { usePageScroll } from "../../hooks/usePageScroll";
import whatsappImage from "../../assets/whatsapp.png";

export function FloatingUI() {
  const { contact } = useSiteData();
  const { items } = useCart();
  const [show, setShow] = useState(false);
  const progressRef = useRef(null);
  const showRef = useRef(false);

  usePageScroll(({ scrollY, progress }) => {
    if (progressRef.current) {
      progressRef.current.style.transform = `scaleX(${progress})`;
    }
    const nextShow = scrollY > 420;
    if (showRef.current !== nextShow) {
      showRef.current = nextShow;
      setShow(nextShow);
    }
  });

  const whatsappUrl = getWhatsappHref(contact);
  const isCartPage = window.location.pathname.replace(/\/+$/, "") === "/cart";
  const raiseAboveCheckout = isCartPage && items.length > 0;

  return (
    <>
      <div
        ref={progressRef}
        style={{ transform: "scaleX(0)" }}
        className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-primary shadow-glow"
      />

      <div
        className={`home-floating-actions${raiseAboveCheckout ? " home-floating-actions--above-cart" : ""}`}
        data-floating-actions
      >
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat with Prakash Electronics on WhatsApp"
            className="relative z-10 inline-flex cursor-pointer pointer-events-auto home-floating-button whatsapp-home-button"
          >
            <img
              src={whatsappImage}
              alt=""
              aria-hidden="true"
              className="pointer-events-none h-9 w-9 object-contain"
              width={36}
              height={36}
              decoding="async"
              loading="lazy"
            />
          </a>
        ) : null}

        <a
          href="/pulse-ai"
          aria-label="Open Pulse AI"
          className="home-floating-button science-ai-home-button"
        >
          <Bot className="h-6 w-6" />
          <span>Pulse AI</span>
        </a>
      </div>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Back to top"
        className={`back-to-top${raiseAboveCheckout ? " back-to-top--above-cart" : ""}${show ? " is-visible" : ""}`}
      >
        <ArrowUp className="back-to-top-icon" strokeWidth={2.75} aria-hidden="true" />
      </button>
    </>
  );
}
