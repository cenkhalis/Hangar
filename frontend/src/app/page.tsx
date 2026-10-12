import { HealthStatus } from "@/components/health-status";
import { PageHeader } from "@/components/layout/page-header";

export default function Home() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader title="HANGAR" description="UAV fleet, flight log, and maintenance management." />
      <HealthStatus />
    </div>
  );
}
