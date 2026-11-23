"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AuthHeading } from "@/components/auth/AuthHeading";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { authApi } from "@/lib/auth-api";
import { useAsyncAction } from "@/lib/use-async-action";

export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const { run, pending, error } = useAsyncAction(authApi.register);
  const fieldErrors = error?.fieldErrors() ?? {};

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await run(name, email, password);
    if (result) setRegisteredEmail(result.user.email);
  }

  if (registeredEmail) {
    return (
      <>
        <AuthHeading title="Check your email">
          We sent a verification link to <strong className="text-ink">{registeredEmail}</strong>.
          It expires in 24 hours.
        </AuthHeading>
        <div className="flex flex-col gap-3">
          <ResendVerification email={registeredEmail} />
          <ButtonLink href="/login" variant="quiet" className="self-start">
            Back to log in
          </ButtonLink>
        </div>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Create an account">
        You&apos;ll verify your email before your first upload.
      </AuthHeading>

      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {error && !error.details.fields && <Notice tone="error">{error.message}</Notice>}

        <TextField
          label="Name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email === "taken" ? "An account with this email already exists." : fieldErrors.email}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters, with a letter and a number."
          error={fieldErrors.password}
        />

        <Button type="submit" pending={pending} pendingLabel="Creating account…">
          Create account
        </Button>
      </form>

      <p className="mt-8 text-steel">
        Already registered?{" "}
        <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
          Log in
        </Link>
      </p>
    </>
  );
}
