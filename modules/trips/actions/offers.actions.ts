"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission, type CurrentUser } from "@/lib/auth/guards";
import { createOfferSchema, offerTransitionSchema, updateOfferSchema } from "../schemas/offers.schema";
import {
  activateOffer,
  approveOffer,
  closeOffer,
  createOfferDraft,
  createOfferVersionFrom,
  getOfferById,
  listOffers,
  updateOfferDraft,
} from "../services/offers.service";
import type { OfferActionState, OfferListItem } from "../types/offers.types";
import { formatTripDate } from "../utils/tripDisplay";

const OFFERS_PATH = "/crm/ofertas";
// Literal paths: revalidatePath only needs the route file (route group included) for patterns.
const offerPath = (id: string) => `${OFFERS_PATH}/${id}`;

type OfferActionErrorCode = Extract<OfferActionState, { status: "error" }>["code"];
// not_started carries the start date of the version: its message is built in notStartedFailure.
type FixedErrorCode = Exclude<OfferActionErrorCode, "not_started">;

const ERROR_MESSAGES: Record<FixedErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  forbidden: "No tienes permiso para gestionar ofertas.",
  invalid_input: "Revisa los campos marcados.",
  invalid_trip: "Elige un viaje del catálogo.",
  invalid_campaign: "Elige una campaña activa de ese viaje.",
  // Fallback when the pending version is no longer found: pendingExistsFailure adds "(vN)".
  pending_exists: "Ya hay una versión pendiente de esta oferta. Ábrela o descártala.",
  not_found: "La oferta ya no existe. Recarga la página.",
  not_draft: "Esta versión ya está aprobada y no se puede editar. Crea una versión nueva.",
  invalid_transition: "La oferta ya no está en ese estado. Recarga la página.",
  expired: "La vigencia ya terminó. Crea una versión nueva.",
  trip_archived: "El viaje está archivado.",
  campaign_closed: "La campaña está cerrada.",
};

const CREATE_FIELDS = Object.keys(createOfferSchema.shape);
const UPDATE_FIELDS = Object.keys(updateOfferSchema.shape);
const TRANSITION_FIELDS = Object.keys(offerTransitionSchema.shape);

function failure(
  code: FixedErrorCode,
  values?: Record<string, string>,
  fieldErrors?: Record<string, string[]>,
): OfferActionState {
  return {
    status: "error",
    code,
    message: ERROR_MESSAGES[code],
    ...(values && { values }),
    ...(fieldErrors && { fieldErrors }),
  };
}

// Echo only this action's known string fields, never files or arbitrary submitted keys.
function formValues(formData: FormData, fields: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = formData.get(field);
      return typeof value === "string" ? [[field, value]] : [];
    }),
  );
}

// The schema messages are fixed Spanish texts: they never repeat what was typed.
function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) (result[String(issue.path[0])] ??= []).push(issue.message);
  return result;
}

// Fixed text, no cause and no console output: Drizzle/Neon errors carry the statement and its
// parameters (a concurrent activation hitting the unique index included, Decision 4), so the
// original error never leaves this module.
function actionFailed(): never {
  throw new Error("offer action failed");
}

async function runService<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch {
    return actionFailed();
  }
}

type Prepared<Input> = { actor: CurrentUser; input: Input; values: Record<string, string> };

// guard → validation. The schema drops status, version, finalPriceUsd, audit columns and any other
// submitted key; the author of every write is the session user.
async function prepare<Input>(
  formData: FormData,
  schema: z.ZodType<Input>,
  fields: readonly string[],
): Promise<Prepared<Input> | OfferActionState> {
  let actor: CurrentUser;
  try {
    actor = await requirePermission("offers.manage");
  } catch (error) {
    if (error instanceof UnauthorizedError) return failure("unauthorized");
    if (error instanceof ForbiddenError) return failure("forbidden");
    return actionFailed();
  }

  const values = formValues(formData, fields);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("invalid_input", values, toFieldErrors(parsed.error));
  return { actor, input: parsed.data, values };
}

function revalidateOffer(offerId: string) {
  revalidatePath(OFFERS_PATH);
  revalidatePath(offerPath(offerId));
}

// The service only says "not_started": the start date comes from the stored version, never the form.
async function notStartedFailure(
  offerId: string,
  values: Record<string, string>,
): Promise<OfferActionState> {
  const offer = await runService(() => getOfferById(offerId));
  if (!offer) return failure("not_found", values);
  return {
    status: "error",
    code: "not_started",
    message: `La vigencia aún no ha empezado. Actívala a partir del ${formatTripDate(offer.validFrom)}.`,
    values,
  };
}

