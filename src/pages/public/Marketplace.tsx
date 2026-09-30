import { Link } from "react-router";
import { BrandMark } from "@/components/site/BrandMark";
import { formatPrice } from "@/lib/format";
import { useDb, categories } from "@/lib/db";

export default function Marketplace() {
  const { listings } = useDb();

  const items = listings.filter(
    (listing) => listing.status === "active" && listing.stock > 0,
  );

  return (
    <div className="relative bg-white">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight"
          >
            <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#1e2777] to-[#3a2a8a] shadow-sm">
              <svg
                viewBox="0 0 24 24"
                className="size-4.5 text-white"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M4 5.5A2.5 2.5 0 0 1 6.5 3H14a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 6V5.5ZM4 12a2.5 2.5 0 0 1 2.5-2.5H18a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 12.5V12ZM4 18.5A2.5 2.5 0 0 1 6.5 16H14a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 18.5Z"
                />
              </svg>
            </div>
            Accs<span className="text-[#5b3def]">Mart</span>
          </Link>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100"
            >
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100"
            >
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="sticky top-[56px] z-20 bg-white/95 border-b border-gray-100 px-4 backdrop-blur-sm">
        <div
          className="mx-auto flex max-w-[430px] gap-1.5 overflow-x-auto pb-3 pt-2 scrollbar-none"
          style={{ scrollbarWidth: "none" }}
        >
          {categories
            .filter((category) => category.listingCount > 0)
            .map((category) => (
              <span
                key={category.slug}
                className="shrink-0 px-4 h-8 text-[13px] font-semibold text-gray-800 whitespace-nowrap"
              >
                {category.name}
              </span>
            ))}
        </div>
      </div>

      <div className="mx-auto max-w-[460px] px-1 pb-10">
        <div className="grid grid-cols-2 gap-x-3 gap-y-5">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/listing/${item.id}`}
              className="group flex gap-2 text-underline decoration-none"
            >
              <div className="relative flex aspect-square w-16 shrink-0 items-center rounded-2xl bg-gray-50 shadow-sm overflow-hidden">
                <BrandMark
                  brand={item.brand}
                  block
                  className="h-[92%] w-[92%] transition-transform duration-200 group-hover:scale-105"
                />
                <span className="absolute left-1.5 top-1.5 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-gray-900 shadow-sm backdrop-blur">
                  {item.followers >= 1000000
                    ? `${(item.followers / 1000000).toFixed(1)}M`
                    : item.followers >= 1000
                      ? `${Math.round(item.followers / 1000)}K`
                      : String(item.followers)}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <Link
                  to={`/listing/${item.id}`}
                  className="block truncate text-[14px] font-semibold text-gray-900 transition-colors group-hover:text-[#5b3def]"
                >
                  {item.title}
                </Link>

                <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                  <span>{item.niche}</span>
                  <span className="shrink-0 text-[10px] font-semibold">★ {item.rating.toFixed(1)}</span>
                </div>

                <div className="mt-1.5 flex items-center justify-between">
                  <div>
                    <span className="text-[17px] font-bold text-black">
                      {formatPrice(item.price)}
                      <span className="ml-1 text-[9px] text-gray-400">.00</span>
                    </span>
                  </div>
                  <span className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-900 shadow-sm transition-colors group-hover:bg-black group-hover:text-white">
                    Buy
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="h-14" />
    </div>
  );
}
