import { authErrorResponse, ForbiddenError } from "@/lib/auth/errors";
import { requireCrmUser } from "@/lib/auth/guards";

// Identity comes from Clerk; roles only from the database.
export async function GET() {
  try {
    const user = await requireCrmUser();
    return Response.json(
      { userId: user.id, staffRoles: user.staffRoles },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Self-check for a signed-in account: a fixed reason code, never the underlying error.
    if (error instanceof ForbiddenError && error.reason) {
      return Response.json(
        { error: "forbidden", reason: error.reason, ...(error.detail ? { detail: error.detail } : {}) },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    return authErrorResponse(error);
  }
}
