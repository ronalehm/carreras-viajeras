// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission, type CurrentUser } from "@/lib/auth/guards";
import { getCrmAccess } from "./crmAccess";

const requirePermissionMock = vi.mocked(requirePermission);

beforeEach(() => {
  requirePermissionMock.mockReset();
});

describe("getCrmAccess", () => {
  it("maps UnauthorizedError to unauthenticated", async () => {
    requirePermissionMock.mockRejectedValue(new UnauthorizedError());

    await expect(getCrmAccess()).resolves.toEqual({ status: "unauthenticated" });
  });

  it("maps ForbiddenError to forbidden", async () => {
    requirePermissionMock.mockRejectedValue(new ForbiddenError());

    await expect(getCrmAccess()).resolves.toEqual({ status: "forbidden" });
  });

  it("returns ok with the user when access is granted", async () => {
    const user: CurrentUser = {
      id: "user-1",
      email: "ana@example.com",
      emailVerified: true,
      staffRoles: ["admin"],
    };
    requirePermissionMock.mockResolvedValue(user);

    await expect(getCrmAccess()).resolves.toEqual({ status: "ok", user });
  });

  it("rethrows any other error", async () => {
    const error = new Error("unexpected");
    requirePermissionMock.mockRejectedValue(error);

    await expect(getCrmAccess()).rejects.toBe(error);
  });

  it("checks crm.access when called without a permission", async () => {
    requirePermissionMock.mockRejectedValue(new ForbiddenError());

    await getCrmAccess();

    expect(requirePermissionMock).toHaveBeenCalledExactlyOnceWith("crm.access");
  });

  it("checks the given permission", async () => {
    requirePermissionMock.mockRejectedValue(new ForbiddenError());

    await getCrmAccess("staff.manage");

    expect(requirePermissionMock).toHaveBeenCalledExactlyOnceWith("staff.manage");
  });

  it("maps a ForbiddenError for staff.manage (commercial) to forbidden", async () => {
    requirePermissionMock.mockRejectedValue(new ForbiddenError());

    await expect(getCrmAccess("staff.manage")).resolves.toEqual({ status: "forbidden" });
  });
});
