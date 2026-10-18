// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireCrmUser: vi.fn() }));

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requireCrmUser, type CurrentUser } from "@/lib/auth/guards";
import { getCrmAccess } from "./crmAccess";

const requireCrmUserMock = vi.mocked(requireCrmUser);

beforeEach(() => {
  requireCrmUserMock.mockReset();
});

describe("getCrmAccess", () => {
  it("maps UnauthorizedError to unauthenticated", async () => {
    requireCrmUserMock.mockRejectedValue(new UnauthorizedError());

    await expect(getCrmAccess()).resolves.toEqual({ status: "unauthenticated" });
  });

  it("maps ForbiddenError to forbidden", async () => {
    requireCrmUserMock.mockRejectedValue(new ForbiddenError());

    await expect(getCrmAccess()).resolves.toEqual({ status: "forbidden" });
  });

  it("returns ok with the user when access is granted", async () => {
    const user: CurrentUser = {
      id: "user-1",
      email: "ana@example.com",
      emailVerified: true,
      staffRoles: ["admin"],
    };
    requireCrmUserMock.mockResolvedValue(user);

    await expect(getCrmAccess()).resolves.toEqual({ status: "ok", user });
  });

  it("rethrows any other error", async () => {
    const error = new Error("unexpected");
    requireCrmUserMock.mockRejectedValue(error);

    await expect(getCrmAccess()).rejects.toBe(error);
  });
});
