const seedAsset = (name) => `/seed-assets/${name}`;

const categories = [
  {
    name: "Repair Services",
    slug: "repair-services",
    description: "Doorstep and workshop repair services for home electronics.",
    displayOrder: 1,
  },
  {
    name: "Accessories",
    slug: "accessories",
    description: "Tested electronic accessories, parts, fans, torches, speakers and wiring items.",
    displayOrder: 2,
  },
];

const products = [
  {
    title: "Quick Repair Booking",
    slug: "quick-repair-booking",
    categorySlug: "repair-services",
    categoryName: "Repair Services",
    iconName: "Smartphone",
    shortDescription: "Call or message us for fast inspection, clear pricing, and doorstep support.",
    description:
      "Fast inspection and practical guidance for electronics and appliance repair requests.",
    imageUrl: seedAsset("gallery-10.jpg"),
    badge: "Fast response",
    highlights: ["Same-day visit", "Free estimate"],
    displayOrder: 1,
    isFeatured: true,
    detail: {
      eyebrow: "Fast help for any product",
      overview:
        "Not sure what is wrong with your device? Share the issue on call or WhatsApp and we will guide you with the next step, expected visit time, and a clear estimate before work begins.",
      idealFor: [
        "Urgent repair requests",
        "Old appliances that need diagnosis",
        "Doorstep inspection",
        "Customers who want quick pricing",
      ],
      steps: [
        "Share product details and symptoms",
        "Get a practical repair estimate",
        "Confirm visit or workshop drop",
        "Repair, test, and handover",
      ],
      features: ["Same-day support where available", "Simple repair guidance", "Transparent pricing before repair"],
    },
  },
  {
    title: "LCD / LED TV Repair",
    slug: "lcd-led-tv-repair",
    categorySlug: "repair-services",
    categoryName: "Repair Services",
    iconName: "Tv",
    shortDescription: "Backlight, display, sound, smart TV software, and motherboard repair.",
    description: "Component-level TV repair for display, audio, power supply and smart TV faults.",
    imageUrl: seedAsset("gallery-2.jpg"),
    badge: "Panel specialist",
    highlights: ["Board repair", "Picture testing"],
    displayOrder: 2,
    isFeatured: true,
    detail: {
      eyebrow: "Display, sound and board care",
      overview:
        "Professional TV repair for backlight failure, no picture, no sound, software problems, power supply faults, and motherboard-level issues. Each TV is tested across input, display, and audio before delivery.",
      idealFor: ["No display or dim picture", "TV stuck on logo", "Sound but no video", "HDMI or smart TV issues"],
      steps: ["Power and panel diagnosis", "Backlight or board-level repair", "Software and input testing", "Final quality check"],
      features: ["Component-level repair", "Compatible parts", "Full picture and sound testing"],
    },
  },
  {
    title: "Refrigerator Repair",
    slug: "refrigerator-repair",
    categorySlug: "repair-services",
    categoryName: "Repair Services",
    iconName: "Refrigerator",
    shortDescription: "Cooling issues, compressor faults, thermostat repair, and gas refill checks.",
    description: "Cooling and electrical repair support for refrigerators and freezers.",
    imageUrl: seedAsset("gallery-4.jpg"),
    badge: "Cooling care",
    highlights: ["Leak check", "Gas support"],
    displayOrder: 3,
    detail: {
      eyebrow: "Cooling restored carefully",
      overview:
        "Repair and service for refrigerators with poor cooling, compressor trouble, gas leakage, thermostat faults, wiring issues, and unusual noise. We focus on root-cause diagnosis before replacing parts.",
      idealFor: ["Low cooling", "Water leakage", "Compressor not starting", "Excess ice build-up"],
      steps: ["Cooling and electrical inspection", "Leak and compressor check", "Repair or gas support", "Temperature validation"],
      features: ["Leak checks", "Thermostat testing", "Safe sealed-system handling"],
    },
  },
  {
    title: "Speaker & Home Theater",
    slug: "speaker-home-theater",
    categorySlug: "repair-services",
    categoryName: "Repair Services",
    iconName: "WashingMachine",
    shortDescription: "Bluetooth speaker, amplifier, wiring, charging, and sound output repair.",
    description: "Audio system repair and performance testing for speakers and home theater systems.",
    imageUrl: seedAsset("gallery-6.jpg"),
    badge: "Audio repair",
    highlights: ["Sound tuning", "Charging repair"],
    displayOrder: 4,
    isFeatured: true,
    detail: {
      eyebrow: "Clear audio, clean repair",
      overview:
        "Bluetooth speakers, home theaters, amplifiers, charging ports, wiring, battery issues, and distorted sound are repaired with careful testing so your audio system performs reliably again.",
      idealFor: ["No sound output", "Charging problem", "Bluetooth not connecting", "Bass or speaker distortion"],
      steps: ["Audio and power diagnosis", "Port, battery, or board repair", "Speaker output tuning", "Playback testing"],
      features: ["Charging section repair", "Sound clarity testing", "Wiring and connector checks"],
    },
  },
  {
    title: "Ceiling Fan Repair",
    slug: "ceiling-fan-repair",
    categorySlug: "repair-services",
    categoryName: "Repair Services",
    iconName: "Fan",
    shortDescription: "Capacitor, regulator, winding, bearing noise, and balancing service.",
    description: "Fan repair and safety checks for quiet airflow and reliable use.",
    imageUrl: seedAsset("gallery-7.jpg"),
    badge: "Home service",
    highlights: ["Motor check", "Balancing"],
    displayOrder: 5,
    isFeatured: true,
    detail: {
      eyebrow: "Quiet, balanced airflow",
      overview:
        "Fan repair for slow speed, capacitor problems, winding faults, bearing noise, regulator failure, and balancing issues. We check safety, speed, and vibration after servicing.",
      idealFor: ["Slow fan speed", "Fan not starting", "Noise or vibration", "Regulator problems"],
      steps: ["Motor and capacitor check", "Winding or bearing service", "Regulator testing", "Balancing and speed check"],
      features: ["Capacitor replacement", "Motor servicing", "Noise reduction"],
    },
  },
  {
    title: "Cooler Repair",
    slug: "cooler-repair",
    categorySlug: "repair-services",
    categoryName: "Repair Services",
    iconName: "Wind",
    shortDescription: "Pump, motor, pad replacement, wiring, cleaning, and seasonal servicing.",
    description: "Seasonal cooler service for better airflow, pump function and safe wiring.",
    imageUrl: seedAsset("gallery-4.jpg"),
    badge: "Summer ready",
    highlights: ["Pump repair", "Deep cleaning"],
    displayOrder: 6,
    detail: {
      eyebrow: "Ready for summer use",
      overview:
        "Cooler servicing for pump failure, weak airflow, motor problems, pad replacement, wiring faults, and seasonal cleaning. We restore cooling performance with practical service work.",
      idealFor: ["Pump not working", "Weak cooling", "Motor noise", "Seasonal maintenance"],
      steps: ["Pump and motor inspection", "Wiring and switch check", "Pad and water flow service", "Cleaning and final run test"],
      features: ["Pump repair", "Deep cleaning", "Airflow testing"],
    },
  },
  {
    title: "Home Appliances",
    slug: "home-appliances",
    categorySlug: "repair-services",
    categoryName: "Repair Services",
    iconName: "Plug",
    shortDescription: "Mixer, induction, geyser, iron, extension board, and small appliance repair.",
    description: "Electrical and small appliance repair with practical safety testing.",
    imageUrl: seedAsset("gallery-10.jpg"),
    badge: "All brands",
    highlights: ["Electrical test", "Safe repair"],
    displayOrder: 7,
    detail: {
      eyebrow: "Small appliances, big care",
      overview:
        "Repair support for induction cooktops, mixers, irons, geysers, extension boards, switches, and other daily-use electrical products. We test safety before returning every item.",
      idealFor: ["Induction faults", "Mixer or iron repair", "Switch and wire issues", "General electrical products"],
      steps: ["Electrical safety check", "Fault tracing", "Part repair or replacement", "Load and function test"],
      features: ["Safe wiring checks", "Practical repair advice", "All-brand support"],
    },
  },
  {
    title: "Accessories Sales",
    slug: "accessories-sales",
    categorySlug: "accessories",
    categoryName: "Accessories",
    iconName: "ShoppingBag",
    shortDescription: "Reliable parts, wires, fans, torches, speakers, switches, and daily-use items.",
    description: "Tested stock and fair pricing for electronics accessories and spare parts.",
    imageUrl: seedAsset("gallery-5.jpg"),
    badge: "Genuine items",
    highlights: ["Tested stock", "Fair pricing"],
    displayOrder: 8,
    detail: {
      eyebrow: "Useful products, tested stock",
      overview:
        "Buy reliable electronics accessories and daily-use items such as fans, torches, speakers, wires, switches, plugs, and spare parts. We help you choose compatible products for your need.",
      idealFor: ["Replacement parts", "Home electrical items", "Speakers and torches", "Fan and wiring needs"],
      steps: ["Tell us your requirement", "Check compatibility", "Choose tested product", "Get usage guidance"],
      features: ["Fair pricing", "Compatibility help", "Tested items"],
    },
  },
];

