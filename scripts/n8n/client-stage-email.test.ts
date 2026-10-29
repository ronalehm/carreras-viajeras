// @vitest-environment node
import { describe, expect, it } from "vitest";
import workflow from "./client-stage-email.json";
describe("SMTP workflow", () => {
  it("uses one editable CRM origin compatible with the user's Docker instance and Community edition", () => {
    const connection = workflow.nodes.find(
      (node) => node.name === "CRM connection",
    )!;
    expect(connection.parameters.assignments?.assignments[0].value).toBe(
      "http://host.docker.internal:3000",
    );
    expect(JSON.stringify(workflow)).not.toContain("$vars");
    expect(JSON.stringify(workflow)).not.toContain("$env");
    expect(
      workflow.nodes
        .filter((node) => node.type === "n8n-nodes-base.httpRequest")
        .every((node) =>
          node.parameters.url?.includes(
            "$('CRM connection').first().json.crmOrigin",
          ),
        ),
    ).toBe(true);
  });
  it("imports inactive without embedded credentials and requires a current server authorization", () => {
    expect(workflow.active).toBe(false);
    expect(workflow.nodes.some((node) => "credentials" in node)).toBe(false);
    const smtp = workflow.nodes.find((node) => node.name === "Send SMTP once")!;
    expect(smtp.retryOnFail).toBe(false);
    expect(smtp.parameters).toMatchObject({
      fromEmail: "={{ $json.message.from }}",
      toEmail: "={{ $json.message.to }}",
      emailFormat: "text",
    });
    expect(workflow.connections["Authorize email"].main[0][0].node).toBe(
      "Envío autorizado?",
    );
    expect(workflow.connections["Envío autorizado?"].main[1]).toEqual([]);
    expect(
      workflow.nodes.find(
        (node) => node.name === "SMTP aceptó al destinatario?",
      )?.parameters.conditions?.conditions[0].leftValue,
    ).toContain("$json.accepted");
  });
  it("retries only callbacks and keeps ambiguous outcomes separate from acceptance", () => {
    expect(workflow.connections["Record unknown outcome"].main[0][0].node).toBe(
      "Revisar ejecución",
    );
    expect(
      workflow.nodes.find((node) => node.name === "Revisar ejecución")?.type,
    ).toBe("n8n-nodes-base.stopAndError");
    expect(workflow.settings.saveDataErrorExecution).toBe("all");
    expect(
      workflow.nodes
        .filter((node) => node.retryOnFail)
        .map((node) => node.name),
    ).toEqual(["Confirm accepted", "Record unknown outcome"]);
    expect(
      workflow.connections["SMTP aceptó al destinatario?"].main[1][0].node,
    ).toBe("Record unknown outcome");
    expect(workflow.settings.saveDataSuccessExecution).toBe("none");
    expect(
      workflow.nodes.find((node) => node.name === "Record unknown outcome")
        ?.parameters.jsonBody,
    ).toContain("smtp_unknown");
  });
});
