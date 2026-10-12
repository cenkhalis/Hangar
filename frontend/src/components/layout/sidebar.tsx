import { ExternalLink, Plane } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { API_URL } from "@/lib/api/client";

import { HealthChip } from "./health-chip";
import { NavLinks, NavLinksFallback } from "./nav-links";

export function Sidebar() {
  return (
    <aside className="border-b bg-sidebar md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex items-center gap-4 overflow-x-auto px-4 py-3 md:h-full md:flex-col md:items-stretch md:py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight md:px-3">
          <Plane aria-hidden className="size-5" />
          HANGAR
        </Link>
        <HealthChip className="shrink-0 md:order-1 md:px-3" />
        <nav aria-label="Main" className="md:flex-1">
          {/* usePathname suspends on routes with dynamic params when cacheComponents is on. */}
          <Suspense fallback={<NavLinksFallback />}>
            <NavLinks />
          </Suspense>
        </nav>
        <a
          href={`${API_URL}/api/docs/`}
          target="_blank"
          rel="noreferrer"
          className="hidden items-center gap-1 px-3 text-xs text-muted-foreground hover:text-foreground md:order-2 md:flex"
        >
          API docs <ExternalLink aria-hidden className="size-3" />
        </a>
      </div>
    </aside>
  );
}
