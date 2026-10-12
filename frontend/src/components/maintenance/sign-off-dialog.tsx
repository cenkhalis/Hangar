"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { DateTimeInput } from "@/components/date-time-input";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSignOffItem } from "@/hooks/use-maintenance";
import type { WorkOrder, WorkOrderItem } from "@/lib/api/maintenance";
import { formatDateTimeSeconds } from "@/lib/format";
import { applyFieldErrors } from "@/lib/forms";
import { localDateTime, requiredText, toApiDateTime, toLocalInputValue } from "@/lib/validation";

const FIELDS = ["performed_at", "performed_by", "notes"] as const;

/** The backend rejects sign-offs before the work order opened; check it before submitting. */
function signOffSchema(openedAt: string) {
  return z.object({
    performed_at: localDateTime({ notInFuture: true }).refine(
      (value) => new Date(value).getTime() >= new Date(openedAt).getTime(),
      { message: `Cannot be before the work order opened (${formatDateTimeSeconds(openedAt)})` },
    ),
    performed_by: requiredText(200),
    notes: z.string().trim(),
  });
}

type Values = z.infer<ReturnType<typeof signOffSchema>>;

/** Sign off one pending item; its task's intervals restart from the performed-at time. */
export function SignOffDialog({
  workOrder,
  item,
  onClose,
}: {
  workOrder: WorkOrder;
  /** The item to sign off; the dialog is open while this is set. */
  item: WorkOrderItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {item && <SignOffForm workOrder={workOrder} item={item} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function SignOffForm({
  workOrder,
  item,
  onDone,
}: {
  workOrder: WorkOrder;
  item: WorkOrderItem;
  onDone: () => void;
}) {
  const [formError, setFormError] = useState<unknown>(null);
  const mutation = useSignOffItem();
  const form = useForm<Values>({
    resolver: zodResolver(signOffSchema(workOrder.opened_at)),
    defaultValues: {
      performed_at: toLocalInputValue(new Date(), { seconds: true }),
      performed_by: "",
      notes: "",
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(
      {
        itemId: item.id,
        body: {
          performed_at: toApiDateTime(values.performed_at),
          performed_by: values.performed_by,
          notes: values.notes,
        },
      },
      {
        onSuccess: () => {
          toast.success(`Signed off ${item.task_code}`);
          onDone();
        },
        onError: (error) => {
          if (!applyFieldErrors(error, form.setError, FIELDS)) setFormError(error);
        },
      },
    );
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Sign off {item.task_code}</DialogTitle>
        <DialogDescription>
          {item.task_title}. Every interval of this task restarts from the time it was performed.
        </DialogDescription>
      </DialogHeader>
      {formError !== null && <QueryError error={formError} />}
      <FieldGroup>
        <Field data-invalid={!!errors.performed_at || undefined}>
          <FieldLabel htmlFor="sign-off-performed-at">Performed at</FieldLabel>
          <DateTimeInput
            id="sign-off-performed-at"
            notInFuture
            withSeconds
            aria-invalid={!!errors.performed_at || undefined}
            {...form.register("performed_at")}
          />
          <FieldError errors={[errors.performed_at]} />
        </Field>
        <Field data-invalid={!!errors.performed_by || undefined}>
          <FieldLabel htmlFor="sign-off-performed-by">Performed by</FieldLabel>
          <Input
            id="sign-off-performed-by"
            aria-invalid={!!errors.performed_by || undefined}
            {...form.register("performed_by")}
          />
          <FieldError errors={[errors.performed_by]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="sign-off-notes">Notes</FieldLabel>
          <Textarea id="sign-off-notes" {...form.register("notes")} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Signing off…" : "Sign off"}
        </Button>
      </DialogFooter>
    </form>
  );
}
