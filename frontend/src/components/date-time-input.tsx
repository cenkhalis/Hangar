import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { toLocalInputValue } from "@/lib/validation";

type DateTimeInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  /** Cap the picker at the current time; pair with `localDateTime({ notInFuture: true })`. */
  notInFuture?: boolean;
  /**
   * Second precision. Needed when a lower bound can fall in the current minute: a minute-precision
   * value may then have no valid choice (e.g. opened 10:00:30, now 10:00:50).
   */
  withSeconds?: boolean;
};

/** A local date and time; convert with `toApiDateTime` before sending it to the API. */
export function DateTimeInput({
  notInFuture = false,
  withSeconds = false,
  ...props
}: DateTimeInputProps) {
  return (
    <Input
      type="datetime-local"
      step={withSeconds ? 1 : undefined}
      max={notInFuture ? toLocalInputValue(new Date(), { seconds: withSeconds }) : undefined}
      {...props}
    />
  );
}
