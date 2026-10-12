"use client";

import { DataTable } from "@/components/data-table";
import { flightColumns } from "@/components/flights/flight-columns";
import { OptionSelect, type SelectOption } from "@/components/option-select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAllAircraft } from "@/hooks/use-fleet";
import { useFlights } from "@/hooks/use-flights";
import { useUrlState } from "@/hooks/use-url-state";
import { dateRangeToApi, parseDateParam } from "@/lib/date-range";

const toId = (value: string | null) => (value && /^\d+$/.test(value) ? Number(value) : undefined);

/** Flights across the fleet with URL filters; uses `useSearchParams`, so render it in Suspense. */
export function FlightList() {
  const { params, page, setParams, setPage } = useUrlState();
  const aircraft = toId(params.get("aircraft"));
  const from = parseDateParam(params.get("from"));
  const to = parseDateParam(params.get("to"));

  const flights = useFlights({ page, aircraft, ...dateRangeToApi(from, to) });
  const fleet = useAllAircraft();

  const aircraftOptions: SelectOption[] = [
    { value: null, label: "All aircraft" },
    ...(fleet.data ?? []).map((a) => ({ value: String(a.id), label: a.serial_number })),
  ];
  const invertedRange = from !== undefined && to !== undefined && from > to;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-auto">
          <FieldLabel htmlFor="flights-aircraft">Aircraft</FieldLabel>
          <OptionSelect
            id="flights-aircraft"
            value={aircraft ? String(aircraft) : null}
            onValueChange={(value) => setParams({ aircraft: value })}
            options={aircraftOptions}
            disabled={fleet.isPending}
          />
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor="flights-from">From</FieldLabel>
          <Input
            id="flights-from"
            type="date"
            value={from ?? ""}
            max={to}
            onChange={(event) => setParams({ from: event.target.value })}
          />
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor="flights-to">To</FieldLabel>
          <Input
            id="flights-to"
            type="date"
            value={to ?? ""}
            min={from}
            onChange={(event) => setParams({ to: event.target.value })}
          />
        </Field>
      </div>
      <DataTable
        label="Flights"
        columns={flightColumns.withAircraft}
        data={flights.data?.results}
        isPending={flights.isPending}
        error={flights.error}
        onRetry={() => flights.refetch()}
        emptyMessage={
          invertedRange
            ? "The start date is after the end date."
            : aircraft || from || to
              ? "No flights match these filters."
              : "No flights yet. Drop flight logs into the inbox to ingest them."
        }
        pagination={flights.data && { page, count: flights.data.count, onPageChange: setPage }}
      />
    </div>
  );
}
