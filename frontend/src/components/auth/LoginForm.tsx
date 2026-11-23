"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthHeading } from "@/components/auth/AuthHeading";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { authApi } from "@/lib/auth-api";
import { safeNextPath } from "@/lib/safe-next";
import { useAsyncAction } from "@/lib/use-async-action";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { run, pending, error } = useAsyncAction(authApi.login);
  const fieldErrors = error?.fieldErrors() ?? {};

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await run(email, password)) {
      router.replace(safeNextPath(searchParams.get("next")));
    }
  }

  return (
    <>
      <AuthHeading title="Log in">Use the email and password you registered with.</AuthHeading>

      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {error?.code === "email_not_verified" ? (
          <div className="flex flex-col gap-3">
            <Notice tone="error">
              Verify your email before logging in. Check your inbox for the link we sent.
            </Notice>
            <ResendVerification email={email} />
          </div>
        ) : (
          error && !error.details.fields && <Notice tone="error">{error.message}</Notice>
        )}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <Link href="/forgot-password" className="-mt-2 self-start text-[0.9375rem] text-steel underline underline-offset-4 hover:text-ink">
          Forgot your password?
        </Link>

        <Button type="submit" pending={pending} pendingLabel="Logging in…">
          Log in
        </Button>
      </form>

      <p className="mt-8 text-steel">
        New here?{" "}
        <Link href="/register" className="font-semibold text-ink underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  );
}
