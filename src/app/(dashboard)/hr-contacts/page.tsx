import { PageHeader } from "@/components/common/page-header";
import { HrContactsClient } from "@/components/outreach/hr-contacts-client";

export const metadata = { title: "HR Contacts · AI Job Hunter" };
export default function HrContactsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="HR Contacts" description="Recruiters and hiring contacts from public sources, each with its source link and verification level." />
      <HrContactsClient />
    </div>
  );
}
