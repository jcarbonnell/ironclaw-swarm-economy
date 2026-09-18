"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ResearcherSession } from "@/types";

// ── Session context ─────────────────────────────────────────────────────────────
// v0.1: single researcher, no auth. The abstraction is in place for v1.0 roles.
// RESEARCHER_ID is read from the API (server-side env), never NEXT_PUBLIC_.

interface SessionContextValue {
  session: ResearcherSession | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  isLoading: true,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ResearcherSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch researcher identity from the server — never from NEXT_PUBLIC_
    fetch("/api/session")
      .then((r) => r.json())
      .then((s: ResearcherSession) => {
        setSession(s);
        setIsLoading(false);
      })
      .catch(() => {
        // Fallback — dashboard still works without a researcher ID
        setSession({ researcherId: "researcher", startedAt: new Date().toISOString() });
        setIsLoading(false);
      });

    // Global 401 interceptor — clean handling for future auth layers
    const handle401 = () => {
      console.warn("[fleet] 401 intercepted — session may have expired");
      // In v1.0 with real auth: trigger re-auth flow here
      // In v0.1: no-op (no auth to expire)
    };
    window.addEventListener("fleet:unauthorized", handle401);
    return () => window.removeEventListener("fleet:unauthorized", handle401);
  }, []);

  return (
    <SessionContext.Provider value={{ session, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}