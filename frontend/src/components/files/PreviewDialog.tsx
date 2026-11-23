"use client";

import { useCallback, useEffect, useState } from "react";

import { KeyPath, segmentsForKey } from "@/components/KeyPath";
import { issueLink, LinkTicket, type IssuedLink } from "@/components/files/LinkTicket";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";
import { ApiError } from "@/lib/api";
import { filesApi } from "@/lib/files-api";
import { formatBytes } from "@/lib/format";
import type { StoredFile } from "@/types/api";

interface PreviewDialogProps {
  file: StoredFile | null;
  userId?: string;
  onClose: () => void;
  onDownload: (file: StoredFile) => void;
}

export function PreviewDialog({ file, userId, onClose, onDownload }: PreviewDialogProps) {
  return (
    <Dialog
      open={file !== null}
      onClose={onClose}
      title={file?.original_name ?? ""}
      description={file && `${formatBytes(file.size_bytes)}, ${file.content_type}`}
      size="lg"
    >
      {/* Keyed by id so state resets when another file is opened. */}
      {file && <PreviewBody key={file.id} file={file} userId={userId} onDownload={onDownload} />}
    </Dialog>
  );
}

function PreviewBody({
  file,
  userId,
  onDownload,
}: {
  file: StoredFile;
  userId?: string;
  onDownload: (file: StoredFile) => void;
}) {
  const [link, setLink] = useState<IssuedLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Returns a promise whose handlers set state only after the request settles.
  const loadLink = useCallback(
    () =>
      filesApi
        .previewUrl(file.id)
        .then((signed) => {
          setLink(issueLink(signed));
          setError(null);
        })
        .catch((err: unknown) =>
          setError(err instanceof ApiError ? err.message : "Couldn't create a preview link."),
        )
        .finally(() => setLoading(false)),
    [file.id],
  );

  useEffect(() => {
    void loadLink();
  }, [loadLink]);

  function renewLink() {
    setLoading(true);
    void loadLink();
  }

  return (
    <div className="flex flex-col gap-5">
      <KeyPath segments={segmentsForKey(file.s3_key, userId)} />

      {error && <Notice tone="error">{error}</Notice>}

      {link ? (
        <>
          <Media file={file} url={link.url} onDownload={() => onDownload(file)} />
          <LinkTicket link={link} label="Preview link" onRenew={renewLink} renewing={loading} />
        </>
      ) : (
        !error && <div className="aspect-video animate-pulse rounded-md bg-line/70" aria-label="Loading preview" />
      )}

      <DirectLinkCheck fileId={file.id} />
    </div>
  );
}

function Media({ file, url, onDownload }: { file: StoredFile; url: string; onDownload: () => void }) {
  switch (file.category) {
    case "video":
      // The browser streams with HTTP range requests straight from S3, so scrubbing works.
      return <video src={url} controls className="max-h-[45vh] w-full rounded-md bg-ink" />;
    case "audio":
      return <audio src={url} controls className="w-full" />;
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element -- a presigned S3 URL, not a static asset
        <img src={url} alt={file.original_name} className="max-h-[45vh] w-full rounded-md bg-white object-contain" />
      );
    default:
      if (file.content_type === "application/pdf") {
        return (
          <div className="flex flex-col items-start gap-3 rounded-md border border-line bg-white p-5">
            <p>PDFs open in their own tab, using the signed link below.</p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center rounded-md bg-ink px-4 font-semibold text-paper hover:bg-ink/90"
            >
              Open PDF in new tab
            </a>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-start gap-3 rounded-md border border-line bg-white p-5">
          <p>There&apos;s no preview for this file type. Download it to open it.</p>
          <Button variant="secondary" onClick={onDownload}>
            Download
          </Button>
        </div>
      );
  }
}

/** The demo's "private bucket" moment: the same object, without a signature. */
function DirectLinkCheck({ fileId }: { fileId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    filesApi
      .directUrl(fileId)
      .then((res) => active && setUrl(res.url))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [fileId]);

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <p className="text-[0.9375rem] text-steel">
        The plain object URL has no signature. The bucket is private, so S3 answers{" "}
        <span className="font-semibold text-ink">Access Denied</span>.
      </p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border-2 border-alert px-3.5 text-[0.9375rem] font-semibold text-alert hover:bg-alert-soft"
        >
          Try direct link
        </a>
      ) : (
        <span className="h-10 w-32 shrink-0 animate-pulse rounded-md bg-line/70" aria-hidden="true" />
      )}
    </div>
  );
}
