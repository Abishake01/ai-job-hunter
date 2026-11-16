import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./config";

/** Auth.js v5. JWT sessions; user rows are upserted into `users` on sign-in (see ensureUser). */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET }),
    ...(process.env.DEV_LOGIN === "true" && process.env.NODE_ENV !== "production"
      ? [Credentials({
          id: "dev", name: "Dev login",
          credentials: { email: { label: "Email" } },
          async authorize(c) { return c?.email ? { id: String(c.email), email: String(c.email), name: "Dev User" } : null; },
        })]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      const allowed = (process.env.ALLOWED_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (allowed.length && !allowed.includes((user.email ?? "").toLowerCase())) return false;
      if (account?.provider === "google" && !profile?.email_verified) return false;
      return !!user.email;
    },
    async jwt({ token, user, account }) {
      if (user?.email) {
        const { ensureUser } = await import("./ensure-user");
        const u = await ensureUser({ email: user.email, name: user.name ?? null, image: user.image ?? null, googleSub: account?.provider === "google" ? account.providerAccountId : null });
        token.uid = u.id;
      }
      return token;
    },
  },
});
