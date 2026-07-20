/**
 * Auth seam — intentionally a stub for now.
 *
 * You asked to add dashboard auth LATER. Everything that needs "who is acting"
 * goes through getCurrentUser()/requireUser() so wiring a real provider later
 * (Clerk, Auth.js, Sign in with Vercel) is a one-file change — no call sites move.
 *
 * Today: single-operator mode (you). Replace the body of getCurrentUser() with a
 * real session lookup, and add middleware.ts to gate routes, when you're ready.
 */
export interface CurrentUser {
  id: string;
  email: string;
  role: "owner";
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // TODO(auth): replace with real session resolution.
  return {
    id: "owner",
    email: process.env.OWNER_EMAIL ?? "croncore@gmail.com",
    role: "owner",
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}
