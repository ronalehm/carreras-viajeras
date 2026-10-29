import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./RunnerProfileForm", () => ({ RunnerProfileForm: () => <form aria-label="Editar mi perfil" /> }));
vi.mock("./SignOutButton", () => ({ SignOutButton: () => <button>Cerrar sesión</button> }));

import { RunnerProfilePanel } from "./RunnerProfilePanel";

afterEach(cleanup);

describe("RunnerProfilePanel hub", () => {
  it("composes the account with one h1 and real careers/rewards sections", () => {
    render(
      <RunnerProfilePanel
        state={{ status: "ok", email: "runner@example.com", today: "2026-10-29", profile: null }}
        careers={<section id="mis-carreras">Mis reservas propias</section>}
      >
        <section id="beneficios">Mis beneficios propios</section>
        <section id="referidos">Mis referidos propios</section>
      </RunnerProfilePanel>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mi cuenta");
    expect(screen.getByRole("navigation", { name: "Mi cuenta" })).toBeTruthy();
    for (const [label, href] of [["Mis carreras", "#mis-carreras"], ["Beneficios", "#beneficios"], ["Referidos", "#referidos"], ["Mi perfil", "#mi-perfil"]]) {
      expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(href);
    }
    expect(screen.getByRole("form", { name: "Editar mi perfil" })).toBeTruthy();
  });

  it.each(["unverified", "error"] as const)("does not render private slots while the account is %s", (status) => {
    render(
      <RunnerProfilePanel
        state={status === "unverified" ? { status, email: "runner@example.com" } : { status }}
        careers={<p>Private race data</p>}
      >
        <p>Private reward data</p>
      </RunnerProfilePanel>,
    );
    expect(screen.queryByText("Private race data")).toBeNull();
    expect(screen.queryByText("Private reward data")).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Mi cuenta" })).toBeNull();
  });
});
