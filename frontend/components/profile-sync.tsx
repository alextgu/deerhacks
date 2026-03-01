"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";

/**
 * Invisible component: syncs the Auth0 user to the Supabase profiles table
 * once per session by calling POST /api/auth/sync after login.
 * Requires: middleware.ts (Auth0), SUPABASE_SERVICE_ROLE_KEY in .env
 */
export function ProfileSync() {
  const { user } = useUser();
  const synced = useRef(false);

  useEffect(() => {
    if (!user || synced.current) return;
    synced.current = true;
    fetch("/api/auth/sync", {
      method: "POST",
      credentials: "same-origin",
    })
      .then((res) => {
        if (!res.ok && process.env.NODE_ENV === "development") {
          res.json().then((b) => console.warn("[ProfileSync]", res.status, b));
        }
      })
      .catch((err) => {
        if (process.env.NODE_ENV === "development") {
          console.warn("[ProfileSync] request failed", err);
        }
      });
  }, [user]);

  return null;
}
