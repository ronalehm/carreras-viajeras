import { authErrorResponse } from "@/lib/auth/errors";
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
    return authErrorResponse(error);
  }
}
