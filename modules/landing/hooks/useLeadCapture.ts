"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import type { WebLeadFormState } from "@/modules/crm";

export type LeadCaptureAction = (prev: WebLeadFormState, formData: FormData) => Promise<WebLeadFormState>;

// responses counts the action's answers: every answer consumes the single-use Turnstile token.
type CaptureState = { result: WebLeadFormState; responses: number };

const IDLE: WebLeadFormState = { status: "idle" };
const INITIAL_STATE: CaptureState = { result: IDLE, responses: 0 };
const START_OVER = "start-over";

// Form state of the public lead capture. Keeps the submission key across retries (idempotency) and
// forgets it after a success or startOver, so the next person gets a new key. Stores nothing in the
// browser.
export function useLeadCapture({ action }: { action: LeadCaptureAction }): {
  state: WebLeadFormState;
  pending: boolean;
  formKey: number; // changes on startOver: remounts an empty form
  turnstileResetSignal: number; // changes after every response (tokens are single use)
  submit: (form: HTMLFormElement) => void;
  startOver: () => void;
} {
  const submissionId = useRef<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [{ result, responses }, dispatch, pending] = useActionState(
    async (prev: CaptureState, payload: FormData | typeof START_OVER): Promise<CaptureState> => {
      if (payload === START_OVER) return { result: IDLE, responses: prev.responses };
      const next = await action(prev.result, payload);
      if (next.status === "success") submissionId.current = null;
      return { result: next, responses: prev.responses + 1 };
    },
    INITIAL_STATE,
  );

  function submit(form: HTMLFormElement) {
    if (pending) return;
    submissionId.current ??= crypto.randomUUID();
    const data = new FormData(form);
    data.set("submissionId", submissionId.current);
    // Dispatch manually (not the form's action) so React does not reset the fields after an error.
    startTransition(() => dispatch(data));
  }

  function startOver() {
    submissionId.current = null;
    setFormKey((key) => key + 1);
    startTransition(() => dispatch(START_OVER));
  }

  return { state: result, pending, formKey, turnstileResetSignal: responses, submit, startOver };
}
