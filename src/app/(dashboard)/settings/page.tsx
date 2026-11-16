import { PageHeader } from "@/components/common/page-header";
import { SettingsClient } from "@/components/settings/settings-client";

export const metadata = { title: "Settings · AI Job Hunter" };
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" description="Your profile, matching rules, AI provider, automation and privacy controls." />
      <SettingsClient />
    </div>
  );
}
