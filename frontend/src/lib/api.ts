/**
 * Typed fetch wrapper for the Flask API (reached through the /api/* rewrite).
 *
 * - Sends cookies (`credentials: "include"`): the JWTs live in httpOnly cookies.
 * - Adds the CSRF header on mutating requests (double-submit: the value comes from
 *   the readable `csrf_access_token` cookie; Flask compares it with the JWT).
 * - On 401, refreshes the session once and retries; if that fails, goes to /login.
 * - Turns error responses into `ApiError` with the backend's code/message/details.
 */

import type { ApiErrorBody } from "@/types/api";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const REFRESH_PATH = "/api/auth/refresh";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorBody["error"]["details"] = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** First message per field, ready to show under each input. */
  fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [field, messages] of Object.entries(this.details.fields ?? {})) {
      if (Array.isArray(messages) && messages.length > 0) result[field] = messages[0];
    }
    return result;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /**
   * When true (default), a 401 triggers one refresh + retry, then a redirect to /login.
   * Auth forms set it to false: a 401 from /login means "wrong password", not "session expired".
   */
  handleAuth?: boolean;
}

export function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const prefix = `${name}=`;
  const match = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : undefined;
}

async function send(path: string, options: RequestOptions, csrfCookie: string) {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (MUTATING_METHODS.has(method)) {
    const csrf = readCookie(csrfCookie);
    if (csrf) headers["X-CSRF-TOKEN"] = csrf;
  }

  try {
    return await fetch(path, {
      method,
      headers,
      credentials: "include",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "network_error", "Can't reach the server. Check that it's running.");
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  if (body?.error) {
    return new ApiError(response.status, body.error.code, body.error.message, body.error.details);
  }
  const message =
    response.status >= 500
      ? "The server had a problem. Try again in a moment."
      : `Request failed (${response.status}).`;
  return new ApiError(response.status, "http_error", message);
}

// Several requests may hit 401 at once; they share a single refresh call.
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= send(REFRESH_PATH, { method: "POST" }, "csrf_refresh_token")
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function endSessionAndGoToLogin(): Promise<void> {
  // Clear stale cookies so the route guard doesn't think we're still logged in.
  await send("/api/auth/logout", { method: "POST" }, "csrf_access_token").catch(() => undefined);
  const next = window.location.pathname + window.location.search;
  // A full page load on purpose: this module lives outside React (no router here), and
  // it also wipes any in-memory state that belonged to the expired session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const handleAuth = options.handleAuth ?? true;
  let response = await send(path, options, "csrf_access_token");

  if (response.status === 401 && handleAuth) {
    if (await refreshSession()) {
      response = await send(path, options, "csrf_access_token");
    }
    if (response.status === 401) {
      const error = await toApiError(response);
      await endSessionAndGoToLogin();
      throw error;
    }
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
};
