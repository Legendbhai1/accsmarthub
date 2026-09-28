/**
 * AccSmart demo catalog — all sellers, products and reviews are clearly
 * fictional demo data. Swapping this module for real database queries is the
 * only change needed to go live.
 */

export type Category = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  hue: number; // artwork hue for generated artwork
  productCount: number; // marketplace-wide count (demo figure)
};

export type Seller = {
  id: string;
  name: string;
  joined: string;
  rating: number;
  sales: number;
  verified: boolean;
  location: string;
  responseTime: string;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: string; // category slug
  sellerId: string;
  price: number;
  oldPrice?: number;
  rating: number;
  reviews: number;
  sales: number; // popularity
  stock: number;
  createdAt: string; // ISO date
  delivery: string;
  included: string[];
  description: string;
  icon: string;
  hue: number;
};

export type Review = {
  productSlug: string;
  author: string;
  rating: number;
  date: string;
  text: string;
};

export const categories: Category[] = [
  {
    slug: "software-licenses",
    name: "Software & Licenses",
    description: "Productivity suites, antivirus and activation keys.",
    icon: "KeyRound",
    hue: 222,
    productCount: 482,
  },
  {
    slug: "gaming",
    name: "Gaming Products",
    description: "Game keys, top-up credits and in-game currency.",
    icon: "Gamepad2",
    hue: 285,
    productCount: 736,
  },
  {
    slug: "digital-downloads",
    name: "Digital Downloads",
    description: "eBooks, audio packs and instant file delivery.",
    icon: "Download",
    hue: 200,
    productCount: 611,
  },
  {
    slug: "design-assets",
    name: "Design Assets",
    description: "Fonts, mockups, illustrations and UI kits.",
    icon: "Palette",
    hue: 310,
    productCount: 389,
  },
  {
    slug: "templates",
    name: "Templates",
    description: "Website, presentation and document templates.",
    icon: "LayoutTemplate",
    hue: 245,
    productCount: 257,
  },
  {
    slug: "educational",
    name: "Educational Products",
    description: "Courses, exam guides and learning resources.",
    icon: "GraduationCap",
    hue: 168,
    productCount: 194,
  },
  {
    slug: "subscriptions",
    name: "Subscriptions",
    description: "Prepaid periods for streaming and SaaS tools.",
    icon: "RefreshCcw",
    hue: 258,
    productCount: 143,
  },
  {
    slug: "developer-tools",
    name: "Developer Tools",
    description: "API credits, starter kits and dev resources.",
    icon: "Terminal",
    hue: 190,
    productCount: 118,
  },
  {
    slug: "virtual-services",
    name: "Virtual Services",
    description: "Booked sessions delivered by vetted freelancers.",
    icon: "MonitorSmartphone",
    hue: 268,
    productCount: 92,
  },
  {
    slug: "gift-cards",
    name: "Gift Cards",
    description: "Regional and global retail gift card codes.",
    icon: "Gift",
    hue: 322,
    productCount: 208,
  },
];

export const sellers: Seller[] = [
  {
    id: "novabyte",
    name: "NovaByte Labs",
    joined: "March 2024",
    rating: 4.9,
    sales: 12480,
    verified: true,
    location: "Tallinn, EE",
    responseTime: "Under 1 hour",
  },
  {
    id: "pixelforge",
    name: "PixelForge Studio",
    joined: "January 2024",
    rating: 4.8,
    sales: 8214,
    verified: true,
    location: "Lisbon, PT",
    responseTime: "Under 2 hours",
  },
  {
    id: "loomcraft",
    name: "Loomcraft Goods",
    joined: "July 2024",
    rating: 4.7,
    sales: 5390,
    verified: true,
    location: "Toronto, CA",
    responseTime: "Under 3 hours",
  },
  {
    id: "quantasky",
    name: "QuantaSky Digital",
    joined: "February 2025",
    rating: 4.6,
    sales: 3127,
    verified: true,
    location: "Singapore, SG",
    responseTime: "Under 2 hours",
  },
  {
    id: "brightpath",
    name: "BrightPath Learning",
    joined: "October 2024",
    rating: 4.9,
    sales: 6642,
    verified: true,
    location: "Manchester, UK",
    responseTime: "Under 4 hours",
  },
  {
    id: "voltkart",
    name: "VoltKart Games",
    joined: "May 2025",
    rating: 4.5,
    sales: 2388,
    verified: true,
    location: "Seoul, KR",
    responseTime: "Under 2 hours",
  },
  {
    id: "atlasware",
    name: "AtlasWare",
    joined: "November 2024",
    rating: 4.6,
    sales: 4107,
    verified: true,
    location: "Austin, US",
    responseTime: "Under 5 hours",
  },
  {
    id: "mintfield",
    name: "Mintfield Market",
    joined: "April 2025",
    rating: 4.4,
    sales: 1476,
    verified: false,
    location: "Berlin, DE",
    responseTime: "Under 6 hours",
  },
];

