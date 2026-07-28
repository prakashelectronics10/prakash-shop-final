import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  Clock,
  IndianRupee,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getWhatsappHref } from "../../utils/contactDefaults";
import { SectionFallback } from "./SectionFallback";
import { OptimizedImage } from "./OptimizedImage";

function slugToTitle(slug) {
  if (!slug) return "Service Details";
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function LearnMore() {
  const params = new URLSearchParams(window.location.search);
  const service = params.get("service");
  const { products, contact, loading } = useSiteData();
  const product = products.find((item) => item.slug === service);
  const detail = product?.detail || {};
  const title = product?.title || slugToTitle(service);
  const whatsappHref = getWhatsappHref(contact) || "#contact";

  if (!product && loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SectionFallback />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-30" />
      <div className="pointer-events-none fixed -right-32 top-10 hidden h-96 w-96 rounded-full bg-gradient-primary opacity-20 blur-3xl md:block" />
      <div className="relative mx-auto max-w-7xl px-4 py-8 md:py-12">
        <a href="/#services" className="inline-flex items-center gap-2 rounded-full glass px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to services
        </a>

        <section className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              {detail.eyebrow || product?.badge || "Professional electronics service"}
            </span>
            <h1 className="mt-5 font-display text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
              {title} <span className="text-gradient">by Prakash Electronics</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              {detail.overview || product?.description || "Contact us and we will guide you with diagnosis, pricing, and repair options."}
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <TrustCard icon={Clock} title="Quick Check" text="Fast diagnosis" />
              <TrustCard icon={IndianRupee} title="Fair Price" text="Clear estimate" />
              <TrustCard icon={ShieldCheck} title="Tested Work" text="Quality verified" />
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/booking" className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-105">
                <CalendarCheck className="h-4 w-4" />
                Book this service
              </a>
              <a href={whatsappHref} className="inline-flex items-center gap-2 rounded-xl glass border-glow px-6 py-3.5 text-sm font-semibold text-foreground transition hover:bg-secondary">
                <MessageCircle className="h-4 w-4 text-accent" />
                WhatsApp now
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-5 hidden rounded-[2rem] bg-gradient-primary opacity-30 blur-2xl md:block" />
            <div className="relative overflow-hidden rounded-3xl glass-strong border-glow shadow-elegant">
              <OptimizedImage
                src={product?.imageUrl}
                alt={title}
                width={640}
                height={760}
                sizes="(min-width: 1024px) 48vw, 100vw"
                fetchPriority="high"
                className="h-[360px] w-full object-cover sm:h-[460px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 rounded-2xl glass-strong p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                    <Wrench className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Service promise</div>
                    <div className="font-display text-lg font-semibold">Diagnose first, repair right</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14 grid gap-6 lg:grid-cols-3">
          <Panel title="Best For">
            {(detail.idealFor || []).map((item) => (
              <ListItem key={item}>{item}</ListItem>
            ))}
          </Panel>
          <Panel title="Repair Process">
            {(detail.steps || []).map((item, index) => (
              <ListItem key={item} index={index + 1}>{item}</ListItem>
            ))}
          </Panel>
          <Panel title="What You Get">
            {(detail.features || []).map((item) => (
              <ListItem key={item}>{item}</ListItem>
            ))}
          </Panel>
        </section>
      </div>
    </div>
  );
}

function TrustCard({ icon: Icon, title, text }) {
  return (
    <div className="rounded-2xl glass border-glow p-4">
      <Icon className="h-5 w-5 text-accent" />
      <div className="mt-3 font-display text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{text}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-3xl glass-strong border-glow p-6 shadow-card">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-5 space-y-3">{children}</div>
    </div>
  );
}

function ListItem({ children, index }) {
  return (
    <div className="flex gap-3 rounded-2xl glass p-3 text-sm text-muted-foreground">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground">
        {index ?? <CheckCircle2 className="h-4 w-4" />}
      </div>
      <span>{children}</span>
    </div>
  );
}
