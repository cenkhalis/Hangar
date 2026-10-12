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
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useVoidCompletion } from "@/hooks/use-maintenance";
import type { TaskCompletion } from "@/lib/api/maintenance";
import { formatDateTime } from "@/lib/format";
import { applyFieldErrors } from "@/lib/forms";
import { requiredText } from "@/lib/validation";

const schema = z.object({ reason: requiredText(500) });

type Values = z.infer<typeof schema>;

/** Void a sign-off; it stays in the history and due status falls back to the previous one. */
export function VoidCompletionDialog({
  completion,
  onClose,
}: {
  /** The sign-off to void; the dialog is open while this is set. */
  completion: TaskCompletion | null;
  onClose: () => void;
}) {
  const [formError, setFormError] = useState<unknown>(null);
  const mutation = useVoidCompletion();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { reason: "" } });
  const { errors } = form.formState;

  const close = () => {
    form.reset({ reason: "" });
    setFormError(null);
    onClose();
  };

  const onSubmit = form.handleSubmit(({ reason }) => {
    if (!completion) return;
    setFormError(null);
    mutation.mutate(
      { id: completion.id, reason },
      {
        onSuccess: () => {
          toast.success(`Voided ${completion.task_code} sign-off`);
          close();
        },
        onError: (error) => {
          if (!applyFieldErrors(error, form.setError, ["reason"])) setFormError(error);
        },
      },
    );
  });

  return (
    <Dialog open={completion !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Void sign-off</DialogTitle>
            {completion && (
              <DialogDescription>
                {completion.task_code} on {formatDateTime(completion.performed_at)} by{" "}
                {completion.performed_by}. The record stays in the history, and the task&apos;s
                intervals count from the previous valid sign-off.
              </DialogDescription>
            )}
          </DialogHeader>
          {formError !== null && <QueryError error={formError} />}
          <Field data-invalid={!!errors.reason || undefined}>
            <FieldLabel htmlFor="void-reason">Reason</FieldLabel>
            <Textarea
              id="void-reason"
              aria-invalid={!!errors.reason || undefined}
              {...form.register("reason")}
            />
            <FieldError errors={[errors.reason]} />
          </Field>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={mutation.isPending}>
              {mutation.isPending ? "Voiding…" : "Void sign-off"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
