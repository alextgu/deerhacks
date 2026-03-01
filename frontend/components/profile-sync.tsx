"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";

const MAX_SYNC_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;

/**
 * Invisible component: ensures Supabase profile exists after login.
 * Profile is already synced server-side in Auth0 beforeSessionSaved; this
 * retries POST /api/auth/sync in case the client loads before callback completes.
 */
export function ProfileSync() {
  const { user } = useUser();
  const synced = useRef(false);
  const attempts = useRef(0);

  useEffect(() => {
    if (!user || synced.current || attempts.current >= MAX_SYNC_ATTEMPTS) return;

    const doSync = () => {
      attempts.current += 1;
      fetch("/api/auth/sync", {
        method: "POST",
        credentials: "same-origin",
      })
        .then((res) => {
          if (res.ok) {
            synced.current = true;
            return;
          }
          if (process.env.NODE_ENV === "development") {
            res.json().then((b) => console.warn("[ProfileSync]", res.status, b));
          }
          if (attempts.current < MAX_SYNC_ATTEMPTS && res.status === 401) {
            setTimeout(doSync, RETRY_DELAY_MS);
          }
        })
        .catch((err) => {
          if (process.env.NODE_ENV === "development") {
            console.warn("[ProfileSync] request failed", err);
          }
          if (attempts.current < MAX_SYNC_ATTEMPTS) {
            setTimeout(doSync, RETRY_DELAY_MS);
          }
        });
    };

    doSync();
  }, [user]);

  return null;
}
