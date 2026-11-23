"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthHeading } from "@/components/auth/AuthHeading";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { authApi } from "@/lib/auth-api";
import { useAsyncAction } from "@/lib/use-async-action";

export function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [done, setDone] = useState(false);
  const { run, pending, error } = useAsyncAction(authApi.resetPassword);
  const fieldErrors = error?.fieldErrors() ?? {};

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const passwordsMatch = password === confirmation;
    setMismatch(!passwordsMatch);
    if (!passwordsMatch || !token) return;
    if (await run(token, password)) setDone(true);
  }

  if (!token) {
    return (
      <>
        <AuthHeading title="This link didn't work">
          It&apos;s missing its reset token. Request a new link and use the newest email.
        </AuthHeading>
        <ButtonLink href="/forgot-password" className="w-full">
          Request a new link
        </ButtonLink>
      </>
    );
  }

  if (done) {
    return (
      <>
        <AuthHeading title="Password updated">Log in with your new password.</AuthHeading>
        <ButtonLink href="/login" className="w-full">
          Log in
        </ButtonLink>
      </>
    );
  }

  const linkExpired = error?.code === "invalid_token";

  return (
    <>
      <AuthHeading title="Choose a new password">
        You&apos;ll use it the next time you log in.
      </AuthHeading>

      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {linkExpired && (
          <Notice tone="error">
            {error.message}{" "}
            <Link href="/forgot-password" className="font-semibold underline underline-offset-4">
              Request a new link
            </Link>
          </Notice>
        )}
        {error && !linkExpired && !error.details.fields && (
          <Notice tone="error">{error.message}</Notice>
        )}

        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters, with a letter and a number."
          error={fieldErrors.new_password}
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          error={mismatch ? "The passwords don't match." : undefined}
        />
        <Button type="submit" pending={pending} pendingLabel="Updating…">
          Update password
        </Button>
      </form>
    </>
  );
}