export const products: Product[] = [
  {
    id: "p-001",
    slug: "nebula-office-suite-2026",
    name: "Nebula Office Suite 2026 — Lifetime Key",
    category: "software-licenses",
    sellerId: "novabyte",
    price: 39.99,
    oldPrice: 79.99,
    rating: 4.8,
    reviews: 412,
    sales: 5310,
    stock: 148,
    createdAt: "2026-08-14",
    delivery: "Instant license key",
    included: [
      "Lifetime activation key for 1 device",
      "Word processor, spreadsheets & slides apps",
      "Free minor version updates",
      "Email setup guide (PDF)",
    ],
    description:
      "A complete office suite with a modern editor, spreadsheet engine and presentation tool. The key activates instantly after checkout and includes lifetime minor-version updates.",
    icon: "FileSpreadsheet",
    hue: 222,
  },
  {
    id: "p-002",
    slug: "sentinel-shield-antivirus-1y",
    name: "SentinelShield Antivirus — 1 Device, 1 Year",
    category: "software-licenses",
    sellerId: "atlasware",
    price: 24.5,
    rating: 4.7,
    reviews: 268,
    sales: 3890,
    stock: 320,
    createdAt: "2026-07-02",
    delivery: "Instant license key",
    included: [
      "1-year subscription code",
      "Real-time malware & ransomware protection",
      "5 GB encrypted cloud backup",
      "Multi-OS support (Windows & macOS)",
    ],
    description:
      "Lightweight antivirus with real-time ransomware defense and a hardened firewall profile. Covers one device for twelve months from activation.",
    icon: "ShieldCheck",
    hue: 200,
  },
  {
    id: "p-003",
    slug: "starforge-vault-currency-5k",
    name: "StarForge Vault — 5,000 Credits",
    category: "gaming",
    sellerId: "voltkart",
    price: 18.99,
    oldPrice: 24.99,
    rating: 4.6,
    reviews: 189,
    sales: 4520,
    stock: 76,
    createdAt: "2026-08-30",
    delivery: "In-game code",
    included: [
      "5,000 StarForge Vault credits",
      "Region: global",
      "Redeemable on PC and console",
    ],
    description:
      "Top up your StarForge Vault balance and unlock cosmetic gear, battle passes and crafting materials. Code is delivered to your inbox seconds after purchase.",
    icon: "Rocket",
    hue: 285,
  },
  {
    id: "p-004",
    slug: "mechfront-ultimate-edition",
    name: "MechFront: Ultimate Edition — Game Key",
    category: "gaming",
    sellerId: "voltkart",
    price: 42,
    rating: 4.5,
    reviews: 96,
    sales: 1240,
    stock: 22,
    createdAt: "2026-09-06",
    delivery: "Instant game key",
    included: [
      "Base game + Season Pass 1–2",
      "Exclusive 'Ironclad' mech skin",
      "Digital artbook & soundtrack",
    ],
    description:
      "Pilot hulking mechs across a shattered Earth in this tactical shooter. The Ultimate Edition bundles every season pass with exclusive cosmetic gear.",
    icon: "Swords",
    hue: 268,
  },
  {
    id: "p-005",
    slug: "lofi-focus-audio-pack",
    name: "Lofi Focus — 120-Track Audio Pack",
    category: "digital-downloads",
    sellerId: "loomcraft",
    price: 14,
    rating: 4.8,
    reviews: 203,
    sales: 2980,
    stock: 999,
    createdAt: "2026-06-21",
    delivery: "Instant download",
    included: [
      "120 royalty-free lofi tracks (FLAC + MP3)",
      "Loop-ready stems for video editing",
      "Commercial license for content creators",
    ],
    description:
      "A curated library of chill, lofi study beats recorded by studio musicians. Every track ships royalty-free with a commercial license for creators.",
    icon: "Music",
    hue: 188,
  },
  {
    id: "p-006",
    slug: "the-lean-startup-playbook",
    name: "The Lean Startup Playbook — eBook",
    category: "digital-downloads",
    sellerId: "brightpath",
    price: 9.99,
    rating: 4.7,
    reviews: 154,
    sales: 2210,
    stock: 999,
    createdAt: "2026-05-11",
    delivery: "Instant download",
    included: [
      "220-page eBook (EPUB, MOBI, PDF)",
      "26 page worksheets & canvases",
      "Lifetime free edition updates",
    ],
    description:
      "A practical playbook for launching lean: validate ideas fast, price with confidence and grow without burning runway. Includes printable worksheets.",
    icon: "BookOpen",
    hue: 168,
  },
  {
    id: "p-007",
    slug: "aurelia-branding-kit",
    name: "Aurelia — Luxury Branding Kit",
    category: "design-assets",
    sellerId: "pixelforge",
    price: 29,
    oldPrice: 45,
    rating: 4.9,
    reviews: 176,
    sales: 1830,
    stock: 999,
    createdAt: "2026-08-08",
    delivery: "Instant download",
    included: [
      "40 logo templates (AI, SVG, PNG)",
      "180 social media layouts",
      "Color & typography style sheets",
      "Figma source file",
    ],
    description:
      "An elegant branding system for premium brands: logo suite, social layouts and a full type scale, organized in a clean Figma library.",
    icon: "Gem",
    hue: 310,
  },
  {
    id: "p-008",
    slug: "sculptor-3d-icons-vol2",
    name: "Sculptor 3D Icons — Volume 2",
    category: "design-assets",
    sellerId: "pixelforge",
    price: 19.5,
    rating: 4.8,
    reviews: 132,
    sales: 1475,
    stock: 999,
    createdAt: "2026-07-19",
    delivery: "Instant download",
    included: [
      "90 rendered 3D icons (4K PNG)",
      "Editable Blender source files",
      "Dark & light background variants",
    ],
    description:
      "Soft, clay-styled 3D icons for product marketing and app UI. Ships with 4K renders plus editable Blender scenes.",
    icon: "Shapes",
    hue: 334,
  },
  {
    id: "p-009",
    slug: "mosswood-portfolio-template",
    name: "Mosswood — Portfolio & Agency Template",
    category: "templates",
    sellerId: "loomcraft",
    price: 34,
    rating: 4.7,
    reviews: 88,
    sales: 940,
    stock: 999,
    createdAt: "2026-06-05",
    delivery: "Instant download",
    included: [
      "12 responsive page layouts",
      "Figma + HTML/CSS exports",
      "CMS-ready blog & case study blocks",
      "Lifetime template updates",
    ],
    description:
      "A calm, editorial template for designers and studios, with case-study layouts that put the work first. Ships as Figma and hand-coded HTML.",
    icon: "LayoutTemplate",
    hue: 245,
  },
  {
    id: "p-010",
    slug: "pitchdeck-studio-48",
    name: "PitchDeck Studio — 48 Investor Slides",
    category: "templates",
    sellerId: "quantasky",
    price: 21,
    rating: 4.5,
    reviews: 64,
    sales: 810,
    stock: 999,
    createdAt: "2026-05-28",
    delivery: "Instant download",
    included: [
      "48 slide layouts (Keynote, PPT, Google Slides)",
      "80 vector chart elements",
      "Icon pack with 300 glyphs",
    ],
    description:
      "Investor-ready deck layouts with data-driven charts, clean grids and an editorial type system. Duplicate a slide, drop in your numbers, present.",
    icon: "Presentation",
    hue: 258,
  },
  {
    id: "p-011",
    slug: "data-viz-mastery-course",
    name: "Data Viz Mastery — 8-Week Course",
    category: "educational",
    sellerId: "brightpath",
    price: 89,
    oldPrice: 129,
    rating: 4.9,
    reviews: 241,
    sales: 1740,
    stock: 500,
    createdAt: "2026-04-16",
    delivery: "Course portal access",
    included: [
      "42 lessons (9.5 hours, 4K video)",
      "12 guided projects with datasets",
      "Private community & weekly Q&A",
      "Completion certificate",
    ],
    description:
      "Turn raw data into clear, persuasive visuals. Eight weeks of lessons and critique-based projects, taught by a former newsroom graphics lead.",
    icon: "GraduationCap",
    hue: 168,
  },
  {
    id: "p-012",
    slug: "ielts-sprint-prep-bundle",
    name: "IELTS Sprint — Complete Prep Bundle",
    category: "educational",
    sellerId: "brightpath",
    price: 45,
    rating: 4.6,
    reviews: 118,
    sales: 1320,
    stock: 999,
    createdAt: "2026-03-30",
    delivery: "Instant download",
    included: [
      "6 full mock tests with answer keys",
      "Speaking & writing model answers",
      "Vocabulary flashcard deck (Anki)",
      "30-day study planner",
    ],
    description:
      "Everything needed for a 7+ band score: timed mock exams, model answers graded by former examiners, and a focused 30-day plan.",
    icon: "BookMarked",
    hue: 152,
  },
  {
    id: "p-013",
    slug: "cloudstream-music-6mo",
    name: "CloudStream Music — 6-Month Premium",
    category: "subscriptions",
    sellerId: "quantasky",
    price: 27,
    rating: 4.5,
    reviews: 310,
    sales: 5120,
    stock: 210,
    createdAt: "2026-08-22",
    delivery: "Email delivery",
    included: [
      "6 months of ad-free listening",
      "Offline downloads on 3 devices",
      "HiFi audio quality tier",
    ],
    description:
      "Six months of premium streaming with offline downloads and lossless audio. Redemption instructions arrive by email within minutes.",
    icon: "Headphones",
    hue: 258,
  },
  {
    id: "p-014",
    slug: "focus-ritual-app-1y",
    name: "FocusRitual App — 1-Year Plan",
    category: "subscriptions",
    sellerId: "atlasware",
    price: 32,
    rating: 4.6,
    reviews: 97,
    sales: 1490,
    stock: 999,
    createdAt: "2026-07-09",
    delivery: "Email delivery",
    included: [
      "12 months of premium access",
      "Focus sessions, planning & analytics",
      "Cross-platform sync (iOS, Android, desktop)",
    ],
    description:
      "A calm productivity app that blends planning, focus timers and weekly reviews. One year of premium across all your devices.",
    icon: "Timer",
    hue: 240,
  },
  {
    id: "p-015",
    slug: "deploykit-starter-bundle",
    name: "DeployKit — Production Starter Bundle",
    category: "developer-tools",
    sellerId: "novabyte",
    price: 59,
    rating: 4.8,
    reviews: 141,
    sales: 1120,
    stock: 999,
    createdAt: "2026-09-01",
    delivery: "Repository invite",
    included: [
      "Auth + billing starter codebase (TypeScript)",
      "CI/CD workflow templates",
      "Infrastructure-as-code configs",
      "60 days of update access",
    ],
    description:
      "A battle-tested starter stack: typed backend, auth flows, billing hooks and deploy pipelines wired together so you can ship on day one.",
    icon: "Terminal",
    hue: 190,
  },
  {
    id: "p-016",
    slug: "apiforge-100k-credits",
    name: "APIForge — 100,000 Request Credits",
    category: "developer-tools",
    sellerId: "novabyte",
    price: 15,
    rating: 4.7,
    reviews: 76,
    sales: 980,
    stock: 640,
    createdAt: "2026-06-27",
    delivery: "API key top-up",
    included: [
      "100k metered API requests",
      "All endpoints incl. webhooks",
      "Credits valid for 12 months",
    ],
    description:
      "Prepaid credits for the APIForge gateway: caching, auth, rate limiting and webhooks in one endpoint. Credits never expire within a year.",
    icon: "Braces",
    hue: 175,
  },
  {
    id: "p-017",
    slug: "brand-audit-session-60",
    name: "60-Min Brand Audit with a Design Lead",
    category: "virtual-services",
    sellerId: "pixelforge",
    price: 120,
    rating: 5,
    reviews: 52,
    sales: 310,
    stock: 8,
    createdAt: "2026-08-27",
    delivery: "Scheduled video session",
    included: [
      "60-minute 1:1 video call",
      "Pre-call questionnaire & teardown notes",
      "Written action list after the session",
      "Recording of the call",
    ],
    description:
      "Book a senior design lead for an hour: a live teardown of your brand touchpoints, prioritized fixes and a written follow-up plan.",
    icon: "Video",
    hue: 288,
  },
  {
    id: "p-018",
    slug: "workflow-automation-setup",
    name: "Workflow Automation Setup (2h Session)",
    category: "virtual-services",
    sellerId: "quantasky",
    price: 95,
    rating: 4.7,
    reviews: 34,
    sales: 210,
    stock: 12,
    createdAt: "2026-07-25",
    delivery: "Scheduled video session",
    included: [
      "2-hour working session",
      "One automation built live",
      "Documentation handover",
      "14 days of email follow-up",
    ],
    description:
      "Bring a repetitive process; leave with it automated. The session covers scoping, building and documenting one end-to-end workflow.",
    icon: "Workflow",
    hue: 262,
  },
  {
    id: "p-019",
    slug: "aurora-market-gift-card-25",
    name: "Aurora Market — $25 Gift Card",
    category: "gift-cards",
    sellerId: "mintfield",
    price: 24.25,
    rating: 4.3,
    reviews: 143,
    sales: 3640,
    stock: 430,
    createdAt: "2026-08-18",
    delivery: "Instant code delivery",
    included: [
      "$25 Aurora Market balance",
      "Region: US store",
      "Digital code sent to your email",
    ],
    description:
      "A $25 gift card for the fictional Aurora Market retail chain — redeemable against groceries, electronics and home goods in the US store.",
    icon: "Gift",
    hue: 322,
  },
  {
    id: "p-020",
    slug: "victory-lane-gift-card-50",
    name: "Victory Lane Games — $50 Gift Card",
    category: "gift-cards",
    sellerId: "mintfield",
    price: 48,
    rating: 4.4,
    reviews: 87,
    sales: 1580,
    stock: 260,
    createdAt: "2026-05-19",
    delivery: "Instant code delivery",
    included: [
      "$50 Victory Lane balance",
      "Region: global (online store)",
      "Digital code sent to your email",
    ],
    description:
      "Give the gift of play: a $50 balance for the Victory Lane Games online store, valid on games, DLC and collectibles worldwide.",
    icon: "Ticket",
    hue: 342,
  },
];

