import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReferralCode } from "./ReferralCode";
afterEach(cleanup);
it("copies only on user request and handles clipboard failure", async () => {
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("denied"));
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<ReferralCode code="opaque-code" url="https://carreras-viajeras.mentec.dev/r/opaque-code" />);
  expect(writeText).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));
  await screen.findByRole("status");
  expect(writeText).toHaveBeenCalledWith("https://carreras-viajeras.mentec.dev/r/opaque-code");
  fireEvent.click(screen.getByRole("button", { name: "Copiar código" }));
  expect((await screen.findByRole("alert")).textContent).toContain("cópialo a mano");
});
