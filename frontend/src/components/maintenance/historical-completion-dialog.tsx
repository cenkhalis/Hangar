"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { DateTimeInput } from "@/components/date-time-input";
import { OptionSelect } from "@/components/option-select";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRecordHistoricalCompletion } from "@/hooks/use-maintenance";
import type { TaskStatus } from "@/lib/api/maintenance";
import { applyFieldErrors } from "@/lib/forms";
import { localDateTime, requiredText, toApiDateTime } from "@/lib/validation";

const schema = z.object({
  task: z.string({ error: "Required" }).min(1, "Required"),
  performed_at: localDateTime({ notInFuture: true }),
  performed_by: requiredText(200),
  notes: z.string().trim(),
});

type Values = z.infer<typeof schema>;

const FIELDS = ["task", "performed_at", "performed_by", "notes"] as const;

const EMPTY: Values = { task: "", performed_at: "", performed_by: "", notes: "" };

/** Record maintenance done before the aircraft was tracked; it restarts the task's intervals. */
export function HistoricalCompletionDialog({
  aircraftId,
  tasks,
}: {
  aircraftId: number;
  tasks: TaskStatus[];
}) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);
  const mutation = useRecordHistoricalCompletion();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { errors } = form.formState;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      form.reset(EMPTY);
      setFormError(null);
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(
      {
        aircraft: aircraftId,
        task: Number(values.task),
        performed_at: toApiDateTime(values.performed_at),
        performed_by: values.performed_by,
        notes: values.notes,
      },
      {
        onSuccess: (completion) => {
          toast.success(`Recorded ${completion.task_code} sign-off`);
          onOpenChange(false);
        },
        onError: (error) => {
          if (!applyFieldErrors(error, form.setError, FIELDS)) setFormError(error);
        },
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" disabled={tasks.length === 0} />}>
        Record historical sign-off
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Record historical sign-off</DialogTitle>
            <DialogDescription>
              For work done before this aircraft was tracked. Other sign-offs go through work
              orders.
            </DialogDescription>
          </DialogHeader>
          {formError !== null && <QueryError error={formError} />}
          <FieldGroup>
            <Field data-invalid={!!errors.task || undefined}>
              <FieldLabel htmlFor="historical-task">Task</FieldLabel>
              <Controller
                control={form.control}
                name="task"
                render={({ field }) => (
                  <OptionSelect
                    id="historical-task"
                    value={field.value || null}
                    onValueChange={(value) => field.onChange(value ?? "")}
                    options={tasks.map((t) => ({ value: String(t.task), label: `${t.code} ${t.title}` }))}
                    placeholder="Select a task"
                    invalid={!!errors.task}
                    className="w-full"
                  />
                )}
              />
              <FieldError errors={[errors.task]} />
            </Field>
            <Field data-invalid={!!errors.performed_at || undefined}>
              <FieldLabel htmlFor="historical-performed-at">Performed at</FieldLabel>
              <DateTimeInput
                id="historical-performed-at"
                notInFuture
                aria-invalid={!!errors.performed_at || undefined}
                {...form.register("performed_at")}
              />
              <FieldError errors={[errors.performed_at]} />
            </Field>
            <Field data-invalid={!!errors.performed_by || undefined}>
              <FieldLabel htmlFor="historical-performed-by">Performed by</FieldLabel>
              <Input
                id="historical-performed-by"
                aria-invalid={!!errors.performed_by || undefined}
                {...form.register("performed_by")}
              />
              <FieldError errors={[errors.performed_by]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="historical-notes">Notes</FieldLabel>
              <Textarea id="historical-notes" {...form.register("notes")} />
              <FieldError errors={[errors.notes]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Record sign-off"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
