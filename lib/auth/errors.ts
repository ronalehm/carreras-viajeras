import "server-only";

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
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
