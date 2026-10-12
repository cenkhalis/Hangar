import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("py-8 text-center text-sm text-muted-foreground", className)}>{children}</p>;
}
