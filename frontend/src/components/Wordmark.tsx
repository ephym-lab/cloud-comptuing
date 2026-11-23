import Link from "next/link";

/** "S3" set as a key chip, echoing how keys are drawn throughout the app. */
export function Wordmark({ surface = "paper" }: { surface?: "paper" | "ink" }) {
  const chip = surface === "ink" ? "bg-paper text-ink" : "bg-ink text-paper";
  return (
    <Link href="/dashboard" className="inline-flex items-center gap-2 text-lg font-bold tracking-tight">
      <span className={`rounded px-1.5 py-0.5 font-mono text-base font-medium ${chip}`}>S3</span>
      File Share
    </Link>
  );
}