const hero = {
  eyebrow: "Trusted by 25,000+ customers since 2009",
  title: "Premium Repair for",
  highlight: "Home appliances",
  titleSuffix: "You Own",
  description:
    "From fan to television, Prakash Electronics delivers expert diagnostics, genuine parts and same-day service. You can also buy electronics products like ceiling fan, rechargeable torch, speaker and daily-use electrical items.",
  primaryCta: { label: "Book Repair", href: "#contact" },
  secondaryCta: { label: "Call Now", href: "tel:+916200267880" },
  image: {
    url: seedAsset("hero-technician.jpg"),
    alt: "Expert electronics repair technician at work",
  },
  trustBadges: [
    { iconName: "ShieldCheck", label: "90-day warranty" },
    { iconName: "Star", label: "4.9/5 (3,200 reviews)" },
  ],
  floatingBadges: [
    { label: "Repairs today", value: "+128" },
    { label: "Satisfaction", value: "99%" },
  ],
};

const contact = {
  phone: "+916200267880",
  whatsappNumber: "919006608566",
  whatsappMessage: "Hello Prakash Electronics, I need assistance with a repair of home appliances or buy products.",
  email: "prakashelectronics10@gmail.com",
  address: "Chitarpur, main road - 825101",
  shortAddress: "Chitarpur - 825101",
  formspreeEndpoint: "https://formspree.io/f/xeeooogp",
  googleMapEmbedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3656.822662313956!2d85.6545184751611!3d23.57481179549499!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39f459003b628feb%3A0xdb9b740fb241dbe9!2sPrakash%20Electronic!5e0!3m2!1sen!2sin!4v1778156751573!5m2!1sen!2sin",
  streetViewEmbedUrl:
    "https://www.google.com/maps/embed?pb=!4v1778160849666!6m8!1m7!1s3R9302s3Bpql2pFK2rz3uA!2m2!1d23.57469051024735!2d85.65711996104037!3f347.32675!4f0!5f0.7820865974627469",
  socialLinks: [
    { platform: "Facebook", url: "#home" },
    { platform: "Instagram", url: "#home" },
    { platform: "Twitter", url: "#home" },
    { platform: "Youtube", url: "#home" },
  ],
};

