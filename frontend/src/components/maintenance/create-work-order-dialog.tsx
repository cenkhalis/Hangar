"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { EmptyState } from "@/components/empty-state";
import { OptionSelect } from "@/components/option-select";
import { QueryError } from "@/components/query-error";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAllAircraft } from "@/hooks/use-fleet";
import { useCreateWorkOrder, useMaintenanceStatus, useWorkOrders } from "@/hooks/use-maintenance";
import { ApiError } from "@/lib/api/client";
import { applyFieldErrors } from "@/lib/forms";
import { defaultTaskSelection, pendingTasks } from "@/lib/maintenance";
import { requiredText } from "@/lib/validation";

const schema = z.object({
  aircraft: z.string().min(1, "Required"),
  tasks: z.array(z.number()).min(1, "Select at least one task"),
  title: requiredText(200),
  notes: z.string().trim(),
});

type Values = z.infer<typeof schema>;

const FIELDS = ["aircraft", "tasks", "title", "notes"] as const;

type CreateWorkOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fix the aircraft, e.g. when starting from the due board. */
  aircraftId?: number;
  /** Tasks to preselect instead of every due-soon or overdue task. */
  taskIds?: number[];
};

export function CreateWorkOrderDialog({ open, onOpenChange, ...preset }: CreateWorkOrderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Mounted only while open, so each opening starts from a fresh form. */}
        <CreateWorkOrderForm {...preset} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreateWorkOrderForm({
  aircraftId: presetAircraft,
  taskIds,
  onDone,
}: Omit<CreateWorkOrderDialogProps, "open" | "onOpenChange"> & { onDone: () => void }) {
  const router = useRouter();
  const [formError, setFormError] = useState<unknown>(null);
  const mutation = useCreateWorkOrder();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      aircraft: presetAircraft ? String(presetAircraft) : "",
      tasks: [],
      title: "",
      notes: "",
    },
  });
  const { errors } = form.formState;

  const aircraftValue = useWatch({ control: form.control, name: "aircraft" });
  const aircraftId = aircraftValue ? Number(aircraftValue) : undefined;
  const fleet = useAllAircraft();
  const status = useMaintenanceStatus(aircraftId);
  const openOrders = useWorkOrders(
    { page: 1, status: "open", aircraft: aircraftId },
    { enabled: aircraftId !== undefined },
  );
  const pending = useMemo(() => pendingTasks(openOrders.data?.results ?? []), [openOrders.data]);

  // Preselect tasks once per chosen aircraft, after its status and open work orders load.
  const seededFor = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (aircraftId === undefined || !status.data || !openOrders.data) return;
    if (seededFor.current === aircraftId) return;
    seededFor.current = aircraftId;
    const requested = aircraftId === presetAircraft ? taskIds : undefined;
    form.setValue("tasks", defaultTaskSelection(status.data.tasks, pending, requested));
  }, [aircraftId, status.data, openOrders.data, pending, presetAircraft, taskIds, form]);

  const aircraftOptions = (fleet.data ?? [])
    .filter((a) => a.status !== "retired")
    .map((a) => ({ value: String(a.id), label: a.serial_number }));

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(
      {
        aircraft: Number(values.aircraft),
        tasks: values.tasks,
        title: values.title,
        notes: values.notes,
      },
      {
        onSuccess: (workOrder) => {
          toast.success(`Opened WO-${workOrder.id}`);
          onDone();
          router.push(`/work-orders/${workOrder.id}`);
        },
        onError: (error) => {
          if (!applyFieldErrors(error, form.setError, FIELDS)) setFormError(error);
          // Another work order took a task meanwhile; mark it in the picker.
          if (error instanceof ApiError && error.code === "duplicate_open_task") {
            void openOrders.refetch();
          }
        },
      },
    );
  });

  const loadingTasks = aircraftId !== undefined && (status.isPending || openOrders.isPending);
  const taskError = status.error ?? openOrders.error;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Create work order</DialogTitle>
        <DialogDescription>
          Tasks due soon or overdue are preselected. Tasks already on an open work order cannot be
          added again.
        </DialogDescription>
      </DialogHeader>
      {formError !== null && <QueryError error={formError} />}
      <FieldGroup>
        <Field data-invalid={!!errors.aircraft || undefined}>
          <FieldLabel htmlFor="work-order-aircraft">Aircraft</FieldLabel>
          <Controller
            control={form.control}
            name="aircraft"
            render={({ field }) => (
              <OptionSelect
                id="work-order-aircraft"
                value={field.value || null}
                onValueChange={(value) => {
                  field.onChange(value ?? "");
                  form.setValue("tasks", []);
                }}
                options={aircraftOptions}
                placeholder="Select an aircraft"
                invalid={!!errors.aircraft}
                disabled={presetAircraft !== undefined || fleet.isPending}
                className="w-full"
              />
            )}
          />
          <FieldError errors={[errors.aircraft]} />
        </Field>
        <FieldSet data-invalid={!!errors.tasks || undefined}>
          <FieldLegend variant="label">Tasks</FieldLegend>
          {aircraftId === undefined ? (
            <p className="text-sm text-muted-foreground">Select an aircraft to see its tasks.</p>
          ) : loadingTasks ? (
            <Skeleton className="h-24 w-full" />
          ) : taskError ? (
            <QueryError error={taskError} />
          ) : status.data!.tasks.length === 0 ? (
            <EmptyState className="py-2">
              This aircraft&apos;s model has no active maintenance tasks.
            </EmptyState>
          ) : (
            <Controller
              control={form.control}
              name="tasks"
              render={({ field }) => (
                <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                  {status.data!.tasks.map((task) => {
                    const onOrder = pending.get(task.task);
                    const checked = field.value.includes(task.task);
                    return (
                      <li key={task.task}>
                        <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm has-disabled:opacity-60">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={checked}
                            disabled={onOrder !== undefined}
                            onChange={() =>
                              field.onChange(
                                checked
                                  ? field.value.filter((id) => id !== task.task)
                                  : [...field.value, task.task],
                              )
                            }
                          />
                          <span className="flex-1">
                            <span className="font-medium">{task.code}</span> {task.title}
                          </span>
                          {onOrder !== undefined ? (
                            <span className="text-xs text-muted-foreground">On WO-{onOrder}</span>
                          ) : (
                            <StatusBadge state={task.state} />
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            />
          )}
          <FieldError errors={[errors.tasks]} />
        </FieldSet>
        <Field data-invalid={!!errors.title || undefined}>
          <FieldLabel htmlFor="work-order-title">Title</FieldLabel>
          <Input
            id="work-order-title"
            aria-invalid={!!errors.title || undefined}
            {...form.register("title")}
          />
          <FieldError errors={[errors.title]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="work-order-notes">Notes</FieldLabel>
          <Textarea id="work-order-notes" {...form.register("notes")} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Create work order"}
        </Button>
      </DialogFooter>
    </form>
  );
}
