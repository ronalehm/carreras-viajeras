"use client";

import { startTransition, useActionState, useRef, type FormEvent } from "react";
import type { BookingActionState } from "../types/bookings.types";

type BookingAction = (prev: BookingActionState, formData: FormData) => Promise<BookingActionState>;

const INITIAL_STATE: BookingActionState = { status: "idle" };

// Submits through onSubmit, so React does not reset <form action={…}> and a rejected submission keeps
// what was typed. With resetOnSuccess the fields clear once the action succeeds.
export function useBookingActionForm(action: BookingAction, { resetOnSuccess = false } = {}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: BookingActionState, formData: FormData) => {
    const next = await action(prev, formData);
    if (resetOnSuccess && next.status === "success") formRef.current?.reset();
    return next;
  }, INITIAL_STATE);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;
  return { formRef, onSubmit, state, pending, errors, values };
}
