import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Cpu, ShoppingBag, Wrench } from "lucide-react";

const cards = [
  {
    title: "Science AI",
    href: "/science-ai",
    description: "Ask project questions, upload component photos, and get context-aware electronics guidance.",
    icon: Bot,
  },
  {
    title: "Projects Parts",
    href: "/projects-parts",
    description: "Find science project components like sensors, Arduino boards, motors, wires, and modules.",
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
    const timer = window.setInterval(() => setActive((current) => (current + 1) % cards.length), 4200);
    return () => window.clearInterval(timer);
  }, []);

  const ActiveIcon = cards[active].icon;

  return (
    <section className="quick-routes-section">
      <div className="quick-routes-inner">
        <div className="quick-routes-head">
          <span>Explore faster</span>
          <h2>Quick access for projects, products, AI and booking</h2>
        </div>

        <div className="quick-routes-layout">
          <div className="quick-routes-feature">
            <AnimatePresence mode="wait">
              <motion.a
                key={cards[active].title}
                href={cards[active].href}
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -22 }}
                transition={{ duration: 0.42 }}
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
