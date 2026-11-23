"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { authApi } from "@/lib/auth-api";
import type { User } from "@/types/api";

type Session = { status: "loading" } | { status: "ready"; user: User };

const SessionContext = createContext<Session>({ status: "loading" });

/**
 * Loads the logged-in user once for every signed-in page. If the session has expired,
 * the API client refreshes it or sends the browser to /login, so no error state here.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading" });

  useEffect(() => {
    let active = true;
    authApi
      .me()
      .then(({ user }) => active && setSession({ status: "ready", user }))
      .catch(() => undefined); // 401s redirect to /login inside the API client
    return () => {
      active = false;
    };
  }, []);

  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): Session {
  return useContext(SessionContext);
}
