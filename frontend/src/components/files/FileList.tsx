"use client";

import { CategoryIcon } from "@/components/files/CategoryIcon";
import { KeyPath, segmentsForKey } from "@/components/KeyPath";
import { formatBytes, formatFullDate, formatWhen } from "@/lib/format";
import type { StoredFile } from "@/types/api";

export interface FileActions {
  onPreview: (file: StoredFile) => void;
  onDownload: (file: StoredFile) => void;
  onShare: (file: StoredFile) => void;
  onVersions: (file: StoredFile) => void;
  onDelete: (file: StoredFile) => void;
}

interface FileListProps extends FileActions {
  files: StoredFile[];
  userId?: string;
  /** id of a file whose download link is being fetched */
  downloadingId?: string | null;
}

export function FileList({ files, userId, downloadingId, ...actions }: FileListProps) {
  return (
    <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-white" aria-label="Files">
      {files.map((file) => (
        <FileRow key={file.id} file={file} userId={userId} downloading={downloadingId === file.id} {...actions} />
      ))}
    </ul>
  );
}

function FileRow({
  file,
  userId,
  downloading,
  onPreview,
  onDownload,
  onShare,
  onVersions,
  onDelete,
}: FileActions & { file: StoredFile; userId?: string; downloading: boolean }) {
  const action =
    "inline-flex h-9 items-center rounded-md px-3 text-[0.9375rem] font-semibold transition-colors disabled:opacity-60";

  return (
    <li className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-md bg-paper text-ink">
          <CategoryIcon category={file.category} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <h3 className="min-w-0 truncate text-lg font-semibold" title={file.original_name}>
              {file.original_name}
            </h3>
            <p className="shrink-0 text-[0.9375rem] text-steel">
              <span className="font-semibold text-ink">{formatBytes(file.size_bytes)}</span>{" "}
              <time dateTime={file.updated_at} title={formatFullDate(file.updated_at)}>
                {formatWhen(file.updated_at)}
              </time>
            </p>
          </div>
          <KeyPath segments={segmentsForKey(file.s3_key, userId)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 sm:pl-[3.375rem]">
        <button type="button" onClick={() => onPreview(file)} className={`${action} bg-ink text-paper hover:bg-ink/90`}>
          Preview
        </button>
        <button
          type="button"
          onClick={() => onDownload(file)}
          disabled={downloading}
          className={`${action} text-ink hover:bg-ink/5`}
        >
          {downloading ? "Preparing…" : "Download"}
        </button>
        <button type="button" onClick={() => onShare(file)} className={`${action} text-ink hover:bg-ink/5`}>
          Share
        </button>
        <button type="button" onClick={() => onVersions(file)} className={`${action} text-ink hover:bg-ink/5`}>
          Versions
        </button>
        <button type="button" onClick={() => onDelete(file)} className={`${action} text-alert hover:bg-alert-soft`}>
          Delete
        </button>
      </div>
    </li>
  );
}