export const reviews: Review[] = [
  {
    productSlug: "nebula-office-suite-2026",
    author: "Priya S.",
    rating: 5,
    date: "2026-09-12",
    text: "Key arrived in under a minute and activated on the first try. Exactly what I needed for my new laptop.",
  },
  {
    productSlug: "nebula-office-suite-2026",
    author: "Marcus T.",
    rating: 5,
    date: "2026-09-08",
    text: "Half the price of the big-box store and the same apps. Setup guide was clear and short.",
  },
  {
    productSlug: "nebula-office-suite-2026",
    author: "Lena K.",
    rating: 4,
    date: "2026-08-30",
    text: "Great suite overall. Docking a star only because the slides app lacks a few transitions I use at work.",
  },
  {
    productSlug: "starforge-vault-currency-5k",
    author: "Diego R.",
    rating: 5,
    date: "2026-09-14",
    text: "Credited instantly, no region issues. Cheaper than buying in-game.",
  },
  {
    productSlug: "starforge-vault-currency-5k",
    author: "Amara O.",
    rating: 4,
    date: "2026-09-02",
    text: "Smooth purchase. Took one retry to redeem but support explained it in minutes.",
  },
  {
    productSlug: "aurelia-branding-kit",
    author: "Sofia M.",
    rating: 5,
    date: "2026-09-10",
    text: "The Figma library is beautifully organized. Landed a client rebrand the same week I bought it.",
  },
  {
    productSlug: "aurelia-branding-kit",
    author: "Jon P.",
    rating: 5,
    date: "2026-08-29",
    text: "Type scale and color sheets alone are worth the price. Everything feels premium.",
  },
  {
    productSlug: "data-viz-mastery-course",
    author: "Hannah W.",
    rating: 5,
    date: "2026-09-15",
    text: "The critique-based projects are gold. My charts at work look noticeably sharper after week three.",
  },
  {
    productSlug: "data-viz-mastery-course",
    author: "Tom B.",
    rating: 5,
    date: "2026-09-05",
    text: "Clear teaching, real datasets, zero fluff. The community feedback pushed me to finish.",
  },
  {
    productSlug: "data-viz-mastery-course",
    author: "Ravi N.",
    rating: 4,
    date: "2026-08-21",
    text: "Excellent content. Would love two more lessons on dashboards specifically.",
  },
  {
    productSlug: "lofi-focus-audio-pack",
    author: "Ella F.",
    rating: 5,
    date: "2026-09-11",
    text: "I score my YouTube videos exclusively from this pack now. The commercial license makes it effortless.",
  },
  {
    productSlug: "lofi-focus-audio-pack",
    author: "Noah D.",
    rating: 5,
    date: "2026-08-26",
    text: "120 tracks for the price of one sample pack. Stems loop cleanly in my editor.",
  },
  {
    productSlug: "brand-audit-session-60",
    author: "Ines V.",
    rating: 5,
    date: "2026-09-13",
    text: "Best money I've spent on my business this year. Concrete, prioritized feedback — no vague advice.",
  },
  {
    productSlug: "cloudstream-music-6mo",
    author: "Kai L.",
    rating: 4,
    date: "2026-09-09",
    text: "Code came in ten minutes and upgraded without a hitch. Would buy again.",
  },
  {
    productSlug: "apiforge-100k-credits",
    author: "Grace H.",
    rating: 5,
    date: "2026-09-07",
    text: "Credits applied instantly. The gateway's caching saved us real money on our side.",
  },
  {
    productSlug: "mechfront-ultimate-edition",
    author: "Owen C.",
    rating: 5,
    date: "2026-09-04",
    text: "Both season passes activated fine. Ironclad skin looks fantastic in-game.",
  },
  {
    productSlug: "the-lean-startup-playbook",
    author: "Yara Z.",
    rating: 5,
    date: "2026-08-31",
    text: "Readable in an evening, actionable for months. The worksheets are the hidden gem.",
  },
  {
    productSlug: "sentinel-shield-antivirus-1y",
    author: "Felix A.",
    rating: 5,
    date: "2026-09-06",
    text: "Light on resources and the ransomware shield passed my (careful) tests. Solid value.",
  },
];

/* ---------- helpers ---------- */

export function getSeller(id: string): Seller {
  return sellers.find((s) => s.id === id) ?? sellers[0];
}

export function getCategory(slug: string): Category {
  return (
    categories.find((c) => c.slug === slug) ?? {
      slug: "other",
      name: "Other",
      description: "",
      icon: "Package",
      hue: 250,
      productCount: 0,
    }
  );
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getReviewsFor(slug: string): Review[] {
  return reviews.filter((r) => r.productSlug === slug);
}

export function getRelated(product: Product, limit = 4): Product[] {
  const sameCategory = products.filter(
    (p) => p.category === product.category && p.slug !== product.slug,
  );
  const others = products.filter(
    (p) => p.category !== product.category && p.slug !== product.slug,
  );
  others.sort(
    (a, b) =>
      Math.abs(a.price - product.price) - Math.abs(b.price - product.price),
  );
  return [...sameCategory, ...others].slice(0, limit);
}
