"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useCancelWorkOrder } from "@/hooks/use-maintenance";
import type { WorkOrder } from "@/lib/api/maintenance";
import { applyFieldErrors } from "@/lib/forms";
import { requiredText } from "@/lib/validation";

const schema = z.object({ reason: requiredText(500) });

type Values = z.infer<typeof schema>;

/** Cancel an open work order; pending items are cancelled, signed-off items keep their records. */
export function CancelWorkOrderDialog({ workOrder }: { workOrder: WorkOrder }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        Cancel work order
      </DialogTrigger>
      <DialogContent>
        <CancelForm workOrder={workOrder} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CancelForm({ workOrder, onDone }: { workOrder: WorkOrder; onDone: () => void }) {
  const [formError, setFormError] = useState<unknown>(null);
  const mutation = useCancelWorkOrder();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { reason: "" } });
  const { errors } = form.formState;
  const signedOff = workOrder.items.filter((item) => item.status === "signed_off").length;

  const onSubmit = form.handleSubmit(({ reason }) => {
    setFormError(null);
    mutation.mutate(
      { id: workOrder.id, reason },
      {
        onSuccess: () => {
          toast.success(`Cancelled WO-${workOrder.id}`);
          onDone();
        },
        onError: (error) => {
          if (!applyFieldErrors(error, form.setError, ["reason"])) setFormError(error);
        },
      },
    );
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Cancel WO-{workOrder.id}</DialogTitle>
        <DialogDescription>
          Pending items are cancelled and their tasks can go on a new work order.
          {signedOff > 0 &&
            ` ${signedOff} signed-off ${signedOff === 1 ? "item keeps its" : "items keep their"} sign-off.`}
        </DialogDescription>
      </DialogHeader>
      {formError !== null && <QueryError error={formError} />}
      <Field data-invalid={!!errors.reason || undefined}>
        <FieldLabel htmlFor="cancel-reason">Reason</FieldLabel>
        <Textarea
          id="cancel-reason"
          aria-invalid={!!errors.reason || undefined}
          {...form.register("reason")}
        />
        <FieldError errors={[errors.reason]} />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="destructive" disabled={mutation.isPending}>
          {mutation.isPending ? "Cancelling…" : "Cancel work order"}
        </Button>
      </DialogFooter>
    </form>
  );
}
