"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AuthHeading } from "@/components/auth/AuthHeading";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { authApi } from "@/lib/auth-api";
import { useAsyncAction } from "@/lib/use-async-action";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const { run, pending, error } = useAsyncAction(authApi.forgotPassword);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await run(email);
    if (result) setSent(result.message);
  }

  return (
    <>
      <AuthHeading title="Reset your password">
        Enter your account email and we&apos;ll send a reset link. It expires in 30 minutes.
      </AuthHeading>

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
          Send reset link
        </Button>
      </form>

      <p className="mt-8 text-steel">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
          Log in
        </Link>
      </p>
    </>
  );
}
