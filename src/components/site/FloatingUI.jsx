import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, MessageCircle } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getWhatsappHref } from "../../utils/contactDefaults";

export function FloatingUI() {
  const { contact } = useSiteData();
  const [show, setShow] = useState(false);
  const progressRef = useRef(null);
  const showRef = useRef(false);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress = Math.min(1, Math.max(0, window.scrollY / max));
        if (progressRef.current) {
          progressRef.current.style.transform = `scaleX(${progress})`;
        }
        const nextShow = window.scrollY > 420;
        if (showRef.current !== nextShow) {
          showRef.current = nextShow;
          setShow(nextShow);
        }
        frame = 0;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

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
          rel="noreferrer"
          aria-label="Chat with Prakash Electronics on WhatsApp"
          className="home-floating-button whatsapp-home-button"
        >
          <MessageCircle className="relative h-6 w-6" />
          <span>WhatsApp</span>
        </a>
        )}
        
        <a
          href="/science-ai"
          aria-label="Open Science AI"
          className="home-floating-button science-ai-home-button"
        >
          <Bot className="h-6 w-6" />
          <span>Science AI</span>
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
