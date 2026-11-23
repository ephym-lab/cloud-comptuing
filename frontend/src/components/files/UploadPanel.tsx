"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";

import { KeyPath, segmentsForKey } from "@/components/KeyPath";
import { ApiError } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { precheckFile, uploadFile } from "@/lib/upload";
import type { ConfirmResponse, UploadConfig } from "@/types/api";

type Status = "queued" | "signing" | "uploading" | "confirming" | "done" | "error";

interface QueueItem {
  id: string;
  file: File;
  status: Status;
  progress: number;
  /** Predicted until Flask returns the exact key. */
  key: string;
  message?: string;
}

/** Lets the dashboard hand over files dropped anywhere on the page. */
export interface UploadPanelHandle {
  addFiles: (files: FileList | File[]) => void;
}

interface UploadPanelProps {
  config: UploadConfig | null;
  userId?: string;
  onUploaded: (result: ConfirmResponse) => void;
  ref?: Ref<UploadPanelHandle>;
}

export function UploadPanel({ config, userId, onUploaded, ref }: UploadPanelProps) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const inputId = useId();
  const hintId = useId();
  const active = useRef(false);

  const update = (id: string, patch: Partial<QueueItem>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  function addFiles(files: FileList | File[]) {
    if (!config) return;
    const added = Array.from(files).map((file): QueueItem => {
      const check = precheckFile(file, config);
      const id = crypto.randomUUID();
      if (!check.ok) return { id, file, status: "error", progress: 0, key: "", message: check.reason };
      return { id, file, status: "queued", progress: 0, key: `users/${userId ?? "…"}/${check.folder}/${file.name}` };
    });
    setItems((current) => [...current, ...added]);
  }

  useImperativeHandle(ref, () => ({ addFiles }));

  // Upload one file at a time, in the order they were added, so progress is easy to follow.
  useEffect(() => {
    if (active.current) return;
    const next = items.find((item) => item.status === "queued");
    if (!next) return;
    active.current = true;

    uploadFile(next.file, {
      onPhase: (phase, ticket) => update(next.id, { status: phase, ...(ticket && { key: ticket.key }) }),
      onProgress: (fraction) => update(next.id, { progress: fraction }),
    })
      .then((result) => {
        update(next.id, {
          status: "done",
          progress: 1,
          message: result.is_new_version ? "Uploaded as a new version" : "Uploaded",
        });
        onUploaded(result);
      })
      .catch((err: unknown) => {
        update(next.id, {
          status: "error",
          message: err instanceof ApiError ? err.message : "Upload failed. Try again.",
        });
      })
      .finally(() => {
        active.current = false;
        setItems((current) => [...current]); // nudge the effect to pick up the next file
      });
  }, [items, onUploaded]);

  const accept = config
    ? Object.values(config.categories)
        .flatMap((c) => c.extensions)
        .map((ext) => `.${ext}`)
        .join(",")
    : undefined;
  const finished = items.some((item) => item.status === "done" || item.status === "error");

  return (
    <section aria-labelledby={`${inputId}-title`} className="flex flex-col gap-4">
      <h2 id={`${inputId}-title`} className="text-xl font-semibold">
        Upload
      </h2>

      {/* Drops are handled page-wide by the dashboard (see FileDropOverlay). */}
      <div className="flex flex-col items-start gap-3 rounded-lg border-2 border-dashed border-steel/50 bg-white/60 p-5">
        <p className="text-lg font-semibold">Drop files anywhere on this page</p>
        <label
          htmlFor={inputId}
          className="inline-flex h-11 cursor-pointer items-center rounded-md bg-ink px-4 font-semibold text-paper hover:bg-ink/90 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
        >
          Choose files
          <input
            id={inputId}
            type="file"
            multiple
            accept={accept}
            disabled={!config}
            aria-describedby={hintId}
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <p id={hintId} className="text-[0.9375rem] text-steel">
          {config
            ? `Up to ${config.max_upload_mb} MB each. Video, audio, images, documents and zip.`
            : "Loading upload settings…"}
        </p>
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-2" aria-label="Uploads">
            {items.map((item) => (
              <QueueRow key={item.id} item={item} userId={userId} />
            ))}
          </ul>
          {finished && (
            <button
              type="button"
              onClick={() => setItems((current) => current.filter((i) => i.status !== "done" && i.status !== "error"))}
              className="self-start text-[0.9375rem] text-steel underline underline-offset-4 hover:text-ink"
            >
              Clear finished
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const STATUS_TEXT: Record<Status, (item: QueueItem) => string> = {
  queued: () => "Waiting",
  signing: () => "Getting upload permission…",
  uploading: (item) => `Uploading to S3, ${Math.round(item.progress * 100)}%`,
  confirming: () => "Saving…",
  done: (item) => item.message ?? "Uploaded",
  error: (item) => item.message ?? "Failed",
};

function QueueRow({ item, userId }: { item: QueueItem; userId?: string }) {
  const failed = item.status === "error";
  const done = item.status === "done";

  return (
    <li className={`flex flex-col gap-2 rounded-md border bg-white p-3 ${failed ? "border-alert" : "border-line"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-semibold" title={item.file.name}>
          {item.file.name}
        </span>
        <span className="shrink-0 text-sm text-steel">{formatBytes(item.file.size)}</span>
      </div>
      {item.key && <KeyPath segments={segmentsForKey(item.key, userId)} />}
      {!failed && !done && (
        <div
          role="progressbar"
          aria-label={`Upload progress for ${item.file.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(item.progress * 100)}
          className="h-2 overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full bg-ink transition-[width] duration-200"
            style={{ width: `${item.progress * 100}%` }}
          />
        </div>
      )}
      <p className={`text-sm ${failed ? "text-alert" : done ? "text-ok" : "text-steel"}`} aria-live="polite">
        {STATUS_TEXT[item.status](item)}
      </p>
    </li>
  );
}
