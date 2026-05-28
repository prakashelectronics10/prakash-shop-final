import { useState } from "react";
import { Phone, MessageCircle, MapPin, Mail, Send, Star } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { apiRequest } from "../../api/client";
import { getSafeGoogleMapEmbedUrl } from "../../utils/maps";
import { getPhoneHref, getWhatsappHref } from "../../utils/contactDefaults";

const FORMSPREE_ENDPOINT = "https://formspree.io/f/xykobjne";

export function Contact({ sectionId = "contact" }) {
  const { contact, content } = useSiteData("contact");
  const [status, setStatus] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const formspreeEndpoint = contact?.formspreeEndpoint || FORMSPREE_ENDPOINT;
  const whatsappHref = getWhatsappHref(contact);
  const googleMapEmbedUrl = getSafeGoogleMapEmbedUrl(contact?.googleMapEmbedUrl);
  const streetViewEmbedUrl = getSafeGoogleMapEmbedUrl(contact?.streetViewEmbedUrl);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!reviewRating) {
      setStatus("Please select a star rating.");
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    setStatus("Sending...");

    try {
      const payload = Object.fromEntries(formData.entries());
      payload.reviewRating = reviewRating;

      const response = await apiRequest("/public/contact", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!response.emailQueued) throw new Error("Contact email was not queued");

      form.reset();
      setReviewRating(0);
      setHoverRating(0);
      setStatus("Request sent successfully.");
    } catch (_error) {
      try {
        const fallbackResponse = await fetch(formspreeEndpoint, {
          method: "POST",
          body: formData,
          headers: { Accept: "application/json" },
        });

        if (!fallbackResponse.ok) throw new Error("Formspree submission failed");

        await apiRequest("/analytics/form-submit", {
          method: "POST",
          body: JSON.stringify({}),
        }).catch(() => undefined);

        form.reset();
        setReviewRating(0);
        setHoverRating(0);
        setStatus("Request sent successfully.");
      } catch (_fallbackError) {
        setStatus("Unable to submit right now. Please call or WhatsApp us.");
      }
    }
  };

  return (
    <section id={sectionId || undefined} className="relative overflow-hidden py-24">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
            Review section
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl md:text-5xl">
            Give your personal<span className="text-gradient"> Review</span>
          </h2>
          <p className="mt-4 text-muted-foreground">Don't Forget to give your review</p>
        </div>

        <div className="mt-14 grid min-w-0 gap-6 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3">
            <form
              action={formspreeEndpoint}
              method="post"
              encType="multipart/form-data"
              onSubmit={handleSubmit}
              className="mx-auto w-full max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl glass-strong border-glow p-4 shadow-elegant sm:max-w-none sm:p-6 md:p-8"
            >
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <Field label="Full Name" name="name" placeholder="John Doe" required />
                <Field label="Phone" name="phone" placeholder="+91 99999 99999" required />
                <Field label="Email" name="email" type="email" placeholder="you@email.com" />
                <StarRatingField
                  rating={reviewRating}
                  hoverRating={hoverRating}
                  onChange={setReviewRating}
                  onHover={setHoverRating}
                />
              </div>
              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium text-muted-foreground">
                  Message
                </label>
                <textarea
                  name="message"
                  rows={4}
                  placeholder="Additional details or questions..."
                  className="w-full min-w-0 max-w-full resize-y rounded-xl glass border border-border bg-transparent px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
                />
              </div>
              <button
                type="submit"
                style={{letterSpacing:"1px"}}
                className="mt-6 inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-xl bg-gradient-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-transform duration-300 hover:scale-[1.02]"
              >
                <Send className="h-4 w-4" />
                <span className="min-w-0 break-words">{content?.submitButtonText || "Submit Review"}</span>
              </button>
              {status && <p className="mt-4 text-center text-sm text-muted-foreground">{status}</p>}
            </form>
          </div>

          <div className="mx-auto w-full max-w-[calc(100vw-2rem)] min-w-0 space-y-4 lg:col-span-2 lg:max-w-none">
            {contact?.phone && (
              <InfoCard icon={Phone} title="Call Us" value={contact.phone} href={getPhoneHref(contact)} />
            )}
            {whatsappHref && (
              <InfoCard icon={MessageCircle} title="WhatsApp" value="Chat instantly" href={whatsappHref} />
            )}
            {contact?.email && (
              <InfoCard icon={Mail} title="Email" value={contact.email} href={`mailto:${contact.email}`} />
            )}
            {contact?.address && <InfoCard icon={MapPin} title="Workshop" value={contact.address} />}
            {googleMapEmbedUrl && (
              <div className="overflow-hidden rounded-2xl glass border-glow">
                <iframe title="Map" className="h-56 w-full" src={googleMapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
              </div>
            )}
            {streetViewEmbedUrl && (
              <div className="overflow-hidden rounded-2xl glass border-glow">
                <iframe title="Street view" className="h-56 w-full" src={streetViewEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({
  label, name, type = "text", placeholder, required,
}) {
  return (
    <div className="min-w-0">
      <label className="mb-2 block text-sm font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        required={required}
        className="w-full min-w-0 rounded-xl glass border border-border bg-transparent px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
      />
    </div>
  );
}

function StarRatingField({
  rating, hoverRating, onChange, onHover,
}) {
  const activeRating = hoverRating || rating;

  return (
    <div className="min-w-0">
      <label className="mb-2 block text-sm font-medium text-muted-foreground">Review Rating</label>
      <input type="hidden" name="reviewRating" value={rating} />
      <input type="hidden" name="reviewRatingText" value={rating ? `${rating} out of 5 stars` : ""} />
      <div
        className="flex min-h-[46px] w-full min-w-0 items-center gap-0.5 rounded-xl glass border border-border bg-transparent px-2 py-2 min-[380px]:gap-1 min-[380px]:px-3 sm:gap-2 sm:px-4 sm:py-3"
        onMouseLeave={() => onHover(0)}
      >
        {Array.from({ length: 5 }).map((_, index) => {
          const value = index + 1;
          const filled = value <= activeRating;

          return (
            <button
              key={value}
              type="button"
              aria-label={`${value} star review`}
              aria-pressed={value === rating}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-amber-400 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary min-[380px]:h-8 min-[380px]:w-8 sm:h-10 sm:w-10"
              onClick={() => onChange(value)}
              onMouseEnter={() => onHover(value)}
            >
              <Star className="h-5 w-5 sm:h-6 sm:w-6" fill={filled ? "currentColor" : "none"} />
            </button>
          );
        })}
        <span className="ml-1 min-w-0 shrink text-right text-[11px] leading-tight text-muted-foreground sm:ml-2 sm:text-sm">{rating ? `${rating}/5` : "Select Ratings"}</span>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon, title, value, href,
}) {
  const Tag = href ? "a" : "div";
  return (
    <Tag
      href={href}
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noreferrer" : undefined}
      className="group flex w-full max-w-full items-start gap-4 overflow-hidden rounded-2xl glass border-glow p-4 transition-transform hover:-translate-y-0.5"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
        <Icon className="h-5 w-5 text-primary-foreground" />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
        <div className="break-words font-medium">{value}</div>
      </div>
    </Tag>
  );
}
