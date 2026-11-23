import type { FileCategory } from "@/types/api";

/** Simple line glyphs, one per category. Decorative: the category is also written out. */
const PATHS: Record<FileCategory, string> = {
  video: "M4 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm12 4 5-3v10l-5-3",
  audio: "M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1.5 1.5 0 1 1 0-.01",
  document: "M6 3h8l5 5v13H6zM14 3v5h5M9 13h7M9 17h7",
  other: "M5 7h14v13H5zM3 4h18v3H3zM10 11h4",
};

export function CategoryIcon({ category, className = "size-6" }: { category: FileCategory; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[category]} />
    </svg>
  );
}
