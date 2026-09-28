import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  Flag,
  MapPin,
  MessageSquare,
  Minus,
  Plus,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BrandMark } from "@/components/site/BrandMark";
import { RatingStars } from "@/components/common/RatingStars";
import { ListingCard } from "@/components/common/ListingCard";
import { formatFollowers, formatPrice } from "@/lib/format";
import { getCategory, getRelated, getReviewsFor, getSeller, useDb } from "@/lib/db";
import { cn } from "@/lib/utils";

const REPORT_REASONS = [
  "Stolen or unauthorized account",
  "Misleading listing or description",
  "Suspected fraud or scam",
  "Prohibited content",
  "Something else",
];

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { listings } = useDb();
  const listing = listings.find((l) => l.id === id);

  const [quantity, setQuantity] = useState(1);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string>();
  const [reportDetail, setReportDetail] = useState("");

  if (!listing) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-24 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Listing not found</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          This listing doesn't exist or may have been removed by our moderation
          team.
        </p>
        <Button variant="outline" className="mt-6 rounded-xl" asChild>
          <Link to="/marketplace">
            <ArrowLeft className="size-4" /> Back to marketplace
          </Link>
        </Button>
      </div>
    );
  }

  const category = getCategory(listing.category);
  const seller = getSeller(listing.sellerId);
  const reviews = getReviewsFor(listing.id);
  const related = getRelated(listing);
  const available = listing.status === "active" && listing.stock > 0;

  const buy = () => {
    navigate(
      `/checkout?listing=${listing.id}&qty=${quantity}`,
    );
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/" className="transition-colors hover:text-foreground">
          Home
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <Link to="/marketplace" className="transition-colors hover:text-foreground">
          Marketplace
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <Link
          to={`/marketplace?category=${category.slug}`}
          className="transition-colors hover:text-foreground"
        >
          {category.name}
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="max-w-40 truncate text-foreground sm:max-w-64">
          {listing.title}
        </span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_26rem]">
        {/* ------------------------------ Left ------------------------------ */}
        <div className="min-w-0">
          {/* Preview area */}
          <div className="glass flex h-72 flex-col items-center justify-center gap-4 sm:h-96">
            <div className="flex size-24 items-center justify-center rounded-3xl border border-border/70 bg-muted/40">
              <BrandMark brand={listing.brand} colored className="size-12" />
            </div>
            <Badge variant="secondary" className="rounded-full border-border/60 bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
              {category.name} · {listing.niche}
            </Badge>
          </div>

          {/* Title + rating */}
          <div className="mt-6">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {listing.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <RatingStars rating={listing.rating} />
                <span className="font-medium text-foreground">
                  {listing.rating.toFixed(1)}
                </span>
                <span>({listing.reviewCount} reviews)</span>
              </span>
              <span>{formatFollowers(listing.followers)} followers</span>
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" />
                Listed {new Date(listing.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="description" className="mt-8">
            <TabsList className="h-11 w-full justify-start rounded-xl bg-muted/50 p-1">
              <TabsTrigger value="description" className="rounded-lg">
                Description
              </TabsTrigger>
              <TabsTrigger value="features" className="rounded-lg">
                Features
              </TabsTrigger>
              <TabsTrigger value="reviews" className="rounded-lg">
                Reviews ({listing.reviewCount})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="description" className="mt-5">
              <p className="max-w-2xl leading-relaxed text-muted-foreground">
                {listing.description}
              </p>
              <dl className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-2">
                {[
                  { label: "Platform", value: category.name },
                  { label: "Niche", value: listing.niche },
                  { label: "Audience", value: `${formatFollowers(listing.followers)} followers` },
                  { label: "Transfer time", value: listing.deliveryTime },
                ].map((row) => (
                  <div key={row.label} className="inset-well rounded-xl px-4 py-3">
                    <dt className="text-xs text-muted-foreground">{row.label}</dt>
                    <dd className="mt-0.5 text-sm font-medium">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </TabsContent>

            <TabsContent value="features" className="mt-5">
              <ul className="grid max-w-2xl gap-2.5">
                {listing.features.map((f) => (
                  <li key={f} className="inset-well flex items-start gap-3 rounded-xl px-4 py-3 text-sm">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
            </TabsContent>

            <TabsContent value="reviews" className="mt-5">
              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No written reviews yet for this listing.
                </p>
              ) : (
                <ul className="max-w-2xl space-y-3">
                  {reviews.map((r) => (
                    <li key={r.id} className="glass p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                            {r.author.charAt(0)}
                          </span>
                          <div>
                            <p className="text-sm font-medium">{r.author}</p>
                            <RatingStars rating={r.rating} />
                          </div>
                        </div>
                        <time className="text-xs text-muted-foreground">
                          {new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </time>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {r.text}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>

          {/* Seller profile */}
          <div className="glass mt-8 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Sold by
            </h2>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-lg font-bold text-primary">
                  {seller.name.charAt(0)}
                </span>
                <div>
                  <p className="flex items-center gap-1.5 font-semibold">
                    {seller.name}
                    {seller.verified && (
                      <BadgeCheck className="size-4.5 text-primary" aria-label="Verified seller" />
                    )}
                  </p>
                  <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" /> Verified region
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="size-3.5" /> {seller.responseTime}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex gap-6 text-sm">
                <div>
                  <p className="font-bold tabular-nums">{seller.rating.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Rating</p>
                </div>
                <div>
                  <p className="font-bold tabular-nums">{seller.sales.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Sales</p>
                </div>
                <div>
                  <p className="font-bold">
                    {new Date(seller.memberSince).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </p>
                  <p className="text-xs text-muted-foreground">Member since</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ----------------------------- Buy box ----------------------------- */}
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="glass p-6">
            <p className="flex items-baseline gap-2.5">
              <span className="text-3xl font-bold tracking-tight">
                {formatPrice(listing.price)}
              </span>
              {listing.oldPrice && (
                <span className="text-base text-muted-foreground line-through">
                  {formatPrice(listing.oldPrice)}
                </span>
              )}
            </p>

            <div className="mt-3 text-sm">
              {available ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-400/90">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Available · exclusive listing
                </span>
              ) : (
                <span className="font-medium text-amber-400 capitalize">
                  {listing.status === "sold" ? "Sold" : "Currently unavailable"}
                </span>
              )}
            </div>

            {/* Quantity */}
            <div className="mt-5 flex items-center justify-between">
              <span className="text-sm font-medium">Quantity</span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-lg"
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-9 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                  {quantity}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-lg"
                  aria-label="Increase quantity"
                  disabled={!available || quantity >= listing.stock}
                  onClick={() => setQuantity((q) => Math.min(listing.stock, q + 1))}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              <Button
                size="lg"
                className="h-11 w-full rounded-xl"
                disabled={!available}
                onClick={buy}
              >
                <ShieldCheck className="size-4" />
                Buy with escrow
              </Button>
              <Dialog open={reportOpen} onOpenChange={setReportOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" className="w-full rounded-xl text-muted-foreground">
                    <Flag className="size-4" />
                    Report listing
                  </Button>
                </DialogTrigger>
                <DialogContent className="glass border-border/70 sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Report this listing</DialogTitle>
                    <DialogDescription>
                      Reports go to our trust & safety team, usually reviewed
                      within 24 hours. Your report is confidential.
                    </DialogDescription>
                  </DialogHeader>
                  <RadioGroup value={reportReason} onValueChange={setReportReason} className="gap-2.5">
                    {REPORT_REASONS.map((reason) => (
                      <Label
                        key={reason}
                        htmlFor={`reason-${reason}`}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 p-3.5 text-sm font-normal transition-colors hover:bg-accent/40",
                          reportReason === reason && "border-primary/60 bg-primary/10",
                        )}
                      >
                        <RadioGroupItem id={`reason-${reason}`} value={reason} />
                        {reason}
                      </Label>
                    ))}
                  </RadioGroup>
                  <div className="grid gap-2">
                    <Label htmlFor="report-details" className="text-xs text-muted-foreground">
                      Additional details (optional)
                    </Label>
                    <Textarea
                      id="report-details"
                      value={reportDetail}
                      onChange={(e) => setReportDetail(e.target.value)}
                      placeholder="Share anything that helps our review…"
                      className="inset-well min-h-20 rounded-xl border-border/60"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" className="rounded-xl" onClick={() => setReportOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      className="rounded-xl"
                      disabled={!reportReason}
                      onClick={() => {
                        setReportOpen(false);
                        setReportReason(undefined);
                        setReportDetail("");
                      }}
                    >
                      Submit report
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Separator className="my-5" />

            {/* Refund / dispute info */}
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-4.5 shrink-0 text-emerald-400" />
                <div>
                  <p className="font-medium">Escrow-protected payment</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Funds are held securely and released to the seller only
                    after you confirm the transfer.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Undo2 className="mt-0.5 size-4.5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">Refunds & disputes</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    If the account doesn't match its listing, open a dispute
                    within 30 days for a full refund from escrow.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <CalendarClock className="mt-0.5 size-4.5 shrink-0 text-secondary-foreground" />
                <div>
                  <p className="font-medium">Transfer window</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {listing.deliveryTime} · guided by our transfer team.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-16" aria-label="Related listings">
          <h2 className="text-xl font-bold tracking-tight">Comparable accounts</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
