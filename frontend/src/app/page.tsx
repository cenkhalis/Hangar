import { HealthStatus } from "@/components/health-status";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">HANGAR</h1>
      <p className="text-muted-foreground">UAV fleet, flight log, and maintenance management.</p>
      <HealthStatus />
    </main>
  );
}
