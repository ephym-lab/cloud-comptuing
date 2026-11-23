"use client";

import { useCallback, useState } from "react";

import { ApiError } from "@/lib/api";

/**
 * Wraps an async call with `pending` and `error` state for forms and buttons.
 * Non-API failures are normalised into an ApiError so the UI has one error type.
 */
export function useAsyncAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const run = useCallback(
    async (...args: Args): Promise<Result | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await action(...args);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err
            : new ApiError(0, "unexpected_error", "Something went wrong. Try again."),
        );
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending, error, clearError: () => setError(null) };
}
