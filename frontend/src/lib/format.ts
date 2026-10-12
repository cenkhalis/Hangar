const LOCALE = "en-GB";

/** API decimals arrive as strings ("12.50"); convert only for display. */
export function formatNumber(value: string | number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(Number(value));
}

export function formatHours(value: string | number): string {
  return `${formatNumber(value, 2)} h`;
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return `${m} min ${String(s).padStart(2, "0")} s`;
  return `${s} s`;
}

export function formatDateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

/** Format a date-only value ("2026-06-30") without shifting it across time zones. */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

const DAY_MS = 86_400_000;

/** "today", "in 3 days", "2 days ago", relative to `today` (both date-only strings). */
export function formatRelativeDays(date: string, today: string): string {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(days, "day");
}

/** The browser-local calendar date as "YYYY-MM-DD". */
export function localDateString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
