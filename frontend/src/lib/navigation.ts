import {
  ClipboardList,
  LayoutDashboard,
  type LucideIcon,
  Plane,
  PlaneTakeoff,
  ScrollText,
  Wrench,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Primary navigation. Sections are added as their pages are built. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/aircraft", label: "Aircraft", icon: Plane },
  { href: "/flights", label: "Flights", icon: PlaneTakeoff },
  { href: "/flight-logs", label: "Flight logs", icon: ScrollText },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/work-orders", label: "Work orders", icon: ClipboardList },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
