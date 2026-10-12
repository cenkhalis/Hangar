import { LayoutDashboard, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Primary navigation. Sections are added as their pages are built. */
export const NAV_ITEMS: NavItem[] = [{ href: "/", label: "Dashboard", icon: LayoutDashboard }];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
