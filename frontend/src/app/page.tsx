import { Dashboard } from "@/components/dashboard/dashboard";
import { PageHeader } from "@/components/layout/page-header";

export default function Home() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Dashboard" description="Fleet, maintenance and ingest at a glance." />
      <Dashboard />
    </div>
  );
}