const isPending = (offer: OfferListItem) => offer.status === "draft" || offer.status === "approved";

// The service only says "pending_exists": the version number comes from a second read. If that read
// no longer finds it (a concurrent discard or approval race), the message goes without the number.
async function pendingExistsFailure(
  findPending: () => Promise<OfferListItem | undefined>,
  values: Record<string, string>,
): Promise<OfferActionState> {
  const pending = await runService(findPending);
  if (!pending) return failure("pending_exists", values);
  return {
    status: "error",
    code: "pending_exists",
    message: `Ya hay una versión pendiente (v${pending.version}) de esta oferta. Ábrela o descártala.`,
    values,
  };
}

export async function createOfferAction(
  _prev: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  const prepared = await prepare(formData, createOfferSchema, CREATE_FIELDS);
  if ("status" in prepared) return prepared;
  const { actor, input, values } = prepared;

  const result = await runService(() => createOfferDraft(input, actor.id));
  if (result === "invalid_trip") return failure(result, values, { tripId: [ERROR_MESSAGES[result]] });
  if (result === "invalid_campaign") {
    return failure(result, values, { campaignId: [ERROR_MESSAGES[result]] });
  }
  if (result === "pending_exists") {
    return pendingExistsFailure(
      async () =>
        (await listOffers()).find(
          (offer) =>
            offer.trip.id === input.tripId &&
            (offer.campaign?.id ?? null) === input.campaignId &&
            isPending(offer),
        ),
      values,
    );
  }

  revalidatePath(OFFERS_PATH);
  // Next's redirect throws: it stays outside the service's try/catch.
  redirect(offerPath(result.id));
}

// Only a draft is edited: the service decides with status = 'draft' in its WHERE.
export async function updateOfferAction(
  _prev: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  const prepared = await prepare(formData, updateOfferSchema, UPDATE_FIELDS);
  if ("status" in prepared) return prepared;
  const {
    input: { id, ...input },
    values,
  } = prepared;

  const result = await runService(() => updateOfferDraft(id, input));
  if (result !== "updated") return failure(result, values);

  revalidatePath(offerPath(id));
  return { status: "success", message: "Borrador guardado." };
}

// Copies the conditions of an approved, active or closed version into a new draft of its scope.
export async function createOfferVersionAction(
  _prev: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  const prepared = await prepare(formData, offerTransitionSchema, TRANSITION_FIELDS);
  if ("status" in prepared) return prepared;
  const { actor, input: { offerId }, values } = prepared;

  const result = await runService(() => createOfferVersionFrom(offerId, actor.id));
  if (result === "not_found") return failure(result, values);
  if (result === "pending_exists") {
    return pendingExistsFailure(async () => (await getOfferById(offerId))?.history.find(isPending), values);
  }

  revalidateOffer(offerId);
  redirect(offerPath(result.id));
}

export async function approveOfferAction(
  _prev: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  const prepared = await prepare(formData, offerTransitionSchema, TRANSITION_FIELDS);
  if ("status" in prepared) return prepared;
  const { actor, input: { offerId }, values } = prepared;

  const result = await runService(() => approveOffer(offerId, actor.id));
  if (result !== "approved") return failure(result, values);

  revalidateOffer(offerId);
  return { status: "success", message: "Versión aprobada. Ya no se puede editar." };
}

export async function activateOfferAction(
  _prev: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  const prepared = await prepare(formData, offerTransitionSchema, TRANSITION_FIELDS);
  if ("status" in prepared) return prepared;
  const { actor, input: { offerId }, values } = prepared;

  const result = await runService(() => activateOffer(offerId, actor.id));
  if (result === "not_started") return notStartedFailure(offerId, values);
  if (result !== "activated") return failure(result, values);

  revalidateOffer(offerId);
  return { status: "success", message: "Oferta activa." };
}

// Close (active) or discard (draft, approved): closed is final.
export async function closeOfferAction(
  _prev: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  const prepared = await prepare(formData, offerTransitionSchema, TRANSITION_FIELDS);
  if ("status" in prepared) return prepared;
  const { actor, input: { offerId }, values } = prepared;

  const result = await runService(() => closeOffer(offerId, actor.id));
  if (result !== "closed") return failure(result, values);

  revalidateOffer(offerId);
  return { status: "success", message: "Oferta cerrada." };
}
