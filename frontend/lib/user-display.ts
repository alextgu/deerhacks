/**
 * User display name and initials — shared logic for Auth0 user and Supabase profile.
 * Prefer first_name + last_name (from DB or Auth0 given_name/family_name), then name, then "User".
 */

/** Auth0 user shape with optional OIDC profile claims */
export type Auth0UserWithName = {
  name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  email?: string | null;
  picture?: string | null;
};

/** Supabase profile row — includes first_name and last_name from DB/Auth0 sync */
export type ProfileWithName = {
  id?: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  [key: string]: unknown;
};

/** Alias for profile with name fields (use for API responses and DB rows) */
export type Profile = ProfileWithName;

export type UserOrProfile = Auth0UserWithName | ProfileWithName;

function hasAuth0Names(
  s: UserOrProfile
): s is Auth0UserWithName & { given_name?: string; family_name?: string } {
  return "given_name" in s || "family_name" in s;
}

function hasProfileNames(
  s: UserOrProfile
): s is ProfileWithName & { first_name?: string; last_name?: string } {
  return "first_name" in s || "last_name" in s;
}

/**
 * Resolves display name: first_name + last_name (from DB or Auth0) → name → "User".
 */
export function getDisplayName(source: UserOrProfile | null | undefined): string {
  if (!source) return "User";

  if (hasProfileNames(source)) {
    const first = source.first_name?.trim();
    const last = source.last_name?.trim();
    if (first || last) return [first, last].filter(Boolean).join(" ");
  }

  if (hasAuth0Names(source)) {
    const first = source.given_name?.trim();
    const last = source.family_name?.trim();
    if (first || last) return [first, last].filter(Boolean).join(" ");
  }

  const name = "name" in source ? source.name : null;
  if (name?.trim()) return name.trim();
  return "User";
}

/**
 * First name only (for "Welcome back, {first}").
 * Uses first_name / given_name, else first word of name.
 */
export function getFirstName(source: UserOrProfile | null | undefined): string {
  if (!source) return "there";

  if (hasProfileNames(source) && source.first_name?.trim())
    return source.first_name.trim();
  if (hasAuth0Names(source) && source.given_name?.trim())
    return source.given_name.trim();

  const name = "name" in source ? source.name : null;
  const firstWord = name?.trim().split(/\s+/)[0];
  return firstWord ?? "there";
}

/**
 * Initials from first_name + last_name when possible, else first two letters of name.
 */
export function getInitials(source: UserOrProfile | null | undefined): string {
  if (!source) return "?";

  if (hasProfileNames(source)) {
    const first = source.first_name?.trim();
    const last = source.last_name?.trim();
    if (first && last) return (first[0] + last[0]).toUpperCase();
  }

  if (hasAuth0Names(source)) {
    const first = source.given_name?.trim();
    const last = source.family_name?.trim();
    if (first && last) return (first[0] + last[0]).toUpperCase();
  }

  const name = "name" in source ? source.name : null;
  if (name?.trim()) {
    const letters = name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
    if (letters) return letters;
  }

  const email = "email" in source ? source.email : null;
  if (email?.[0]) return email[0].toUpperCase();
  return "?";
}
