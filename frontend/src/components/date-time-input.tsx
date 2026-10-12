import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { toLocalInputValue } from "@/lib/validation";

type DateTimeInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  /** Cap the picker at the current minute; pair with `localDateTime({ notInFuture: true })`. */
  notInFuture?: boolean;
};

/** A local date and time; convert with `toApiDateTime` before sending it to the API. */
export function DateTimeInput({ notInFuture = false, ...props }: DateTimeInputProps) {
  return (
    <Input
      type="datetime-local"
      max={notInFuture ? toLocalInputValue(new Date()) : undefined}
      {...props}
    />
  );
}
