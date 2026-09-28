import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  ChevronRight,
  Clock,
  Flag,
  MapPin,
  MessageSquare,
  Minus,
  Lock,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Stars } from "@/components/marketplace/Stars";
import { ProductArtwork } from "@/components/marketplace/ProductArtwork";
import { ProductCard } from "@/components/marketplace/ProductCard";
import { SiteHeader } from "@/components/marketplace/SiteHeader";
import { SiteFooter } from "@/components/marketplace/SiteFooter";
import { ReportDialog } from "@/components/marketplace/ReportDialog";
import {
  getCategory,
  getProductBySlug,
  getRelated,
  getReviewsFor,
  getSeller,
} from "@/data/catalog";
import { formatPrice, useCart } from "@/lib/cart";

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  return <ProductPageContent key={slug ?? "not-found"} slug={slug} />;
}

function ProductPageContent({ slug }: { slug?: string }) {
  const product = useMemo(() => (slug ? getProductBySlug(slug) : undefined), [slug]);
  // Re-mounted per slug via key (see <ProductPageContent key={slug} /> above):
  // this gives a fresh loading state + quantity without setState-in-effect.
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const { add, setOpen } = useCart();

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 400);
    window.scrollTo(0, 0);
    return () => window.clearTimeout(t);
  }, []);

  if (!product) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
          <div className="clay flex flex-col items-center px-10 py-12">
            <PackageCheck className="size-10 text-muted-foreground" />
            <h1 className="mt-4 text-xl font-semibold">Listing not found</h1>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              This listing doesn't exist or may have been removed by our
              moderation team.
            </p>
            <Button variant="clay" className="mt-6 rounded-xl" asChild>
              <Link to="/marketplace">
                <ArrowLeft className="size-4" /> Back to marketplace
              </Link>
            </Button>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const category = getCategory(product.category);
  const seller = getSeller(product.sellerId);
  const productReviews = getReviewsFor(product.slug);
  const related = getRelated(product);
  const outOfStock = product.stock === 0;
  const lowStock = !outOfStock && product.stock <= 20;

  const addToCart = () => {
    add(
      {
        slug: product.slug,
        name: product.name,
        price: product.price,
        hue: product.hue,
      },
      quantity,
    );
  };

  const buyNow = () => {
    add(
      {
        slug: product.slug,
        name: product.name,
        price: product.price,
        hue: product.hue,
      },
      quantity,
    );
    setOpen(true);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="size-3.5" />
            <Link
              to="/marketplace"
              className="transition-colors hover:text-foreground"
            >
              Marketplace
            </Link>
            <ChevronRight className="size-3.5" />
            <Link
              to={`/marketplace?category=${category.slug}`}
              className="transition-colors hover:text-foreground"
            >
              {category.name}
            </Link>
            <ChevronRight className="size-3.5" />
            <span className="max-w-40 truncate text-foreground sm:max-w-64">
              {product.name}
            </span>
          </nav>

          {loading ? (
            <ProductDetailSkeleton />
          ) : (
            <>
              <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_26rem]">
                {/* ---------- Left: gallery + tabs ---------- */}
                <div className="min-w-0">
                  {/* Gallery */}
                  <div className="clay relative flex h-72 items-center justify-center overflow-hidden rounded-(--radius-xl) sm:h-96">
                    <div
                      className="absolute inset-0 opacity-50"
                      style={{
                        background: `radial-gradient(70% 70% at 30% 20%, oklch(0.6 0.12 ${product.hue} / 30%), transparent 70%), radial-gradient(60% 60% at 80% 90%, oklch(0.55 0.14 ${product.hue + 40} / 25%), transparent 70%)`,
                      }}
                    />
                    <div
                      className="absolute inset-0 opacity-30"
                      style={{
                        backgroundImage:
                          "radial-gradient(oklch(1 0 0 / 10%) 1px, transparent 1.5px)",
                        backgroundSize: "20px 20px",
                      }}
                    />
                    <ProductArtwork
                      icon={product.icon}
                      hue={product.hue}
                      size="lg"
                      className="size-32! rounded-[2rem] sm:size-40!"
                    />
                    <Badge
                      variant="secondary"
                      className="clay-inset absolute left-5 top-5 rounded-full border-border/60 px-3 py-1 text-xs text-muted-foreground"
                    >
                      {category.name}
                    </Badge>
                  </div>

                  {/* Title + seller row */}
                  <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                        {product.name}
                      </h1>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                        <Stars
                          rating={product.rating}
                          count={product.reviews}
                        />
                        <span className="text-sm text-muted-foreground">
                          {product.sales.toLocaleString()} sold
                        </span>
                      </div>
                    </div>
                    <ReportDialog what={`the product “${product.name}”`}>
                      <Flag className="size-4" />
                    </ReportDialog>
                  </div>

                  {/* Details tabs */}
                  <Tabs defaultValue="description" className="mt-8">
                    <TabsList className="h-11 w-full justify-start rounded-2xl bg-muted/60 p-1">
                      <TabsTrigger value="description" className="rounded-xl">
                        Description
                      </TabsTrigger>
                      <TabsTrigger
                        value="included"
                        className="rounded-xl"
                      >
                        What's included
                      </TabsTrigger>
                      <TabsTrigger
                        value="reviews"
                        className="rounded-xl"
                      >
                        Reviews ({product.reviews})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="description" className="mt-5">
                      <p className="max-w-2xl leading-relaxed text-muted-foreground">
                        {product.description}
                      </p>
                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <DetailRow
                          icon={ShieldCheck}
                          label="Transfer method"
                          value={product.delivery}
                        />
                        <DetailRow
                          icon={Clock}
                          label="Availability"
                          value={
                            outOfStock
                              ? "No longer available"
                              : lowStock
                                ? "Exclusive listing — currently reserved"
                                : "Available — exclusive listing"
                          }
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="included" className="mt-5">
                      <ul className="grid max-w-2xl gap-2.5">
                        {product.included.map((item) => (
                          <li
                            key={item}
                            className="clay-inset flex items-start gap-3 rounded-2xl px-4 py-3 text-sm"
                          >
                            <PackageCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </TabsContent>

                    <TabsContent value="reviews" className="mt-5">
                      {productReviews.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No written reviews yet for this product — be the first
                          after purchase.
                        </p>
                      ) : (
                        <ul className="max-w-2xl space-y-3">                        {productReviews.map((review) => (
                          <li key={review.author} className="clay p-5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                                  {review.author.charAt(0)}
                                </span>
                                <div>
                                  <p className="text-sm font-medium">
                                    {review.author}
                                  </p>
                                  <Stars rating={review.rating} />
                                </div>
                              </div>
                              <time className="text-xs text-muted-foreground">
                                {new Date(review.date).toLocaleDateString(
                                  "en-US",
                                  { month: "short", day: "numeric" },
                                )}
                              </time>
                            </div>
                            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                              {review.text}
                            </p>
                          </li>
                        ))}
                        </ul>
                      )}
                    </TabsContent>
                  </Tabs>

                  {/* Seller profile */}
                  <div className="clay mt-8 p-6">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Sold by
                    </h2>
                    <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <span
                          className="flex size-12 items-center justify-center rounded-2xl text-lg font-bold text-white"
                          style={{
                            background:
                              "linear-gradient(145deg, oklch(0.72 0.13 229 / 90%), oklch(0.6 0.15 285 / 90%))",
                            boxShadow:
                              "inset 0 2px 3px oklch(1 0 0 / 30%), 0 6px 14px -5px oklch(0.67 0.15 260 / 55%)",
                          }}
                        >
                          {seller.name.charAt(0)}
                        </span>
                        <div>
                          <p className="flex items-center gap-1.5 font-semibold">
                            {seller.name}
                            {seller.verified && (
                              <BadgeCheck
                                className="size-4.5 text-primary"
                                aria-label="Verified seller"
                              />
                            )}
                          </p>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3.5" /> {seller.location}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MessageSquare className="size-3.5" />
                              {seller.responseTime}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-6 text-sm">
                        <div>
                          <p className="font-bold tabular-nums">
                            {seller.rating.toFixed(1)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Seller rating
                          </p>
                        </div>
                        <div>
                          <p className="font-bold tabular-nums">
                            {seller.sales.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Sales
                          </p>
                        </div>
                        <div>
                          <p className="font-bold">On the hub since</p>
                          <p className="text-xs text-muted-foreground">
                            {seller.joined}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ---------- Right: buy box ---------- */}
                <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
                  <div className="clay p-6">
                    <p className="flex items-baseline gap-2.5">
                      <span className="text-3xl font-bold tracking-tight">
                        {formatPrice(product.price)}
                      </span>
                      {product.oldPrice && (
                        <>
                          <span className="text-base text-muted-foreground line-through">
                            {formatPrice(product.oldPrice)}
                          </span>
                          <Badge className="rounded-full bg-emerald-500/15 text-emerald-400">
                            Save{" "}
                            {Math.round(
                              (1 - product.price / product.oldPrice) * 100,
                            )}
                            %
                          </Badge>
                        </>
                      )}
                    </p>

                    <div className="mt-3 text-sm">
                      {outOfStock ? (
                        <span className="font-medium text-destructive">
                          No longer available
                        </span>
                      ) : lowStock ? (
                        <span className="font-medium text-amber-400">
                          Reserved — currently under offer
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-emerald-400/90">
                          <span className="size-1.5 rounded-full bg-emerald-400" />
                          Available — exclusive listing
                        </span>
                      )}
                    </div>

                    {/* Quantity */}
                    <div className="mt-5 flex items-center justify-between">
                      <span className="text-sm font-medium">Quantity</span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="clay"
                          size="icon-sm"
                          className="size-8 rounded-lg"
                          aria-label="Decrease quantity"
                          disabled={quantity <= 1}
                          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        <span
                          className="w-9 text-center text-sm font-semibold tabular-nums"
                          aria-live="polite"
                        >
                          {quantity}
                        </span>
                        <Button
                          variant="clay"
                          size="icon-sm"
                          className="size-8 rounded-lg"
                          aria-label="Increase quantity"
                          disabled={outOfStock || product.stock <= 1}
                          onClick={() => setQuantity((q) => Math.min(product.stock || 1, q + 1))}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-2.5">
                      <Button
                        variant="clay"
                        className="clay-btn h-11 rounded-2xl"
                        disabled={outOfStock}
                        onClick={addToCart}
                      >
                        <ShoppingBag className="size-4" />
                        Add to cart
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-11 rounded-2xl"
                        disabled={outOfStock}
                        onClick={buyNow}
                      >
                        <Lock className="size-4" />
                        Buy with escrow
                      </Button>
                    </div>

                    <Separator className="my-5" />

                    {/* Trust blocks */}
                    <div className="space-y-3 text-sm">
                      <div className="flex gap-3">
                        <Lock className="mt-0.5 size-4.5 shrink-0 text-emerald-400" />
                        <div>
                          <p className="font-medium">Escrow-protected payment</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            Your funds are held securely and released to the
                            seller only after you confirm the transfer.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <ShieldCheck className="mt-0.5 size-4.5 shrink-0 text-primary" />
                        <div>
                          <p className="font-medium">Transfer guarantee</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            If the account doesn't match its listing or the
                            transfer fails, you're refunded in full.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <CalendarClock className="mt-0.5 size-4.5 shrink-0 text-secondary" />
                        <div>
                          <p className="font-medium">Secure handover</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            {product.delivery} — guided by our transfer team and
                            typically completed within 24 hours.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>

              {/* Related */}
              <section className="mt-16" aria-label="Related accounts">
                <h2 className="text-xl font-bold tracking-tight">
                  Comparable accounts
                </h2>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {related.map((p) => (
                    <ProductCard key={p.slug} product={p} />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="clay-inset flex items-center gap-3 rounded-2xl px-4 py-3.5">
      <Icon className="size-4.5 shrink-0 text-primary" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_26rem]">
      <div className="min-w-0">
        <Skeleton className="h-72 rounded-(--radius-xl) sm:h-96" />
        <Skeleton className="mt-6 h-8 w-3/4" />
        <Skeleton className="mt-3 h-5 w-1/3" />
        <Skeleton className="mt-8 h-11 w-full max-w-md rounded-2xl" />
        <Skeleton className="mt-5 h-24 rounded-(--radius-xl)" />
        <Skeleton className="mt-8 h-36 rounded-(--radius-xl)" />
      </div>
      <div>
        <Skeleton className="h-96 rounded-(--radius-xl)" />
      </div>
    </div>
  );
}
