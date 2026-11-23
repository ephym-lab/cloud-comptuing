"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { authApi } from "@/lib/auth-api";
import { useAsyncAction } from "@/lib/use-async-action";

/** Button that re-sends the verification email for a known address. */
export function ResendVerification({ email }: { email: string }) {
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const { run, pending, error } = useAsyncAction(authApi.resendVerification);

  async function resend() {
    const result = await run(email);
    if (result) setSentMessage(result.message);
  }

  return (
    <div className="flex flex-col gap-3">
      {sentMessage && <Notice tone="success">{sentMessage}</Notice>}
      {error && <Notice tone="error">{error.message}</Notice>}
      <Button variant="secondary" onClick={resend} pending={pending} pendingLabel="Sending…">
        Resend verification email
      </Button>
    </div>
  );
}
