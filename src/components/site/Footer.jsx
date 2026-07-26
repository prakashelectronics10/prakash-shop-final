import {
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Twitter,
  Youtube,
} from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getSafeGoogleMapEmbedUrl } from "../../utils/maps";

const socialIconMap = {
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  MessageCircle,
  Phone,
  Send,
  Telegram: Send,
  Twitter,
  Website: Globe,
  Whatsapp: MessageCircle,
  Youtube,
};

function externalHref(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("#")) return "";
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  return `https://${value}`;
}

function socialIconFor(link) {
  const raw = String(link.iconName || link.platform || link.title || "").trim();
  const simple = raw.includes(":") ? raw.split(":").pop() : raw;
  const platform = String(link.platform || link.title || "").trim();
  const aliases = {
    whatsapp: MessageCircle,
    "whatsapp-outline": MessageCircle,
    facebook: Facebook,
    "facebook-f": Facebook,
    "facebook-square": Facebook,
    instagram: Instagram,
    twitter: Twitter,
    x: Twitter,
    "twitter-x": Twitter,
    "telegram-plane": Send,
    telegram: Send,
    send: Send,
    "youtube-play": Youtube,
    youtube: Youtube,
    linkedin: Linkedin,
    "linkedin-in": Linkedin,
    snapchat: MessageCircle,
    "snapchat-ghost": MessageCircle,
    pinterest: MapPin,
    "pinterest-p": MapPin,
    reddit: MessageCircle,
    "reddit-alien": MessageCircle,
    tiktok: Globe,
    github: Globe,
    google: Globe,
    discord: MessageCircle,
    messenger: MessageCircle,
    globe: Globe,
    "globe-outline": Globe,
    web: Globe,
    website: Globe,
    public: Globe,
    email: Mail,
    envelope: Mail,
    "mail-outline": Mail,
    phone: Phone,
    "call-outline": Phone,
    messagecircle: MessageCircle,
    "message-circle": MessageCircle,
  };
  const rawKey = raw.toLowerCase();
  const simpleKey = simple.toLowerCase();
  const platformKey = platform.toLowerCase();
  return socialIconMap[raw] || socialIconMap[simple] || aliases[rawKey] || aliases[simpleKey] || aliases[platformKey] || Globe;
}

export function Footer() {
  const { content, contact } = useSiteData();
  const footer = content.footer || {};
  const socialLinks = (footer.socialLinks || []).filter((link) => externalHref(link.url));
  const [brandFirst, ...brandRest] = String(footer.brandName || "").split(" ");
  const gridClass = socialLinks.length ? "md:grid-cols-5" : "md:grid-cols-4";
  const googleMapEmbedUrl = getSafeGoogleMapEmbedUrl(contact?.googleMapEmbedUrl);

  return (
    <footer className="relative mt-12 border-t border-border py-12">
      <div className="mx-auto max-w-7xl px-4">
        <div className={`grid gap-10 ${gridClass}`}>
          <div className="md:col-span-1">
            <div className="flex items-center gap-2">
              <img
                src="/logo512.png"
                alt="Brand logo"
                className="h-9 w-9 rounded-xl object-cover shadow-[0_0_8px_#036DFE]"
              />
              <span className="font-display text-lg font-bold">
                {brandFirst || "Prakash"}<span className="text-gradient"> {brandRest.join(" ") || "Electronics"}</span>
              </span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{footer.description}</p>
          </div>

          <FooterCol title="Quick Links" items={footer.quickLinks || []} />
          <FooterCol title="Services" items={footer.serviceLinks || []} />
          {socialLinks.length > 0 && <SocialCol title="Social Media Links" items={socialLinks} />}
          <div>
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider">Contact</h3>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {contact?.phone && <li>{contact.phone}</li>}
              {contact?.email && <li>{contact.email}</li>}
              {contact?.shortAddress && <li>{contact.shortAddress}</li>}
            </ul>
            {googleMapEmbedUrl && (
              <div className="mt-4 overflow-hidden rounded-2xl glass border-glow">
                <iframe title="Footer map" className="h-32 w-full" src={googleMapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-sm text-muted-foreground md:flex-row">
          <p>Copyright {new Date().getFullYear()} {footer.copyrightPrefix}</p>
          <p>{footer.creditText}</p>
        </div>
      </div>
    </footer>
  );
}

function SocialCol({ title, items }) {
  return (
    <div>
      <h3 className="font-display text-sm font-semibold uppercase tracking-wider">{title}</h3>
      <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
        {items.map((link) => {
          const Icon = socialIconFor(link);
          const href = externalHref(link.url);
          return (
            <li key={`${link.title || link.platform}-${href}`}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 hover:text-foreground"
              >
                {link.iconImageUrl ? <img src={link.iconImageUrl} alt="" className="h-4 w-4 rounded object-cover" loading="lazy" /> : <Icon className="h-4 w-4" />}
                <span>{link.title || link.platform || "Social link"}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FooterCol({ title, items }) {
  return (
    <div>
      <h3 className="font-display text-sm font-semibold uppercase tracking-wider">{title}</h3>
      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
        {items.map((it) => (
          <li key={it}>
            <a href={`#${it.toLowerCase().replace(/\s+/g, "-")}`} className="hover:text-foreground">{it}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
