import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  MessageCircle,
  Phone,
} from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getPhoneHref, getWhatsappHref } from "../../utils/contactDefaults";
import { Contact } from "./Contact";
import { FaqSection } from "./FaqSection";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";
import { SocialChannels } from "./SocialChannels";

const CONTACT_FAQS = [
  {
    question: "What details should I send for a repair enquiry?",
    answer: "Share the product type, brand or model when available, the issue you are seeing, and your preferred contact number. A clear photo can also help with the first assessment.",
  },
  {
    question: "How quickly will the workshop respond?",
    answer: "The team responds as soon as possible during working hours. Repair timing is confirmed after the product and fault have been reviewed.",
  },
  {
    question: "Can I ask about product availability on WhatsApp?",
    answer: "Yes. Use the published WhatsApp link for current product, accessory, and repair availability. Include the product name or a reference image for a more useful response.",
  },
  {
    question: "Where is Prakash Electronics located?",
    answer: "The workshop is in Chitarpur, Jharkhand. The current address and available map link are shown in the contact details on this page and in the website footer.",
  },
];

export function ContactPage() {
  const { contact } = useSiteData();
  const phoneHref = getPhoneHref(contact);
  const whatsappHref = getWhatsappHref(contact);

  return (
    <div className="App contact-page">
      <Navbar />
      <main>
        <section className="contact-page-hero">
          <div className="contact-page-hero-inner">
            <a className="internal-page-back" href="/#home">
              <ArrowLeft size={17} aria-hidden="true" />
              Back to home
            </a>
            <p className="internal-page-kicker">Contact us</p>
            <h1>Contact Prakash <span>Electronics</span></h1>
            <p>Reach the workshop directly for product enquiries, repair guidance, bookings, and availability.</p>
            <ul className="internal-page-hero-points" aria-label="Available contact support">
              <li>Product enquiries</li>
              <li>Repair bookings</li>
              <li>Workshop directions</li>
            </ul>
            <div className="contact-page-hero-actions">
              {phoneHref ? <a className="internal-page-primary" href={phoneHref}><Phone size={17} />Call now</a> : null}
              {whatsappHref ? <a className="internal-page-secondary" href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={17} />WhatsApp</a> : null}
            </div>
          </div>
        </section>

        <section className="contact-page-form-section">
          <div className="internal-page-section-head">
            <p className="internal-page-kicker">Send a request</p>
            <h2>Tell us how we can help</h2>
            <p>Share the product or repair details. The team will respond through the contact information you provide.</p>
          </div>
          <Contact sectionId="" showHeading={false} requireRating={false} />
        </section>

        <SocialChannels />

        <FaqSection
          title="Before you contact the workshop"
          description="Quick answers for repair enquiries, product availability, and visits."
          items={CONTACT_FAQS}
        />

        <section className="contact-page-note">
          <div><MapPin aria-hidden="true" /></div>
          <span><strong>Local service, direct support</strong><small>{contact?.shortAddress || "Chitarpur, Jharkhand"}</small></span>
          <a href="/booking">Book a repair <ArrowRight size={17} aria-hidden="true" /></a>
        </section>
      </main>
      <Footer />
    </div>
  );
}
