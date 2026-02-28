'use client';

import { useUser } from '@auth0/nextjs-auth0/client';

export function AuthButton() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        Loading...
      </span>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {user.picture && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user.picture}
                alt={user.name ?? 'User'}
                width={32}
                height={32}
                className="rounded-full"
              />
            </>
          )}
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {user.name}
          </span>
        </div>
        <a
          href="/auth/logout"
          className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.08]"
        >
          Logout
        </a>
      </div>
    );
  }

  return (
    <a
      href="/auth/login"
      className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
    >
      Login
    </a>
  );
}
