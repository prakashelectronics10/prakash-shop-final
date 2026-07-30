import { Bot, MessageCircle } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getWhatsappHref } from "../../utils/contactDefaults";

/**
 * Shared WhatsApp + Pulse AI floating actions for catalog pages
 * (shop products, wiring accessories, and their detail screens).
 */
export function CatalogFloatingActions() {
  const { contact } = useSiteData();
  const whatsappUrl = getWhatsappHref(contact);

  return (
    <div className="home-floating-actions" data-floating-actions>
      {whatsappUrl ? (
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
  );
}
