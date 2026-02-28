"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";

/**
 * Invisible component: syncs the Auth0 user to the Supabase profiles table
 * once per session by calling POST /api/auth/sync after login.
 */
export function ProfileSync() {
  const { user } = useUser();
  const synced = useRef(false);

  useEffect(() => {
    if (!user || synced.current) return;
    synced.current = true;
    fetch("/api/auth/sync", { method: "POST" }).catch(() => {});
  }, [user]);

  return null;
}
