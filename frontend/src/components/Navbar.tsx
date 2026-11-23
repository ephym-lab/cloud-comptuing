"use client";

import { useRouter } from "next/navigation";

import { useSession } from "@/components/SessionProvider";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/Wordmark";
import { authApi } from "@/lib/auth-api";
import { useAsyncAction } from "@/lib/use-async-action";

export function Navbar() {
  const router = useRouter();
  const session = useSession();
  const { run, pending } = useAsyncAction(authApi.logout);

  async function logOut() {
    await run();
    router.replace("/login");
  }

  return (
    <header className="border-b border-line bg-white">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-5">
          {session.status === "ready" ? (
            <span className="hidden text-steel sm:inline">
              Signed in as <span className="font-semibold text-ink">{session.user.name}</span>
            </span>
          ) : (
            <span className="hidden h-4 w-40 animate-pulse rounded bg-line sm:inline-block" aria-hidden="true" />
          )}
          <Button variant="secondary" className="h-10 px-4" onClick={logOut} pending={pending} pendingLabel="Logging out…">
            Log out
          </Button>
        </div>
      </nav>
    </header>
  );
}
