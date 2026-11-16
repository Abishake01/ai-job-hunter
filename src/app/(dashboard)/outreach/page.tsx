import { PageHeader } from "@/components/common/page-header";
import { OutreachClient } from "@/components/outreach/outreach-client";

export const metadata = { title: "Email Outreach · AI Job Hunter" };
export default function OutreachPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Email Outreach" description="Review, edit and approve emails. Nothing is ever sent without your explicit two-step confirmation." />
      <OutreachClient />
    </div>
  );
}