const siteContent = {
  navbar: {
    brandName: "Prakash Electronics",
    ctaLabel: "Book Repair",
    links: [
      { href: "#home", label: "Home" },
      { href: "#about", label: "About" },
      { href: "#services", label: "Services" },
      { href: "#gallery", label: "Gallery" },
      { href: "#testimonials", label: "Reviews" },
      { href: "/products", label: "Products" },
      { href: "/projects-parts", label: "Project Parts" },
      { href: "/science-ai", label: "Science AI" },
      { href: "#contact", label: "Contact" },
    ],
  },
  servicesSection: {
    eyebrow: "Our Services",
    title: "Everything you plug in,",
    highlight: "we fix it",
    description: "Practical repair, honest diagnosis, and tested parts for home electronics and appliances.",
  },
  stats: {
    items: [
      { value: 32500, label: "Repairs Completed", suffix: "+" },
      { value: 25000, label: "Happy Customers", suffix: "+" },
      { value: 20, label: "Years Experience", suffix: "+" },
      { value: 24, label: "Expert Technicians", suffix: "" },
    ],
  },
  testimonials: {
    eyebrow: "Testimonials",
    title: "Loved by",
    highlight: "25,000+ customers",
    items: [
      {
        name: "Aryan kumar",
        role: "Gola, Ramgarh",
        rating: 5,
        text: "Television stopped working on a Sunday. They came home, fixed it the same day, and the bill was less than expected.",
        avatar: "AK",
      },
      {
        name: "Vivek Kumar",
        role: "Chitarpur",
        rating: 5,
        text: "Best fan service I have had in years. Professional, punctual, and the cooling improved drastically afterward.",
        avatar: "VK",
      },
      {
        name: "Nilesh Kumar",
        role: "Chitarpur",
        rating: 5,
        text: "Loved the transparent pricing. They diagnosed my washing machine for free and fixed it the very next day.",
        avatar: "NK",
      },
      {
        name: "Kunal Kumar",
        role: "Gola, Ramgarh",
        rating: 5,
        text: "Best ceiling fan service I have had in years. Professional, punctual, and good.",
        avatar: "KK",
      },
      {
        name: "Prince Kumar",
        role: "Gola, Ramgarh",
        rating: 5,
        text: "Best service I have had in years. Professional, punctual and good.",
        avatar: "PK",
      },
    ],
  },
  gallery: {
    eyebrow: "Gallery",
    title: "Inside our",
    highlight: "workshop",
    items: [
      {
        imageUrl: seedAsset("gallery-1.jpg"),
        label: "Workshop",
        caption: "Our repair workshop with practical tools and safe repair stations.",
        span: "md:col-span-2 md:row-span-2",
      },
      {
        imageUrl: seedAsset("gallery-2.jpg"),
        label: "TV kit Repair",
        caption: "Component-level board repair and screen service by experienced technicians.",
        span: "",
      },
      {
        imageUrl: seedAsset("gallery-3.jpg"),
        label: "TV Service",
        caption: "Comprehensive TV servicing including diagnostics, cleaning, and performance checks.",
        span: "",
      },
      {
        imageUrl: seedAsset("gallery-4.jpg"),
        label: "Fan Servicing",
        caption: "Deep cleaning and full inspection for better performance.",
        span: "md:col-span-2",
      },
      {
        imageUrl: seedAsset("gallery-5.jpg"),
        label: "Sales",
        caption: "Genuine spare parts and useful accessories for home electronics.",
        span: "md:col-span-1",
      },
      {
        imageUrl: seedAsset("gallery-6.jpg"),
        label: "Bluetooth speaker Servicing",
        caption: "Speaker and home theater service including diagnostics, cleaning, and output testing.",
        span: "md:col-span-3",
      },
      {
        imageUrl: seedAsset("gallery-7.jpg"),
        label: "Ceiling fan Servicing",
        caption: "Motor repair, blade balancing, and regulator replacement for reliable airflow.",
        span: "md:row-span-2",
      },
      {
        imageUrl: seedAsset("gallery-8.jpg"),
        label: "Keyboard Repair",
        caption: "Key replacement, switch repair, and cleaning for keyboard issues.",
        span: "md:row-span-2",
      },
      {
        imageUrl: seedAsset("gallery-9.jpg"),
        label: "Prakash Mahto",
        caption: "Founder Prakash Mahto with years of electronics repair experience.",
        span: "md:row-span-2",
      },
      {
        imageUrl: seedAsset("gallery-10.jpg"),
        label: "Prakash electronics board",
        caption: "Prakash Electronics and Electricals is a trusted name in electronics repair and sales.",
        span: "md:row-span-2",
      },
    ],
  },
  about: {
    eyebrow: "About Prakash Electronics",
    title: "Repairing orders,",
    highlight: "Services with trust",
    description:
      "For over 20 years, Prakash Electronics has been the city's go-to electronics workshop, blending precise diagnostics with genuine craftsmanship for every product that comes to us.",
    reasons: [
      { iconName: "Clock", title: "Lightning Fast", desc: "Most repairs are completed quickly, often same-day." },
      { iconName: "Wallet", title: "Transparent Pricing", desc: "No hidden fees. Clear estimate before repair." },
      { iconName: "Home", title: "Doorstep Service", desc: "We support home visits where available." },
      { iconName: "Award", title: "Technicians", desc: "Technicians with 20+ years of experience." },
      { iconName: "Cog", title: "Genuine Parts", desc: "Quality components with practical assurance." },
      { iconName: "ShieldCheck", title: "Secured service", desc: "Safe repair practices and tested work." },
    ],
  },
  contactSection: {
    eyebrow: "Get In Touch",
    title: "Book a repair in",
    highlight: "60 seconds",
    description: "Tell us what is broken and we will handle the rest.",
    submitLabel: "Book My Repair",
  },
  footer: {
    brandName: "Prakash Electronics",
    description: "Premium repair and sales for every device - trusted by 25,000+ customers since 2000.",
    quickLinks: ["Home", "About", "Services", "Gallery", "Contact"],
    serviceLinks: ["Fan Repair", "TV Repair", "D2H antenna Service", "Bluetooth speaker repair", "Induction repairing"],
    socialLinks: [],
    copyrightPrefix: "Prakash Electronics and Electricals. All rights reserved.",
    creditText: "Crafted with Love in India.",
  },
  featuredCarousel: {
    eyebrow: "Featured Repairs",
    title: "Our most loved",
    highlight: "services",
  },
};

const offers = [
  {
    title: "Same-day repair support",
    description: "Call early for faster inspection and same-day repair availability.",
    code: "FASTHELP",
    ctaLabel: "Book now",
    ctaHref: "#contact",
    displayOrder: 1,
  },
];

module.exports = { categories, products, hero, contact, siteContent, offers };
