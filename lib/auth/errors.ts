import "server-only";

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

// Why access was denied: a fixed code, never data. Only /api/crm/me shows it, to the signed-in user.
export type ForbiddenReason =
  | "user_lookup_failed"
  | "role_lookup_failed"
  | "email_unverified"
  | "missing_permission";

// detail: a PostgreSQL SQLSTATE (5 characters) or "configuration"; never a message or data.
export class ForbiddenError extends Error {
  constructor(
    readonly reason?: ForbiddenReason,
    readonly detail?: string,
  ) {
    super("forbidden");
    this.name = "ForbiddenError";
  }
}

const NO_STORE = { "Cache-Control": "no-store" };

export function authErrorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  if (error instanceof ForbiddenError) {
    return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  throw error;
}
