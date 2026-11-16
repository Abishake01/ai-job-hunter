import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Briefcase } from "lucide-react";

export default function LoginPage() {
  const dev = process.env.DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-semibold"><Briefcase className="size-5" /> AI Job Hunter</div>
        <p className="text-sm text-muted-foreground">Sign in with Google to open your private job-search workspace.</p>
        <form action={async () => { "use server"; await signIn("google", { redirectTo: "/dashboard" }); }}>
          <Button type="submit" className="w-full">Continue with Google</Button>
        </form>
        {dev && (
          <form className="space-y-2 border-t pt-4" action={async (fd: FormData) => { "use server"; await signIn("dev", { email: String(fd.get("email")), redirectTo: "/dashboard" }); }}>
            <p className="text-xs text-muted-foreground">Local development login (disabled in production)</p>
            <Input name="email" type="email" placeholder="you@example.com" required />
            <Button type="submit" variant="outline" className="w-full">Dev sign in</Button>
          </form>
        )}
      </div>
    </main>
  );
}
