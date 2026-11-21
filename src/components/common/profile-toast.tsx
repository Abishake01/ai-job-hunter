"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/utils/fetcher";
import type { Completeness } from "@/lib/profile/completeness";

const KEY = "profile-toast-dismissed";
/** Top-of-screen reminder while the profile is incomplete. Auto-apply unlocks at 100%. Shown once per browser session unless the profile changes. */
export function ProfileToast() {
  const router = useRouter();
  React.useEffect(() => {
    let cancelled = false;
    api<Completeness>("/api/profile/completeness").then((c) => {
      if (cancelled || c.complete) return;
      const sig = `${c.percent}`;
      try { if (sessionStorage.getItem(KEY) === sig) return; } catch { /* storage unavailable */ }
      const onlyResume = c.missing.every((m) => m.tab === "resume");
      toast.warning(`Your profile is ${c.percent}% complete`, {
        id: "profile-incomplete", position: "top-center", duration: Infinity,
        description: `Finish your profile to unlock auto-apply and better job matches. Missing: ${c.missing.slice(0, 4).map((m) => m.label).join(", ")}${c.missing.length > 4 ? ` +${c.missing.length - 4} more` : ""}.`,
        action: { label: onlyResume ? "Upload resume" : "Update profile", onClick: () => router.push(onlyResume ? "/resume" : "/settings#profile") },
        onDismiss: () => { try { sessionStorage.setItem(KEY, sig); } catch { /* ignore */ } },
      });
    }).catch(() => undefined);
    return () => { cancelled = true; toast.dismiss("profile-incomplete"); };
  }, [router]);
  return null;
}
