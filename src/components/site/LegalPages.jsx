import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";

const LAST_UPDATED = "10 September 2026";

function LegalPage({ eyebrow, title, intro, children }) {
  const { contact } = useSiteData();
  const email = String(contact?.email || "support@prakashshop.in").trim();

  return (
    <div className="App legal-page">
      <Navbar />
      <main className="legal-page-shell">
        <header className="legal-page-header">
          <a className="internal-page-back" href="/#home">
            <ArrowLeft size={17} aria-hidden="true" />
            Back to home
          </a>
          <p className="internal-page-kicker">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{intro}</p>
          <span className="legal-page-updated">Last updated: {LAST_UPDATED}</span>
        </header>

        <article className="legal-page-card">{children}</article>

        <aside className="legal-page-contact" aria-label="Legal support contact">
          <span><ShieldCheck aria-hidden="true" /></span>
          <div>
            <strong>Questions about these terms?</strong>
            <p>Contact Prakash Electronics and we will help you understand how your information or order is handled.</p>
          </div>
          <a href={`mailto:${email}`}><Mail size={17} aria-hidden="true" />{email}</a>
        </aside>
      </main>
      <Footer />
    </div>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalPage
      eyebrow="Your privacy"
      title="Privacy Policy"
      intro="A clear overview of the information we collect, why we use it, and the choices available to you."
    >
      <section>
        <h2>Information we collect</h2>
        <p>When you place an order, book a repair, contact the workshop, or use Pulse AI, you may provide your name, phone number, delivery address, pincode, landmark, message, and product or repair details. We may also receive basic technical information such as browser, device, session, and website usage data needed to operate and improve the service.</p>
      </section>
      <section>
        <h2>How we use information</h2>
        <ul>
          <li>To process orders, confirm payments, arrange delivery, and show order status.</li>
          <li>To respond to enquiries, repair bookings, product requests, and support messages.</li>
          <li>To provide relevant Pulse AI answers and product suggestions.</li>
          <li>To protect the website, prevent misuse, and improve performance and usability.</li>
        </ul>
      </section>
      <section>
        <h2>Payments</h2>
        <p>Online payments are processed through Razorpay. Prakash Electronics does not store your full card, UPI PIN, or net-banking credentials. Razorpay may process payment and device information under its own privacy terms.</p>
      </section>
      <section>
        <h2>Sharing and service providers</h2>
        <p>We share information only when reasonably needed to operate the website, process payments, communicate with you, deliver an order, comply with law, or protect customers and the business. We do not sell your personal information.</p>
      </section>
      <section>
        <h2>Storage, security, and retention</h2>
        <p>Reasonable technical and administrative safeguards are used to protect information. Records are retained only for as long as they are useful for orders, support, accounting, legal obligations, security, or dispute resolution, and are then deleted or anonymised where appropriate.</p>
      </section>
      <section>
        <h2>Cookies and local storage</h2>
        <p>The website may use cookies or browser storage to keep your cart, session, preferences, and essential security state working. Blocking these features may prevent parts of the website from functioning correctly.</p>
      </section>
      <section>
        <h2>Your choices</h2>
        <p>You can contact us to ask about, correct, or request deletion of personal information we hold, subject to records we must retain for legal, payment, security, or accounting reasons.</p>
      </section>
      <section>
        <h2>Policy updates</h2>
        <p>We may update this policy when our services or legal requirements change. The latest version and its update date will remain available on this page.</p>
      </section>
    </LegalPage>
  );
}

