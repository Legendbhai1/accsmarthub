/**
 * Digital Product Hub demo catalog — all listings, resellers and reviews are
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
    slug: "instagram",
    name: "Instagram",
    description: "Theme pages, niche hubs and creator accounts with real engagement.",
    icon: "Instagram",
    hue: 320,
    productCount: 512,
  },
  {
    slug: "tiktok",
    name: "TikTok",
    description: "Short-form video accounts with established audiences and growth trails.",
    icon: "Music2",
    hue: 350,
    productCount: 438,
  },
  {
    slug: "youtube",
    name: "YouTube",
    description: "Monetized channels, niche libraries and watch-time-ready channels.",
    icon: "Youtube",
    hue: 0,
    productCount: 286,
  },
  {
    slug: "x-twitter",
    name: "X (Twitter)",
    description: "Commentary, finance and news handles with aged followers.",
    icon: "Twitter",
    hue: 230,
    productCount: 241,
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    description: "Professional profiles and company pages with industry authority.",
    icon: "Linkedin",
    hue: 217,
    productCount: 124,
  },
  {
    slug: "facebook",
    name: "Facebook",
    description: "Groups, pages and ad accounts with standing activity history.",
    icon: "Facebook",
    hue: 214,
    productCount: 198,
  },
  {
    slug: "twitch",
    name: "Twitch",
    description: "Streaming channels with followers, panels and clean logs.",
    icon: "Twitch",
    hue: 270,
    productCount: 96,
  },
  {
    slug: "pinterest",
    name: "Pinterest",
    description: "Boards and traffic accounts in home, food and lifestyle niches.",
    icon: "Pin",
    hue: 14,
    productCount: 87,
  },
  {
    slug: "telegram",
    name: "Telegram",
    description: "Channels and communities with active, engaged subscriber bases.",
    icon: "MessagesSquare",
    hue: 205,
    productCount: 152,
  },
  {
    slug: "discord",
    name: "Discord",
    description: "Established servers with roles, channels and moderation history.",
    icon: "Gamepad2",
    hue: 235,
    productCount: 74,
  },
];

export const sellers: Seller[] = [
  {
    id: "meridian",
    name: "Meridian Digital Assets",
    joined: "March 2024",
    rating: 4.9,
    sales: 9180,
    verified: true,
    location: "London, UK",
    responseTime: "Under 1 hour",
  },
  {
    id: "harborlight",
    name: "Harborlight Accounts",
    joined: "January 2024",
    rating: 4.8,
    sales: 6420,
    verified: true,
    location: "Toronto, CA",
    responseTime: "Under 2 hours",
  },
  {
    id: "crescentrow",
    name: "Crescent Row Media",
    joined: "July 2024",
    rating: 4.7,
    sales: 4110,
    verified: true,
    location: "Lisbon, PT",
    responseTime: "Under 3 hours",
  },
  {
    id: "archerpeak",
    name: "ArcherPeak Holdings",
    joined: "February 2025",
    rating: 4.6,
    sales: 2760,
    verified: true,
    location: "Singapore, SG",
    responseTime: "Under 2 hours",
  },
  {
    id: "vantage",
    name: "Vantage Social",
    joined: "October 2024",
    rating: 4.9,
    sales: 5290,
    verified: true,
    location: "Manchester, UK",
    responseTime: "Under 4 hours",
  },
  {
    id: "northgate",
    name: "NorthGate Trading Co.",
    joined: "May 2025",
    rating: 4.5,
    sales: 1930,
    verified: true,
    location: "Austin, US",
    responseTime: "Under 2 hours",
  },
  {
    id: "solstice",
    name: "Solstice Brokers",
    joined: "November 2024",
    rating: 4.6,
    sales: 3480,
    verified: true,
    location: "Berlin, DE",
    responseTime: "Under 5 hours",
  },
  {
    id: "lumenpath",
    name: "Lumenpath Listings",
    joined: "April 2025",
    rating: 4.4,
    sales: 1140,
    verified: false,
    location: "Warsaw, PL",
    responseTime: "Under 6 hours",
  },
];

export const products: Product[] = [
  {
    id: "p-001",
    slug: "aurora-lifestyle-theme-page-890k",
    name: "Aurora Lifestyle — Instagram Theme Page, 890K",
    category: "instagram",
    sellerId: "meridian",
    price: 7400,
    oldPrice: 8900,
    rating: 4.8,
    reviews: 214,
    sales: 410,
    stock: 1,
    createdAt: "2026-08-14",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "90-day audience and revenue analytics export",
      "Post-handover onboarding call with the seller",
    ],
    description:
      "A curated lifestyle theme page with 892K followers and a three-year posting history. Engagement holds at 4.1% with consistent reach across Reels and carousels, and the page has never received a strike or restriction.",
    icon: "Instagram",
    hue: 320,
  },
  {
    id: "p-002",
    slug: "daily-plate-food-page-210k",
    name: "The Daily Plate — Instagram Food Page, 210K",
    category: "instagram",
    sellerId: "crescentrow",
    price: 2350,
    rating: 4.7,
    reviews: 162,
    sales: 358,
    stock: 1,
    createdAt: "2026-07-02",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "Brand-deal rate card and sponsorship history",
      "30-day post-transfer support from the seller",
    ],
    description:
      "A food and recipe page with a loyal, foodie-heavy audience and steady saves-to-reach ratio. Two recurring brand partnerships transfer with the account, both negotiated on monthly retainers.",
    icon: "Instagram",
    hue: 335,
  },
  {
    id: "p-003",
    slug: "fitfuel-shortform-tiktok-340k",
    name: "FitFuel Daily — TikTok Account, 340K",
    category: "tiktok",
    sellerId: "harborlight",
    price: 3900,
    oldPrice: 4600,
    rating: 4.6,
    reviews: 143,
    sales: 402,
    stock: 1,
    createdAt: "2026-08-30",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "Creator-fund payout history for the last 6 months",
      "Growth audit with 12-month engagement trend",
    ],
    description:
      "A fitness and meal-prep account built on repeatable short-form formats. Average views sit at 310K per post with a healthy follower-to-view ratio, and monetization is already approved and paying out.",
    icon: "Music2",
    hue: 350,
  },
  {
    id: "p-004",
    slug: "urban-x-finance-commentary-95k",
    name: "UrbanX Finance — X Commentary Handle, 95K",
    category: "x-twitter",
    sellerId: "archerpeak",
    price: 4200,
    rating: 4.5,
    reviews: 88,
    sales: 190,
    stock: 1,
    createdAt: "2026-09-06",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "Nine-year account age documentation",
      "Follower quality report with bot audit",
    ],
    description:
      "An aged finance commentary handle with a professional audience skewed toward analysts and founders. The account has never been suspended, and its reply activity is unusually high for the niche.",
    icon: "Twitter",
    hue: 230,
  },
  {
    id: "p-005",
    slug: "workshop-monetized-youtube-64k",
    name: "The Workshop — Monetized YouTube Channel, 64K",
    category: "youtube",
    sellerId: "vantage",
    price: 9800,
    oldPrice: 11500,
    rating: 4.9,
    reviews: 241,
    sales: 320,
    stock: 1,
    createdAt: "2026-06-21",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "AdSense payout statements for 12 months",
      "Copyright-strike-free channel history report",
    ],
    description:
      "A woodworking and tool-review channel with 64K subscribers and a back catalog of evergreen reviews. Monthly ad revenue averages $1,850 with sponsorships on top, and the channel carries a clean copyright record.",
    icon: "Youtube",
    hue: 0,
  },
  {
    id: "p-006",
    slug: "quiet-focus-lofi-youtube-31k",
    name: "Quiet Focus — Lofi YouTube Channel, 31K",
    category: "youtube",
    sellerId: "crescentrow",
    price: 5100,
    rating: 4.8,
    reviews: 187,
    sales: 265,
    stock: 1,
    createdAt: "2026-05-11",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "Full license portfolio for the uploaded catalog",
      "12-month watch-time and revenue analytics",
    ],
    description:
      "A lofi and ambient-music channel with long-form streams that collect watch time around the clock. All uploaded audio is fully licensed, and the license portfolio transfers with the channel.",
    icon: "Youtube",
    hue: 8,
  },
  {
    id: "p-007",
    slug: "atlas-business-linkedin-24k",
    name: "Atlas Advisory — LinkedIn Authority Profile, 24K",
    category: "linkedin",
    sellerId: "meridian",
    price: 6200,
    rating: 4.9,
    reviews: 133,
    sales: 176,
    stock: 1,
    createdAt: "2026-08-08",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "Newsletter subscriber list (11,400 contacts)",
      "Speaking and press mention archive",
    ],
    description:
      "A consulting authority profile in the operations niche with 24K relevant connections and a newsletter that converts. Ideal for a firm entering B2B advisory with immediate distribution.",
    icon: "Linkedin",
    hue: 217,
  },
  {
    id: "p-008",
    slug: "kitchen-craft-pinterest-45k",
    name: "Kitchen & Craft — Pinterest Traffic Account, 45K",
    category: "pinterest",
    sellerId: "vantage",
    price: 1850,
    rating: 4.8,
    reviews: 121,
    sales: 240,
    stock: 1,
    createdAt: "2026-07-19",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "Top-performing pin templates and board structure",
      "Monthly outbound click report (avg. 128K)",
    ],
    description:
      "A home and recipe account that drives consistent outbound traffic to blogs and storefronts. Boards are tightly themed, and the audience is 82% United States-based with strong purchase intent.",
    icon: "Pin",
    hue: 14,
  },
  {
    id: "p-009",
    slug: "marketpulse-telegram-channel-58k",
    name: "MarketPulse — Telegram Channel, 58K",
    category: "telegram",
    sellerId: "archerpeak",
    price: 3400,
    rating: 4.7,
    reviews: 97,
    sales: 288,
    stock: 1,
    createdAt: "2026-06-05",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Full ownership transfer of the channel",
      "Subscriber activity and growth audit",
      "Monetization playbook used by the current owner",
    ],
    description:
      "A markets and investing channel with 58K subscribers and 22% average view rate. Sponsored slots are booked three weeks out, and the current operator will share their placement calendar.",
    icon: "MessagesSquare",
    hue: 205,
  },
  {
    id: "p-010",
    slug: "techprism-x-news-handle-48k",
    name: "TechPrism — X News Handle, 48K",
    category: "x-twitter",
    sellerId: "solstice",
    price: 2900,
    rating: 4.5,
    reviews: 76,
    sales: 205,
    stock: 1,
    createdAt: "2026-05-28",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "Six-year account age documentation",
      "Follower quality report with bot audit",
    ],
    description:
      "A technology news handle with an audience of founders, engineers and investors. Posting cadence is three to five tweets a day, and engagement concentrates on thread formats.",
    icon: "Twitter",
    hue: 222,
  },
  {
    id: "p-011",
    slug: "gridiron-gaming-tiktok-510k",
    name: "GridIron Plays — TikTok Gaming Account, 510K",
    category: "tiktok",
    sellerId: "northgate",
    price: 8200,
    oldPrice: 9900,
    rating: 4.9,
    reviews: 264,
    sales: 390,
    stock: 1,
    createdAt: "2026-04-16",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "Creator-fund payout history for the last 6 months",
      "Brand-deal pipeline with two active sponsors",
    ],
    description:
      "A gaming highlights account with 510K followers and multiple videos above 4M views. Creator-fund payouts and two sponsor retainers transfer with the account, along with the content pipeline.",
    icon: "Music2",
    hue: 268,
  },
  {
    id: "p-012",
    slug: "homefront-interior-instagram-130k",
    name: "HomeFront — Instagram Interior Page, 130K",
    category: "instagram",
    sellerId: "harborlight",
    price: 3200,
    rating: 4.6,
    reviews: 108,
    sales: 245,
    stock: 1,
    createdAt: "2026-03-30",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "Reels template library and posting calendar",
      "30-day post-transfer support from the seller",
    ],
    description:
      "An interior-design page with a US-heavy audience and strong affiliate conversion history. The seller includes their Reels templates and a tested posting cadence to keep growth on track.",
    icon: "Instagram",
    hue: 305,
  },
  {
    id: "p-013",
    slug: "dealstream-facebook-group-74k",
    name: "DealStream — Facebook Group, 74K Members",
    category: "facebook",
    sellerId: "solstice",
    price: 4100,
    rating: 4.5,
    reviews: 156,
    sales: 198,
    stock: 1,
    createdAt: "2026-08-22",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Full admin transfer with all moderator roles",
      "Group rules, moderation logs and ban history",
      "Affiliate revenue statements for 12 months",
    ],
    description:
      "A deals-and-discounts community with 74K members and daily organic activity. Admin rights and affiliate integrations transfer intact, with a documented moderation history to inherit.",
    icon: "Facebook",
    hue: 214,
  },
  {
    id: "p-014",
    slug: "founders-circle-linkedin-page-18k",
    name: "Founders Circle — LinkedIn Company Page, 18K",
    category: "linkedin",
    sellerId: "vantage",
    price: 2750,
    rating: 4.6,
    reviews: 82,
    sales: 150,
    stock: 1,
    createdAt: "2026-07-09",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Full admin transfer with all page roles",
      "Follower demographics and industry breakdown",
      "Content archive with top-performing post templates",
    ],
    description:
      "A founder-focused company page with senior followers across SaaS and finance. Admin access transfers cleanly, making it a turnkey distribution channel for B2B content programs.",
    icon: "Linkedin",
    hue: 205,
  },
  {
    id: "p-015",
    slug: "clutch-arena-twitch-partnered-42k",
    name: "Clutch Arena — Twitch Channel, 42K",
    category: "twitch",
    sellerId: "northgate",
    price: 6900,
    rating: 4.8,
    reviews: 117,
    sales: 165,
    stock: 1,
    createdAt: "2026-09-01",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "Partner-status documentation and payout history",
      "Panel, emote and overlay asset pack",
    ],
    description:
      "A partnered FPS streaming channel with 42K followers and a loyal live audience. Partner status, emotes and panel assets transfer with the channel, along with a consistent streaming schedule history.",
    icon: "Twitch",
    hue: 270,
  },
  {
    "id": "p-016",
    slug: "servercraft-discord-community-31k",
    name: "ServerCraft — Discord Community, 31K Members",
    category: "discord",
    sellerId: "meridian",
    price: 2600,
    rating: 4.7,
    reviews: 71,
    sales: 142,
    stock: 1,
    createdAt: "2026-06-27",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Full server ownership transfer",
      "Role structure, bots and automation configs",
      "Moderation guidelines and staff handover notes",
    ],
    description:
      "A technology and design community with 31K members and daily conversation across specialist channels. Ownership, bots and role architecture transfer with documented moderation guidelines.",
    icon: "Gamepad2",
    hue: 235,
  },
  {
    id: "p-017",
    slug: "runway-beauty-tiktok-190k",
    name: "Runway Notes — TikTok Beauty Account, 190K",
    category: "tiktok",
    sellerId: "crescentrow",
    price: 4600,
    rating: 4.9,
    reviews: 178,
    sales: 310,
    stock: 1,
    createdAt: "2026-08-27",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "Brand-deal contracts (two active, transferring)",
      "Content calendar and editing preset pack",
    ],
    description:
      "A beauty and skincare account with high save rates and two active brand contracts that transfer with the sale. The seller includes their content calendar and editing presets for continuity.",
    icon: "Music2",
    hue: 322,
  },
  {
    id: "p-018",
    slug: "globe-hoppers-travel-instagram-620k",
    name: "Globe Hoppers — Instagram Travel Page, 620K",
    category: "instagram",
    sellerId: "lumenpath",
    price: 5600,
    rating: 4.3,
    reviews: 64,
    sales: 130,
    stock: 1,
    createdAt: "2026-07-25",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "Audience geography and engagement audit",
      "Sponsorship inquiry inbox handover",
    ],
    description:
      "A travel page with 620K followers across 60+ countries and strong hotel-tourism sponsorship demand. This listing comes from an unverified seller; identity verification is in progress.",
    icon: "Instagram",
    hue: 190,
  },
  {
    id: "p-019",
    slug: "hustle-hub-facebook-page-96k",
    name: "HustleHub — Facebook Business Page, 96K",
    category: "facebook",
    sellerId: "lumenpath",
    price: 2250,
    rating: 4.4,
    reviews: 52,
    sales: 118,
    stock: 1,
    createdAt: "2026-08-18",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Full admin transfer with all page roles",
      "Page transparency and standing report",
      "Ad-account access (spend history included)",
    ],
    description:
      "An entrepreneurship page with 96K followers and consistent organic reach on link posts. This listing comes from an unverified seller; escrow protection still applies in full.",
    icon: "Facebook",
    hue: 210,
  },
  {
    id: "p-020",
    slug: "studio-nine-tv-youtube-shorts-120k",
    name: "Studio Nine — YouTube Shorts Channel, 120K",
    category: "youtube",
    sellerId: "solstice",
    price: 7800,
    rating: 4.8,
    reviews: 149,
    sales: 260,
    stock: 1,
    createdAt: "2026-05-19",
    delivery: "Secure credential handover",
    included: [
      "Verified ownership documents and transfer record",
      "Original registration email with full access",
      "Shorts-monetization eligibility documentation",
      "Template pack for the top 10 recurring formats",
    ],
    description:
      "A shorts-first channel with 120K subscribers and a stable of repeatable formats. Revenue comes from Shorts monetization plus licensing deals, both documented in the handover pack.",
    icon: "Youtube",
    hue: 4,
  },
];

export const reviews: Review[] = [
  {
    productSlug: "aurora-lifestyle-theme-page-890k",
    author: "Priya S.",
    rating: 5,
    date: "2026-09-12",
    text: "Escrow released the same day and the transfer was finished in under two hours. The analytics export matched the listing exactly.",
  },
  {
    productSlug: "aurora-lifestyle-theme-page-890k",
    author: "Marcus T.",
    rating: 5,
    date: "2026-09-08",
    text: "Everything arrived as described — engagement, follower quality, even the sponsorship pipeline. The onboarding call sealed it.",
  },
  {
    productSlug: "aurora-lifestyle-theme-page-890k",
    author: "Lena K.",
    rating: 4,
    date: "2026-08-30",
    text: "Flawless transfer. I'd have liked the media-kit numbers broken out by region, but the seller compiled them when I asked.",
  },
  {
    productSlug: "fitfuel-shortform-tiktok-340k",
    author: "Diego R.",
    rating: 5,
    date: "2026-09-14",
    text: "Payout history checked out and the account switched over without a single hiccup. View counts have held steady since.",
  },
  {
    productSlug: "fitfuel-shortform-tiktok-340k",
    author: "Amara O.",
    rating: 4,
    date: "2026-09-02",
    text: "Smooth purchase overall. Identity verification took a day longer than expected, but support kept me updated throughout.",
  },
  {
    productSlug: "workshop-monetized-youtube-64k",
    author: "Sofia M.",
    rating: 5,
    date: "2026-09-10",
    text: "The revenue statements and strike-free report made this an easy decision. AdSense was redirected to me within a week.",
  },
  {
    productSlug: "workshop-monetized-youtube-64k",
    author: "Jon P.",
    rating: 5,
    date: "2026-08-29",
    text: "Serious operation. The seller walked me through the whole catalog license portfolio before escrow released.",
  },
  {
    productSlug: "atlas-business-linkedin-24k",
    author: "Hannah W.",
    rating: 5,
    date: "2026-09-15",
    text: "The newsletter list alone paid for the purchase. First sponsored send converted at 6%.",
  },
  {
    productSlug: "atlas-business-linkedin-24k",
    author: "Tom B.",
    rating: 5,
    date: "2026-09-05",
    text: "Professional handover from start to finish — documents, call, support. This is how account transfers should work.",
  },
  {
    productSlug: "atlas-business-linkedin-24k",
    author: "Ravi N.",
    rating: 4,
    date: "2026-08-21",
    text: "Excellent profile and audience fit. Delivery took two days instead of one, but the quality was worth the wait.",
  },
  {
    productSlug: "kitchen-craft-pinterest-45k",
    author: "Ella F.",
    rating: 5,
    date: "2026-09-11",
    text: "Traffic numbers were real — my blog saw the spike within days of taking over. Templates were a bonus.",
  },
  {
    productSlug: "kitchen-craft-pinterest-45k",
    author: "Noah D.",
    rating: 5,
    date: "2026-08-26",
    text: "Clean boards, real engagement, honest seller. Escrow made the whole thing painless.",
  },
  {
    productSlug: "gridiron-gaming-tiktok-510k",
    author: "Ines V.",
    rating: 5,
    date: "2026-09-13",
    text: "Both sponsor contracts transferred as promised, and the content pipeline came with it. Zero regrets.",
  },
  {
    productSlug: "marketpulse-telegram-channel-58k",
    author: "Kai L.",
    rating: 4,
    date: "2026-09-09",
    text: "Subscriber audit was accurate and view rates held post-transfer. Onboarding doc could be longer, but support filled the gaps.",
  },
  {
    productSlug: "quiet-focus-lofi-youtube-31k",
    author: "Grace H.",
    rating: 5,
    date: "2026-09-07",
    text: "The license portfolio transfer was the part I worried about, and it was handled perfectly. Watch time never dipped.",
  },
  {
    productSlug: "clutch-arena-twitch-partnered-42k",
    author: "Owen C.",
    rating: 5,
    date: "2026-09-04",
    text: "Partner status carried over exactly as documented, and the emote pack is excellent. Loyal chat, real revenue.",
  },
  {
    productSlug: "dealstream-facebook-group-74k",
    author: "Yara Z.",
    rating: 5,
    date: "2026-08-31",
    text: "Admin transfer, moderation logs, affiliate revenue — all documented and handed over in one pass. Very professional seller.",
  },
  {
    productSlug: "runway-beauty-tiktok-190k",
    author: "Felix A.",
    rating: 5,
    date: "2026-09-06",
    text: "Two brand contracts transferred with the account, just as listed. The content calendar alone is worth a month of planning.",
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
