import type { FileCategory } from "@/types/api";

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** 1536 → "1.5 KB". Uses 1024 steps, like the backend's MAX_UPLOAD_MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${UNITS[unit]}`;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const absolute = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** "2 minutes ago", falling back to a date after a week. */
export function formatWhen(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86400) return relative.format(Math.round(seconds / 86400), "day");
  return absolute.format(new Date(iso));
}

export function formatFullDate(iso: string): string {
  return absolute.format(new Date(iso));
}

/** 75 → "1:15" */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const CATEGORY_LABELS: Record<FileCategory, string> = {
  video: "Videos",
  audio: "Audio",
  image: "Images",
  document: "Documents",
  other: "Other",
};

export const CATEGORY_ORDER: FileCategory[] = ["video", "audio", "image", "document", "other"];

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}
