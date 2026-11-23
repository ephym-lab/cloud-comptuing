"use client";

import { useState } from "react";

import { formatCountdown } from "@/lib/format";
import { useCountdown } from "@/lib/use-countdown";

export interface IssuedLink {
  url: string;
  expiresIn: number;
  /** ms since epoch, computed on arrival from expires_in. */
  deadline: number;
}

export function issueLink(signed: { url: string; expires_in: number }): IssuedLink {
  return { url: signed.url, expiresIn: signed.expires_in, deadline: Date.now() + signed.expires_in * 1000 };
}

interface LinkTicketProps {
  link: IssuedLink;
  /** e.g. "Preview link" */
  label: string;
  onRenew?: () => void;
  renewing?: boolean;
}

/**
 * A signed URL drawn as a claim ticket: the yellow body holds the link, the stub on
 * the right counts down. When time runs out it turns grey and gets stamped "Expired",
 * and the expired link stays clickable so the audience can see S3 refuse it.
 */
export function LinkTicket({ link, label, onRenew, renewing }: LinkTicketProps) {
  // Capped: right after a renewal the timer may still hold the previous tick's time.
  const secondsLeft = Math.min(link.expiresIn, useCountdown(link.deadline));
  const expired = secondsLeft <= 0;
  const fraction = Math.min(1, secondsLeft / link.expiresIn);
  const params = new URL(link.url).searchParams;
  const signature = params.get("X-Amz-Signature");

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`relative flex overflow-hidden rounded-md transition-colors duration-500 ${
          expired ? "bg-line text-steel" : "bg-tag text-ink"
        }`}
      >
        {/* Ticket body */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-4 sm:p-5">
          <p className="font-semibold">
            {label}, valid {formatDuration(link.expiresIn)}
          </p>
          <p className="truncate font-mono text-sm" title={link.url}>
            {link.url}
          </p>
          <div className="flex flex-wrap gap-1.5 font-mono text-xs">
            <span className="max-w-full truncate rounded bg-ink/10 px-1.5 py-0.5">X-Amz-Expires={params.get("X-Amz-Expires")}</span>
            {signature && (
              <span className="max-w-full truncate rounded bg-ink/10 px-1.5 py-0.5" title={signature}>
                X-Amz-Signature={signature.slice(0, 10)}…
              </span>
            )}
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/15" aria-hidden="true">
            <div
              className="h-full bg-ink transition-[width] duration-300 ease-linear"
              style={{ width: `${fraction * 100}%` }}
            />
          </div>
        </div>

        {/* Perforation + stub */}
        <div className="relative flex w-28 shrink-0 flex-col items-center justify-center gap-0.5 border-l-2 border-dashed border-ink/30 px-2 sm:w-32">
          <span className="absolute -top-3 -left-3 size-6 rounded-full bg-paper" aria-hidden="true" />
          <span className="absolute -bottom-3 -left-3 size-6 rounded-full bg-paper" aria-hidden="true" />
          {expired ? (
            <span className="-rotate-6 rounded border-2 border-alert px-2 py-0.5 text-lg font-bold text-alert">
              Expired
            </span>
          ) : (
            <>
              <span className="font-mono text-3xl font-medium tabular-nums">{formatCountdown(secondsLeft)}</span>
              <span className="text-sm">left</span>
            </>
          )}
        </div>
      </div>

      {/* Announce only the state change, not every tick. */}
      <p className="sr-only" aria-live="polite">
        {expired ? `${label} has expired.` : ""}
      </p>

      <TicketActions link={link} expired={expired} onRenew={onRenew} renewing={renewing} />
    </div>
  );
}

function TicketActions({
  link,
  expired,
  onRenew,
  renewing,
}: {
  link: IssuedLink;
  expired: boolean;
  onRenew?: () => void;
  renewing?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const small =
    "inline-flex h-10 items-center rounded-md px-3.5 text-[0.9375rem] font-semibold transition-colors";

  if (expired) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[0.9375rem] text-steel">
          S3 checks the expiry on every request, so this exact link is now refused. Open it to
          see the error, or get a fresh link.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={link.url} target="_blank" rel="noreferrer" className={`${small} border-2 border-ink hover:bg-ink/5`}>
            Open expired link
          </a>
          {onRenew && (
            <button type="button" onClick={onRenew} disabled={renewing} className={`${small} bg-ink text-paper hover:bg-ink/90 disabled:opacity-60`}>
              {renewing ? "Getting a new link…" : "Get a new link"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={copy} className={`${small} border-2 border-ink hover:bg-ink/5`}>
        {copied ? "Copied" : "Copy link"}
      </button>
      <a href={link.url} target="_blank" rel="noreferrer" className={`${small} border-2 border-ink hover:bg-ink/5`}>
        Open in new tab
      </a>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 120) return `${seconds} seconds`;
  return `${Math.round(seconds / 60)} minutes`;
}
