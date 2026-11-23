"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AuthHeading } from "@/components/auth/AuthHeading";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { ApiError } from "@/lib/api";
import { authApi } from "@/lib/auth-api";
import { useAsyncAction } from "@/lib/use-async-action";

type Status = "verifying" | "verified" | "failed";

export function VerifyEmail() {
  const token = useSearchParams().get("token");
  const [status, setStatus] = useState<Status>(token ? "verifying" : "failed");
  const [failure, setFailure] = useState("This link is missing its token.");
  // Tokens are single use. React dev mode runs effects twice, so guard the call.
  const requested = useRef(false);

  useEffect(() => {
    if (!token || requested.current) return;
    requested.current = true;
    authApi
      .verifyEmail(token)
      .then(() => setStatus("verified"))
      .catch((err: unknown) => {
        setFailure(err instanceof ApiError ? err.message : "Verification failed. Try again.");
        setStatus("failed");
      });
  }, [token]);

  if (status === "verifying") {
    return (
      <div role="status">
        <AuthHeading title="Verifying your email…">This takes a second.</AuthHeading>
      </div>
    );
  }

  if (status === "verified") {
    return (
      <>
        <AuthHeading title="Email verified">Your account is ready. Log in to start uploading.</AuthHeading>
        <ButtonLink href="/login" className="w-full">
          Log in
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="This link didn't work">{failure}</AuthHeading>
      <RequestNewLink />
    </>
  );
}

function RequestNewLink() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const { run, pending, error } = useAsyncAction(authApi.resendVerification);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await run(email);
    if (result) setSent(result.message);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {sent && <Notice tone="success">{sent}</Notice>}
      {error && !error.details.fields && <Notice tone="error">{error.message}</Notice>}
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error?.fieldErrors().email}
      />
      <Button type="submit" pending={pending} pendingLabel="Sending…">
        Send a new link
      </Button>
    </form>
  );
}
