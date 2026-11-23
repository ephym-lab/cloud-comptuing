"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional line under the title. */
  description?: ReactNode;
  children: ReactNode;
  size?: "md" | "lg";
}

/**
 * Modal built on the native <dialog>: focus trapping, Esc to close and the backdrop
 * come from the browser. Clicking the backdrop also closes it.
 */
export function Dialog({ open, onClose, title, description, children, size = "md" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] rounded-lg bg-paper p-0 text-ink shadow-[0_24px_60px_-20px_rgb(20_33_61/0.45)] backdrop:bg-ink/60 ${
        size === "lg" ? "max-w-3xl" : "max-w-lg"
      }`}
    >
      {open && (
        <div className="flex flex-col gap-5 p-5 sm:p-7">
          <header className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id={titleId} className="text-2xl font-bold break-words">
                {title}
              </h2>
              {description && <div className="text-steel">{description}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-md text-steel hover:bg-ink/5 hover:text-ink"
              aria-label="Close"
            >
              <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
