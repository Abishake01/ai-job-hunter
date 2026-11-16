import { PageHeader } from "@/components/common/page-header";
import { ResumeManager } from "@/components/resume/resume-manager";

export const metadata = { title: "Resume Manager · AI Job Hunter" };
export default function ResumePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Resume Manager" description="Upload PDF resumes, pick a default, analyze them, and compare versions. The best resume per job is recommended automatically." />
      <ResumeManager />
    </div>
  );
}
