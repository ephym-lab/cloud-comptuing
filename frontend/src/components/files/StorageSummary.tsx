"use client";

import { CATEGORY_LABELS, CATEGORY_ORDER, formatBytes } from "@/lib/format";
import type { FileCategory, StatsResponse } from "@/types/api";

// Literal class names so Tailwind generates them. Colours live in globals.css.
const SWATCH: Record<FileCategory, string> = {
  video: "bg-cat-video",
  audio: "bg-cat-audio",
  image: "bg-cat-image",
  document: "bg-cat-document",
  other: "bg-cat-other",
};

/**
 * Bytes stored per category: a thin segmented bar (one whole, split into parts) above
 * rows that carry every figure, so colour is never the only way to read it.
 */
export function StorageSummary({ stats }: { stats: StatsResponse | null }) {
  if (!stats) {
    return <div className="h-48 animate-pulse rounded-lg bg-line/60" aria-label="Loading storage summary" />;
  }

  const total = stats.total.total_bytes;
  const share = (bytes: number) => (total ? Math.round((bytes / total) * 100) : 0);
  const parts = CATEGORY_ORDER.map((category) => ({ category, ...stats.categories[category] }));

  return (
    <section aria-labelledby="storage-title" className="flex flex-col gap-4 rounded-lg border border-line bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="storage-title" className="text-xl font-semibold">
          Storage
        </h2>
        <p className="text-steel">
          <span className="font-semibold text-ink">{formatBytes(total)}</span>{" "}
          {stats.total.count === 1 ? "in 1 file" : `in ${stats.total.count} files`}
        </p>
      </div>

      {total > 0 ? (
        <div
          role="img"
          aria-label={`Storage by type: ${parts
            .filter((p) => p.total_bytes > 0)
            .map((p) => `${CATEGORY_LABELS[p.category]} ${formatBytes(p.total_bytes)} (${share(p.total_bytes)}%)`)
            .join(", ")}`}
          className="flex h-2 gap-0.5 overflow-hidden rounded-full"
        >
          {parts
            .filter((p) => p.total_bytes > 0)
            .map((p) => (
              <span
                key={p.category}
                title={`${CATEGORY_LABELS[p.category]}: ${formatBytes(p.total_bytes)}, ${share(p.total_bytes)}%`}
                className={`h-full min-w-1 ${SWATCH[p.category]}`}
                style={{ flexGrow: p.total_bytes }}
              />
            ))}
        </div>
      ) : (
        <p className="text-steel">Nothing stored yet.</p>
      )}

      <ul className="flex flex-col gap-2 text-[0.9375rem]">
        {parts.map((p) => (
          <li key={p.category} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-3">
            <span className={`size-3 rounded-sm ${SWATCH[p.category]}`} aria-hidden="true" />
            <span className="font-medium">{CATEGORY_LABELS[p.category]}</span>
            <span className="text-steel tabular-nums">{p.count}</span>
            <span className="min-w-16 text-right font-semibold tabular-nums">{formatBytes(p.total_bytes)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