export function TermsConditionsPage() {
  return (
    <LegalPage
      eyebrow="Website terms"
      title="Terms & Conditions"
      intro="These terms explain the basic rules for using the Prakash Electronics website, ordering products, and booking services."
    >
      <section>
        <h2>Using this website</h2>
        <p>By using this website, placing an order, or submitting a booking, you agree to provide accurate information and to use the service lawfully. Do not attempt to disrupt, misuse, reverse engineer, or gain unauthorised access to the website or its systems.</p>
      </section>
      <section>
        <h2>Products, pricing, and availability</h2>
        <p>We aim to keep names, images, specifications, prices, discounts, and stock information accurate. Availability may change before an order is confirmed. Product images are illustrative and minor appearance differences may occur. If a material listing or pricing error affects an order, we will contact you before fulfilment.</p>
      </section>
      <section>
        <h2>Orders and payment</h2>
        <p>An order is confirmed after successful payment and creation of an Order ID. Payments are handled securely by Razorpay and may be subject to the payment provider&apos;s checks and terms. Keep your Order ID safe because it is used to view order progress.</p>
      </section>
      <section>
        <h2>Delivery and additional charges</h2>
        <p>Delivery timing depends on stock, address, distance, and operating conditions. Applicable delivery or additional charges are shown in the order summary before payment. A charge displayed as Free adds no amount to the total.</p>
      </section>
      <section>
        <h2>Repair bookings</h2>
        <p>A booking request is not a final repair estimate. Cost, parts, timing, home-visit availability, and repair feasibility are confirmed after the product and fault have been assessed.</p>
      </section>
      <section>
        <h2>Cancellations, returns, and refunds</h2>
        <p>Review the product, compatibility, quantity, price, charges, and delivery details before payment. Once successful payment creates an Order ID, the order is final and customer-requested cancellation, return, exchange, or refund is unavailable, except where a remedy cannot be excluded under applicable law.</p>
      </section>
      <section>
        <h2>Third-party services</h2>
        <p>The website may link to or use third-party services such as Razorpay, maps, social platforms, and communication providers. Their availability, content, and data practices are governed by their own terms.</p>
      </section>
      <section>
        <h2>Liability and governing law</h2>
        <p>To the extent permitted by law, Prakash Electronics is not responsible for indirect losses caused by events outside reasonable control or by misuse of the website. These terms are governed by the laws of India, with disputes subject to the appropriate courts in Jharkhand.</p>
        <p className="legal-page-secondary-copy">We may revise these terms as the website and services evolve. Continued use after an update means the current published terms apply.</p>
      </section>
    </LegalPage>
  );
}

export function ShippingPolicyPage() {
  return (
    <LegalPage
      eyebrow="Order delivery"
      title="Shipping Policy"
      intro="How Prakash Electronics prepares, dispatches, and delivers paid product orders."
    >
      <section>
        <h2>Service area and delivery estimate</h2>
        <p>Delivery availability depends on the delivery address, product stock, distance, and operating conditions. Any product-specific estimate is shown on the product page when available; the shop may contact you if an address cannot be served or an estimate changes.</p>
      </section>
      <section>
        <h2>Shipping and additional charges</h2>
        <p>Delivery and other applicable charges are displayed in the checkout summary before payment. A charge shown as Free adds no amount to the order total.</p>
      </section>
      <section>
        <h2>Order processing and tracking</h2>
        <p>After successful payment, your Order ID can be used on the Orders page to view the latest status. Orders move from confirmed to shipped, out for delivery, and delivered as fulfilment progresses.</p>
      </section>
      <section>
        <h2>Address and delivery attempts</h2>
        <p>Please provide a complete address, reachable phone number, correct pincode, and useful landmark. A delivery may be delayed or fail when the address is incomplete, the customer cannot be reached, or access is unavailable.</p>
      </section>
      <section>
        <h2>Failed delivery</h2>
        <p>If a paid order cannot be delivered and the shop approves a refund, the refund is initiated to the original payment method. A normal Razorpay refund typically takes 5–7 working days, subject to the payment provider or bank.</p>
      </section>
    </LegalPage>
  );
}

export function ReturnRefundPolicyPage() {
  return (
    <LegalPage
      eyebrow="Final order policy"
      title="Return & Refund Policy"
      intro="What to confirm before payment and how final paid product orders are handled."
    >
      <section>
        <h2>Confirm before you pay</h2>
        <p>Please verify the product name and model, specifications, compatibility, quantity, price, applicable charges, phone number, and complete delivery address before pressing Pay. Completing payment confirms that you have reviewed and accepted these order details.</p>
      </section>
      <section>
        <h2>Orders are final after payment</h2>
        <p>Once successful payment creates an Order ID, customer-requested cancellation is unavailable and the order cannot be returned, exchanged, or refunded. Please place an order only after you are certain about the product and delivery information.</p>
      </section>
      <section>
        <h2>Payment issues</h2>
        <p>If money is debited but no Order ID is created, or if you notice a duplicate payment, contact Prakash Electronics with the payment reference. We will verify the transaction with the payment provider; this is separate from returning or cancelling a successfully placed order.</p>
      </section>
      <section>
        <h2>Incorrect or damaged item concerns</h2>
        <p>Contact the shop promptly with your Order ID and clear supporting details. The shop will review the concern and explain any remedy that cannot be excluded under applicable consumer law; this does not create a general return or refund window.</p>
      </section>
      <section>
        <h2>How to get help</h2>
        <p>Contact Prakash Electronics with your Order ID or payment reference for order support. Never share a UPI PIN, OTP, card PIN, or banking password.</p>
      </section>
    </LegalPage>
  );
}
