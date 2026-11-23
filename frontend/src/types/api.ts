/** Shapes returned by the Flask API. Keep in sync with backend/app/schemas. */

export interface User {
  id: string;
  name: string;
  email: string;
  is_verified: boolean;
  created_at: string;
}

export interface UserResponse {
  user: User;
}

export interface MessageResponse {
  message: string;
}

export interface RegisterResponse extends MessageResponse {
  user: User;
}

/** Every API error has this shape: {"error": {"code", "message", "details"}} */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: {
      /** Field-level validation errors, e.g. {"password": ["Must be at least 8 characters."]} */
      fields?: Record<string, string[] | Record<string, string[]>>;
      [key: string]: unknown;
    };
  };
}

// --- Files ---

export type FileCategory = "video" | "audio" | "image" | "document" | "other";

export interface StoredFile {
  id: string;
  original_name: string;
  category: FileCategory;
  content_type: string;
  size_bytes: number;
  s3_key: string;
  created_at: string;
  updated_at: string;
}

export interface FileListResponse {
  files: StoredFile[];
}

export interface CategoryTotals {
  count: number;
  total_bytes: number;
}

export interface StatsResponse {
  categories: Record<FileCategory, CategoryTotals>;
  total: CategoryTotals;
}

export interface UploadConfig {
  max_upload_mb: number;
  categories: Record<FileCategory, { folder: string; extensions: string[] }>;
}

/** Presigned POST: `url` + `fields` are exactly what the browser sends to S3. */
export interface UploadTicket {
  url: string;
  fields: Record<string, string>;
  key: string;
  category: FileCategory;
  content_type: string;
  max_bytes: number;
  expires_in: number;
}

export interface ConfirmResponse {
  file: StoredFile;
  is_new_version: boolean;
}

export interface SignedUrl {
  url: string;
  expires_in: number;
  expires_at: string;
}

export interface DirectUrlResponse {
  url: string;
  note: string;
}

export interface FileVersion {
  version_id: string;
  is_latest: boolean;
  size: number;
  last_modified: string;
}

export interface VersionsResponse {
  versions: FileVersion[];
}

export interface RestoreResponse {
  file: StoredFile;
  restored_version_id: string;
  new_version_id: string;
}
