import type { ReactNode } from "react";

type Tone = "error" | "success" | "info";

const tones: Record<Tone, string> = {
  error: "border-alert bg-alert-soft",
  success: "border-ok bg-ok-soft",
  info: "border-ink bg-white",
};

/** An inline message. Errors are announced immediately; others politely. */
export function Notice({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md border-l-4 px-4 py-3 text-[0.9375rem] leading-relaxed ${tones[tone]}`}
    >
      {children}
    </div>
  );
}
