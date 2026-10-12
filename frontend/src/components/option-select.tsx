"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SelectOption = { value: string | null; label: string };

type OptionSelectProps = {
  id?: string;
  "aria-label"?: string;
  value: string | null;
  onValueChange: (value: string | null) => void;
  /** An option with a `null` value acts as "all" / "none". */
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
};

/** A single-choice select over string values, used by filters and forms. */
export function OptionSelect({
  id,
  "aria-label": ariaLabel,
  value,
  onValueChange,
  options,
  placeholder,
  invalid,
  disabled,
  className,
}: OptionSelectProps) {
  return (
    <Select<string | null>
      value={value}
      onValueChange={(next) => onValueChange(next)}
      items={options}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={className}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value ?? ""} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
