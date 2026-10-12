const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A "YYYY-MM-DD" value from the URL, or undefined when missing or malformed. */
export function parseDateParam(value: string | null): string | undefined {
  if (!value || !DATE.test(value)) return undefined;
  return Number.isNaN(new Date(`${value}T00:00:00`).getTime()) ? undefined : value;
}

function startOfLocalDay(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Inclusive local calendar dates as the API's half-open datetime range: `from` at local midnight
 * (gte) up to the midnight after `to` (lt), so flights late on `to` are included.
 */
export function dateRangeToApi(from?: string, to?: string) {
  const range: { departure_after?: string; departure_before?: string } = {};
  if (from) range.departure_after = startOfLocalDay(from).toISOString();
  if (to) {
    const end = startOfLocalDay(to);
    end.setDate(end.getDate() + 1);
    range.departure_before = end.toISOString();
  }
  return range;
}
