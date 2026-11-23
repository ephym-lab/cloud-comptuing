"use client";

import { useCallback, useEffect, useState } from "react";

import { KeyPath, segmentsForKey } from "@/components/KeyPath";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";
import { ApiError } from "@/lib/api";
import { filesApi } from "@/lib/files-api";
import { formatBytes, formatFullDate, formatWhen } from "@/lib/format";
import type { FileVersion, StoredFile } from "@/types/api";

interface VersionsDialogProps {
  file: StoredFile | null;
  userId?: string;
  onClose: () => void;
  /** Called after a restore so the file list and totals refresh. */
  onRestored: () => void;
}

export function VersionsDialog({ file, userId, onClose, onRestored }: VersionsDialogProps) {
  return (
    <Dialog
      open={file !== null}
      onClose={onClose}
      title={file ? `Versions of ${file.original_name}` : ""}
      description="S3 keeps every upload to this key. Restoring copies an old version on top, so nothing is lost."
      size="lg"
    >
      {file && <VersionsBody key={file.id} file={file} userId={userId} onRestored={onRestored} />}
    </Dialog>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; versions: FileVersion[] }
  | { status: "error"; message: string };

function VersionsBody({ file, userId, onRestored }: { file: StoredFile; userId?: string; onRestored: () => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  // Handlers set state only after the request settles, so this is safe to start from an effect.
  const load = useCallback(
    () =>
      filesApi
        .versions(file.id)
        .then(({ versions }) => setState({ status: "ready", versions }))
        .catch((err: unknown) =>
          setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load versions." }),
        ),
    [file.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(version: FileVersion, number: number) {
    setRestoringId(version.version_id);
    setResult(null);
    try {
      await filesApi.restoreVersion(file.id, version.version_id);
      setResult({
        tone: "success",
        text: `Version ${number} is now the latest copy. The version it replaced is still in the list.`,
      });
      await load();
      onRestored();
    } catch (err) {
      setResult({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't restore that version." });
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <KeyPath segments={segmentsForKey(file.s3_key, userId)} />
      {result && <Notice tone={result.tone}>{result.text}</Notice>}

      {state.status === "loading" && (
        <div className="flex flex-col gap-2" aria-label="Loading versions">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-md bg-line/60" />
          ))}
        </div>
      )}
      {state.status === "error" && <Notice tone="error">{state.message}</Notice>}
      {state.status === "ready" && (
        <VersionTimeline versions={state.versions} restoringId={restoringId} onRestore={restore} />
      )}
    </div>
  );
}

function VersionTimeline({
  versions,
  restoringId,
  onRestore,
}: {
  versions: FileVersion[];
  restoringId: string | null;
  onRestore: (version: FileVersion, number: number) => void;
}) {
  if (versions.length === 0) {
    return <p className="text-steel">S3 has no versions for this key.</p>;
  }

  return (
    <ol className="flex flex-col" aria-label="Versions, newest first">
      {versions.map((version, index) => {
        // Newest first, so the oldest upload is version 1.
        const number = versions.length - index;
        const isLast = index === versions.length - 1;
        return (
          <li key={version.version_id} className="relative flex gap-4 pb-5 last:pb-0">
            {/* Timeline rail */}
            {!isLast && <span className="absolute top-6 bottom-0 left-[0.6875rem] w-0.5 bg-line" aria-hidden="true" />}
            <span
              className={`relative mt-1.5 size-6 shrink-0 rounded-full border-[3px] ${
                version.is_latest ? "border-ink bg-ink" : "border-steel/60 bg-paper"
              }`}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-md border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  Version {number}
                  {version.is_latest && (
                    <span className="rounded bg-ink px-1.5 py-0.5 text-sm font-semibold text-paper">Latest</span>
                  )}
                </p>
                <p className="text-[0.9375rem] text-steel">
                  <span className="font-semibold text-ink">{formatBytes(version.size)}</span>{" "}
                  <time dateTime={version.last_modified} title={formatFullDate(version.last_modified)}>
                    {formatWhen(version.last_modified)}
                  </time>
                </p>
                <p className="truncate font-mono text-xs text-steel" title={version.version_id}>
                  VersionId {version.version_id}
                </p>
              </div>
              {!version.is_latest && (
                <button
                  type="button"
                  onClick={() => onRestore(version, number)}
                  disabled={restoringId !== null}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border-2 border-ink px-3.5 text-[0.9375rem] font-semibold hover:bg-ink/5 disabled:opacity-60"
                >
                  {restoringId === version.version_id ? "Restoring…" : "Restore this version"}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
