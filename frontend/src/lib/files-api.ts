/** One function per file endpoint. Components never build these URLs themselves. */

import { api } from "@/lib/api";
import type {
  ConfirmResponse,
  DirectUrlResponse,
  FileCategory,
  FileListResponse,
  RestoreResponse,
  SignedUrl,
  StatsResponse,
  UploadConfig,
  UploadTicket,
  VersionsResponse,
} from "@/types/api";

export const filesApi = {
  uploadConfig: () => api.get<UploadConfig>("/api/files/upload-config"),

  list: (category?: FileCategory) =>
    api.get<FileListResponse>(category ? `/api/files?category=${category}` : "/api/files"),

  stats: () => api.get<StatsResponse>("/api/files/stats"),

  requestUpload: (file: File) =>
    api.post<UploadTicket>("/api/files/upload-url", {
      filename: file.name,
      content_type: file.type,
      size: file.size,
    }),

  confirmUpload: (key: string) => api.post<ConfirmResponse>("/api/files/confirm", { key }),

  previewUrl: (id: string) => api.get<SignedUrl>(`/api/files/${id}/preview`),

  downloadUrl: (id: string) => api.get<SignedUrl>(`/api/files/${id}/download`),

  shareUrl: (id: string, minutes: number) =>
    api.get<SignedUrl>(`/api/files/${id}/share?minutes=${minutes}`),

  directUrl: (id: string) => api.get<DirectUrlResponse>(`/api/files/${id}/direct-url`),

  versions: (id: string) => api.get<VersionsResponse>(`/api/files/${id}/versions`),

  /** Copies an old version on top of the key, so it becomes the newest one. */
  restoreVersion: (id: string, versionId: string) =>
    api.post<RestoreResponse>(
      `/api/files/${id}/versions/${encodeURIComponent(versionId)}/restore`,
    ),

  remove: (id: string) => api.delete<void>(`/api/files/${id}`),
};
