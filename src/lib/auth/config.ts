import type { NextAuthConfig } from "next-auth";

/** Edge-safe config (used by proxy). Providers + DB callbacks are added in ./index.ts */
export const authConfig = {
  providers: [],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login" },
  trustHost: true,
  callbacks: {
    authorized({ auth, request }) {
      const p = request.nextUrl.pathname;
      if (p.startsWith("/login") || p.startsWith("/api/auth") || p.startsWith("/api/cron") || p.startsWith("/api/inngest")) return true;
      return !!auth?.user;
    },
    session({ session, token }) {
      if (token.uid) (session.user as { id?: string }).id = token.uid as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
