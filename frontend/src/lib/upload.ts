/**
 * Direct browser → S3 upload, in three steps:
 *
 *   1. Ask Flask for a presigned POST (Flask checks type/size and picks the key).
 *   2. POST the file straight to S3. The bytes never pass through our servers.
 *      XMLHttpRequest is used (not fetch) because it reports upload progress.
 *   3. Tell Flask it's done; Flask checks S3 really has it and saves the metadata.
 */

import { ApiError } from "@/lib/api";
import { extensionOf } from "@/lib/format";
import { filesApi } from "@/lib/files-api";
import type { ConfirmResponse, FileCategory, UploadConfig, UploadTicket } from "@/types/api";

export type UploadPhase = "signing" | "uploading" | "confirming";

export interface UploadCallbacks {
  onPhase?: (phase: UploadPhase, ticket?: UploadTicket) => void;
  /** 0–1 */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export async function uploadFile(file: File, callbacks: UploadCallbacks = {}): Promise<ConfirmResponse> {
  callbacks.onPhase?.("signing");
  const ticket = await filesApi.requestUpload(file);

  callbacks.onPhase?.("uploading", ticket);
  await postToS3(ticket, file, callbacks);

  callbacks.onPhase?.("confirming", ticket);
  return filesApi.confirmUpload(ticket.key);
}

function postToS3(ticket: UploadTicket, file: File, { onProgress, signal }: UploadCallbacks) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    // The signed fields first; S3 requires the file to be the last field.
    for (const [name, value] of Object.entries(ticket.fields)) form.append(name, value);
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", ticket.url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(s3Error(xhr.status, xhr.responseText));
      }
    };
    xhr.onerror = () =>
      reject(
        new ApiError(0, "s3_unreachable", "Couldn't reach S3. Check the bucket's CORS settings."),
      );
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** S3 answers with XML like <Error><Code>…</Code><Message>…</Message></Error>. */
function s3Error(status: number, body: string): ApiError {
  const doc = new DOMParser().parseFromString(body, "application/xml");
  const code = doc.querySelector("Code")?.textContent ?? "s3_error";
  const message = doc.querySelector("Message")?.textContent ?? `S3 rejected the upload (${status}).`;
  return new ApiError(status, code, `S3 rejected the upload: ${message}`);
}

/**
 * Quick check in the browser so obviously wrong files fail instantly. The backend
 * repeats every check: this is for speed, not security.
 */
export function precheckFile(
  file: File,
  config: UploadConfig,
): { ok: true; category: FileCategory; folder: string } | { ok: false; reason: string } {
  const ext = extensionOf(file.name);
  const entry = Object.entries(config.categories).find(([, c]) => c.extensions.includes(ext));
  if (!entry) {
    return { ok: false, reason: ext ? `.${ext} files aren't allowed.` : "Files need an extension." };
  }
  if (file.size === 0) return { ok: false, reason: "The file is empty." };
  if (file.size > config.max_upload_mb * 1024 * 1024) {
    return { ok: false, reason: `Larger than the ${config.max_upload_mb} MB limit.` };
  }
  const [category, { folder }] = entry as [FileCategory, { folder: string }];
  return { ok: true, category, folder };
}
