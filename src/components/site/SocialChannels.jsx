import {
  ArrowRight,
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  MessageCircle,
  Send,
  Twitter,
  Youtube,
} from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { OptimizedImage } from "./OptimizedImage";

const socialIcons = {
  facebook: Facebook,
  instagram: Instagram,
  linkedin: Linkedin,
  telegram: Send,
  twitter: Twitter,
  whatsapp: MessageCircle,
  youtube: Youtube,
};

function safeExternalHref(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("#") || /^(javascript|data):/i.test(raw)) return "";
  if (/^(mailto:|tel:)/i.test(raw)) return raw;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch (_error) {
    return "";
  }
}

function socialIcon(link = {}) {
  const key = `${link.platform || ""} ${link.title || ""} ${link.iconName || ""}`.toLowerCase();
  const match = Object.keys(socialIcons).find((name) => key.includes(name));
  return match ? socialIcons[match] : Globe;
}

export function SocialChannels() {
  const { content, contact } = useSiteData();
  const footer = content.footer || {};
  const socialLinks = (footer.socialLinks?.length ? footer.socialLinks : contact?.socialLinks || [])
    .map((link) => ({ ...link, href: safeExternalHref(link.url) }))
    .filter((link) => link.href);

  if (!socialLinks.length) return null;

  return (
    <section className="contact-page-social">
      <div className="internal-page-section-head">
        <p className="internal-page-kicker">Official channels</p>
        <h2>Connect with Prakash Electronics</h2>
        <p>Use these published links for updates, catalogues, and direct communication.</p>
      </div>
      <div className="contact-page-social-grid">
        {socialLinks.map((link, index) => {
          const Icon = socialIcon(link);
          return (
            <a href={link.href} target="_blank" rel="noreferrer" key={`${link.href}-${index}`}>
              <span className="contact-page-social-icon">
                {link.iconImageUrl ? (
                  <OptimizedImage src={link.iconImageUrl} alt="" width={96} height={96} className="contact-page-social-image" loading="lazy" />
                ) : <Icon aria-hidden="true" />}
              </span>
              <span><strong>{link.title || link.platform || "Official link"}</strong><small>Open channel</small></span>
              <ArrowRight aria-hidden="true" />
            </a>
          );
        })}
      </div>
    </section>
  );
}

