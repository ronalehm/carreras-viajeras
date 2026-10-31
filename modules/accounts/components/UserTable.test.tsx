import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { UserListItem } from "../types/userDirectory.types";
import { UserTable } from "./UserTable";

const user: UserListItem = {
  userId: "user_1", name: "Ana Pérez", email: "ana@example.com", roles: [], sponsorName: null,
  isRunner: true, activeBookings: 0, status: "active",
};

afterEach(cleanup);

it("shows no Checkout column unless the page composes one", () => {
  render(<UserTable users={[user]} truncated={false} filtered={false} />);
  expect(screen.queryByRole("columnheader", { name: "Checkout" })).toBeNull();
});

it("renders the Checkout cell the page provides for each row", () => {
  render(<UserTable users={[user]} truncated={false} filtered={false} checkoutCell={(row) => <span>Estado de {row.email}</span>} />);
  expect(screen.getByRole("columnheader", { name: "Checkout" })).toBeTruthy();
  const row = screen.getByRole("row", { name: /Ana Pérez/ });
  expect(within(row).getByText("Estado de ana@example.com")).toBeTruthy();
});
