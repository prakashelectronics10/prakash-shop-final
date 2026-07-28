import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Cpu, ShoppingBag, Wrench } from "lucide-react";
import { CANONICAL_WIRING_PARTS_PATH } from "../../utils/routes";
import { prefersReducedMotion } from "../../hooks/usePageScroll";

const cards = [
  {
    title: "Pulse AI",
    href: "/pulse-ai",
    description: "Ask about products, repairs, wiring accessories, and service recommendations with guided assistance.",
    icon: Bot,
  },
  {
    title: "Wiring Accessories",
    href: CANONICAL_WIRING_PARTS_PATH,
    description: "Find switches, sockets, wires, MCBs, and electrical fittings by category and brand.",
    icon: Cpu,
  },
  {
    title: "Shop Products",
    href: "/products",
    description: "Browse all public shop products with category, price, availability, and fast filters.",
    icon: ShoppingBag,
  },
  {
    title: "Booking",
    href: "/booking",
    description: "Book repairs or product requests with your details, image uploads, and product prefill.",
    icon: Wrench,
  },
];

export function QuickRouteCards() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      setActive((current) => (current + 1) % cards.length);
    };
    const timer = window.setInterval(tick, 4200);
    return () => window.clearInterval(timer);
  }, []);

  const ActiveIcon = cards[active].icon;

  return (
    <section className="quick-routes-section">
      <div className="quick-routes-inner">
        <div className="quick-routes-head">
          <span>Explore faster</span>
          <h2>Quick access for wiring accessories, products, AI and booking</h2>
        </div>

        <div className="quick-routes-layout">
          <div className="quick-routes-feature">
            <AnimatePresence mode="wait">
              <motion.a
                key={cards[active].title}
                href={cards[active].href}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
              >
                <span><ActiveIcon size={26} /></span>
                <h3>{cards[active].title}</h3>
                <p>{cards[active].description}</p>
                <strong>Open</strong>
              </motion.a>
            </AnimatePresence>
          </div>

          <div className="quick-routes-grid">
            {cards.map((card, index) => {
              const Icon = card.icon;
              return (
                <a
                  href={card.href}
                  className={`quick-route-card ${index === active ? "active" : ""}`}
                  key={card.title}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                >
                  <span><Icon size={20} /></span>
                  <div>
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
