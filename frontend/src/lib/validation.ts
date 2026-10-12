import { z } from "zod";

type DecimalOptions = {
  /** Total digits allowed (Django max_digits). */
  maxDigits?: number;
  /** Fractional digits allowed (Django decimal_places). */
  decimalPlaces?: number;
  /** Require an integer value (cycles and calendar days). */
  wholeNumber?: boolean;
  /** Exclusive lower bound. */
  greaterThan?: number;
  /** Exclusive upper bound. */
  lessThan?: number;
};

/**
 * A decimal kept as a string end to end, mirroring a Django DecimalField. Values are never
 * converted to floats for submission, so "2.50" reaches the API exactly.
 */
export function decimalString({
  maxDigits = 10,
  decimalPlaces = 2,
  wholeNumber = false,
  greaterThan = 0,
  lessThan,
}: DecimalOptions = {}) {
  const integerDigits = maxDigits - decimalPlaces;
  return z
    .string()
    .trim()
    .min(1, "Required")
    .refine((v) => /^\d+(\.\d+)?$/.test(v), "Enter a number")
    .refine((v) => !wholeNumber || /^\d+(\.0+)?$/.test(v), "Must be a whole number")
    .refine((v) => (v.split(".")[1]?.length ?? 0) <= decimalPlaces, {
      message: `At most ${decimalPlaces} decimal places`,
    })
    .refine((v) => v.split(".")[0].replace(/^0+(?=\d)/, "").length <= integerDigits, {
      message: `At most ${integerDigits} digits before the decimal point`,
    })
    .refine((v) => Number(v) > greaterThan, { message: `Must be greater than ${greaterThan}` })
    .refine((v) => lessThan === undefined || Number(v) < lessThan, {
      message: `Must be less than ${lessThan}`,
    });
}

/** Warning threshold: a percentage strictly between 0 and 100. */
export const thresholdPercent = () => decimalString({ maxDigits: 5, greaterThan: 0, lessThan: 100 });

/** A trimmed, required text value. */
export const requiredText = (max = 500) =>
  z.string().trim().min(1, "Required").max(max, `At most ${max} characters`);

/** Value of an `<input type="datetime-local">` ("YYYY-MM-DDTHH:mm"), in the browser's zone. */
export function localDateTime({ notInFuture = false, now = () => new Date() } = {}) {
  return z
    .string()
    .min(1, "Required")
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date and time")
    .refine((v) => !notInFuture || new Date(v).getTime() <= now().getTime(), {
      message: "Cannot be in the future",
    });
}

/** Convert a datetime-local value to the ISO 8601 UTC string the API expects. */
export function toApiDateTime(localValue: string): string {
  return new Date(localValue).toISOString();
}

/**
 * Convert a date to a datetime-local value in the browser's zone, to the minute or, for inputs
 * with `step={1}`, to the second.
 */
export function toLocalInputValue(date: Date, { seconds = false } = {}): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}` +
    (seconds ? `:${pad(date.getSeconds())}` : "")
  );
}
