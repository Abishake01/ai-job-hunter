import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

// Next 16 "proxy" (formerly middleware): gate every page + API route behind a session.
export default NextAuth(authConfig).auth;

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
