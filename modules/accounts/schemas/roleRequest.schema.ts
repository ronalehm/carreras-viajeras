import { z } from "zod";

// Approve/reject forms only send the request id; z.object drops any other field (actor, role, status…).
export const roleRequestIdSchema = z.object({
  requestId: z.uuid(),
});
