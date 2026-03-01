'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import { getDisplayName } from '@/lib/user-display';

export function AuthButton() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <span className="text-sm text-zinc-500">
        Loading...
      </span>
    );
  }

  if (user) {
    const name = getDisplayName(user);
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {user.picture && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user.picture}
                alt={name}
                width={32}
                height={32}
                className="rounded-full"
              />
            </>
          )}
          <span className="text-sm font-medium text-zinc-900">
            {name}
          </span>
        </div>
        <a
          href="/auth/logout"
          className="rounded-full border px-4 py-2 text-sm font-medium border-border hover:bg-black-04"
        >
          Logout
        </a>
      </div>
    );
  }

  return (
    <a
      href="/auth/login"
      className="btn-login"
    >
      Login
    </a>
  );
}
