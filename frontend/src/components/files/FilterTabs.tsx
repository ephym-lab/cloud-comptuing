"use client";

import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/format";
import type { FileCategory, StatsResponse } from "@/types/api";

interface FilterTabsProps {
  value: FileCategory | null;
  onChange: (value: FileCategory | null) => void;
  stats: StatsResponse | null;
}

/** Category filter. Counts come from /api/files/stats. */
export function FilterTabs({ value, onChange, stats }: FilterTabsProps) {
  const tabs: { key: FileCategory | null; label: string; count?: number }[] = [
    { key: null, label: "All", count: stats?.total.count },
    ...CATEGORY_ORDER.map((category) => ({
      key: category,
      label: CATEGORY_LABELS[category],
      count: stats?.categories[category].count,
    })),
  ];

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="group" aria-label="Filter by type" className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((tab) => {
          const selected = tab.key === value;
          return (
            <button
              key={tab.label}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(tab.key)}
              className={`-mb-px flex items-center gap-2 border-b-[3px] px-3 py-2.5 font-semibold transition-colors ${
                selected ? "border-ink text-ink" : "border-transparent text-steel hover:text-ink"
              }`}
            >
              {tab.label}
              <span
                className={`min-w-6 rounded px-1.5 text-center text-sm tabular-nums ${
                  selected ? "bg-ink text-paper" : "bg-line text-ink"
                }`}
              >
                {tab.count ?? "–"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
