import { useRef, useState } from "react";
import { ArrowUp, Bot } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getWhatsappHref } from "../../utils/contactDefaults";
import { usePageScroll } from "../../hooks/usePageScroll";
import whatsappImage from "../../assets/whatsapp.png";

export function FloatingUI() {
  const { contact } = useSiteData();
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

  return (
    <>
      <div
        ref={progressRef}
        style={{ transform: "scaleX(0)" }}
        className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-primary shadow-glow"
      />

      <div className="home-floating-actions" data-floating-actions>

        {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with Prakash Electronics on WhatsApp"
          className="relative z-10 inline-flex cursor-pointer pointer-events-auto home-floating-button"
        >
          <img
            src={whatsappImage}
            alt="whatsapp"
            aria-hidden="true"
            className="pointer-events-none h-12 w-12 object-contain"
          />
        </a>
        )}
        
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
        style={{ position: "fixed", right: "auto", left: "1.2rem", bottom: "2rem", zIndex: 70 }}
        className={`fixed bottom-40 right-0 left-auto z-[70] inline-flex h-12 items-center justify-center gap-2 rounded-full glass-strong border-glow px-4 text-sm font-semibold text-foreground shadow-card transition-transform duration-200 hover:scale-105 ${
          show ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-4 scale-95 opacity-0"
        }`}
      >
        <ArrowUp className="h-4 w-4 text-accent" />
      </button>
    </>
  );
}
