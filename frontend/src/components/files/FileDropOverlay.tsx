"use client";

import { useEffect, useState } from "react";

const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

/**
 * Lets people drop files anywhere on the page. While files are dragged over the
 * window, a full-page target appears; dropping hands the files to `onFiles`.
 * Without this, a drop that misses the upload box would make the browser open the file.
 */
export function FileDropOverlay({ onFiles, prefix }: { onFiles: (files: FileList) => void; prefix: string }) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    // dragenter/dragleave fire for every child element crossed, so count the depth.
    let depth = 0;

    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      if (event.dataTransfer?.files.length) onFiles(event.dataTransfer.files);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFiles]);

  if (!dragging) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-ink/85 p-6 text-paper"
    >
      <div className="flex w-full max-w-2xl flex-col items-center gap-4 rounded-xl border-4 border-dashed border-paper/60 px-6 py-16 text-center">
        <p className="text-4xl font-bold">Drop to upload</p>
        <p className="text-lg text-paper/80">
          Files go straight to S3 under <span className="font-mono text-paper">{prefix}</span>
        </p>
      </div>
    </div>
  );
}
