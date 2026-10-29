// @vitest-environment node
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import {
  buildBackfillSql,
  CLERK_USERS_URL,
  fetchAllUsers,
  main,
  PAGE_SIZE,
  verifiedPrimaryEmail,
} from "./export-clerk-accounts.mjs";

const SCRIPT = path.join(import.meta.dirname, "export-clerk-accounts.mjs");
const SECRET = "sk_test_never-printed";

// Minimal Clerk Backend API user (snake_case, as the REST API answers).
function clerkUser(
  id: string,
  addresses: { id: string; email: string; status: string | null }[],
  primaryId: string | null = addresses[0]?.id ?? null,
) {
  return {
    id,
    primary_email_address_id: primaryId,
    first_name: "Nombre",
    phone_numbers: [{ phone_number: "+51999888777" }],
    email_addresses: addresses.map((address) => ({
      id: address.id,
      email_address: address.email,
      verification: address.status === null ? null : { status: address.status },
    })),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeFetch(pages: unknown[][]) {
  return vi.fn(async (input: string | URL | Request) => {
    void input;
    return jsonResponse(pages.shift() ?? []);
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

function sink() {
  let text = "";
  return {
    write: (chunk: string) => {
      text += chunk;
      return true;
    },
    get text() {
      return text;
    },
  };
}

describe("verifiedPrimaryEmail", () => {
  it("returns the lowercased, trimmed primary email when verified", () => {
    expect(
      verifiedPrimaryEmail(clerkUser("user_1", [{ id: "idn_1", email: "  Ana@Example.COM ", status: "verified" }])),
    ).toBe("ana@example.com");
  });

  it.each([
    ["an unverified primary", clerkUser("u", [{ id: "a", email: "a@example.com", status: "unverified" }])],
    ["a primary without verification", clerkUser("u", [{ id: "a", email: "a@example.com", status: null }])],
    [
      "an unverified primary with a verified secondary",
      clerkUser(
        "u",
        [
          { id: "a", email: "a@example.com", status: "unverified" },
          { id: "b", email: "b@example.com", status: "verified" },
        ],
        "a",
      ),
    ],
    ["no primary address", clerkUser("u", [{ id: "a", email: "a@example.com", status: "verified" }], null)],
    ["no addresses", clerkUser("u", [])],
  ])("returns null for %s", (_, user) => {
    expect(verifiedPrimaryEmail(user)).toBeNull();
  });
});

describe("buildBackfillSql", () => {
  it("emits one INSERT … ON CONFLICT (user_id) DO NOTHING with verified primary emails only", () => {
    const sql = buildBackfillSql([
      clerkUser("user_ana", [{ id: "a", email: "Ana@Example.com", status: "verified" }]),
      clerkUser("user_unverified", [{ id: "b", email: "b@example.com", status: "unverified" }]),
      clerkUser("user_quote", [{ id: "c", email: "O'Brien@Example.com", status: "verified" }]),
      // Duplicates (pagination can repeat an account) appear once.
      clerkUser("user_ana", [{ id: "a", email: "ana@example.com", status: "verified" }]),
    ]);

    expect(sql).toBe(
      "INSERT INTO profiles (user_id, email) VALUES\n" +
        "  ('user_ana', 'ana@example.com'),\n" +
        "  ('user_quote', 'o''brien@example.com')\n" +
        "ON CONFLICT (user_id) DO NOTHING;\n",
    );
    expect(sql.match(/INSERT INTO/g)).toHaveLength(1);
    expect(sql.match(/;/g)).toHaveLength(1);
    expect(sql).not.toContain("b@example.com");
    // Only (user_id, email): no other Clerk field reaches the SQL.
    expect(sql).not.toMatch(/Nombre|\+51/);
  });

  it("escapes quotes in the user id too", () => {
    expect(
      buildBackfillSql([clerkUser("user_'); DROP TABLE profiles; --", [{ id: "a", email: "a@example.com", status: "verified" }])]),
    ).toContain("('user_''); DROP TABLE profiles; --', 'a@example.com')");
  });

  it("emits only an SQL comment when no account qualifies", () => {
    const sql = buildBackfillSql([clerkUser("u", [{ id: "a", email: "a@example.com", status: "unverified" }])]);
    expect(sql).toMatch(/^-- /);
    expect(sql).not.toContain("INSERT");
    expect(buildBackfillSql([])).not.toContain("INSERT");
  });
});

describe("fetchAllUsers", () => {
  it("pages GET /v1/users 100 at a time with the Bearer key until a short page", async () => {
    const first = Array.from({ length: PAGE_SIZE }, (_, i) =>
      clerkUser(`user_${i}`, [{ id: "a", email: `u${i}@example.com`, status: "verified" }]),
    );
    const second = [clerkUser("user_last", [{ id: "a", email: "last@example.com", status: "verified" }])];
    const fetchImpl = fakeFetch([first, second]);

    await expect(fetchAllUsers(SECRET, fetchImpl)).resolves.toHaveLength(PAGE_SIZE + 1);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, `${CLERK_USERS_URL}?limit=100&offset=0`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, `${CLERK_USERS_URL}?limit=100&offset=100`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    expect(CLERK_USERS_URL).toBe("https://api.clerk.com/v1/users");
  });

  it("rejects a non-2xx answer with a fixed message", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ errors: [{ message: "secret" }] }, 401));
    await expect(fetchAllUsers(SECRET, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      "la API de Clerk respondió 401.",
    );
  });
});

describe("main", () => {
  it("without CLERK_SECRET_KEY → exit code 1, fixed message and no request", async () => {
    const fetchImpl = fakeFetch([]);
    const stdout = sink();
    const stderr = sink();

    await expect(main({ env: { CLERK_SECRET_KEY: "  " }, fetchImpl, stdout, stderr })).resolves.toBe(1);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(stdout.text).toBe("");
    expect(stderr.text).toBe("export-clerk-accounts: falta CLERK_SECRET_KEY en el entorno del proceso.\n");
  });

  it("writes the SQL to stdout and never prints the key", async () => {
    const fetchImpl = fakeFetch([[clerkUser("user_ana", [{ id: "a", email: "Ana@Example.com", status: "verified" }])]]);
    const stdout = sink();
    const stderr = sink();

    await expect(main({ env: { CLERK_SECRET_KEY: SECRET }, fetchImpl, stdout, stderr })).resolves.toBe(0);

    expect(stdout.text).toBe(
      "INSERT INTO profiles (user_id, email) VALUES\n  ('user_ana', 'ana@example.com')\nON CONFLICT (user_id) DO NOTHING;\n",
    );
    expect(stderr.text).toBe("");
    expect(stdout.text + stderr.text).not.toContain(SECRET);
  });

  it("on a Clerk failure → exit code 1 with a fixed message, without the key or the body", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(`connect failed with ${SECRET}`);
    }) as unknown as typeof fetch;
    const stdout = sink();
    const stderr = sink();

    await expect(main({ env: { CLERK_SECRET_KEY: SECRET }, fetchImpl, stdout, stderr })).resolves.toBe(1);

    expect(stdout.text).toBe("");
    expect(stderr.text).toBe("export-clerk-accounts: no se pudo conectar con la API de Clerk.\n");
  });

  it("as a process without CLERK_SECRET_KEY exits with code 1 and prints no values", async () => {
    const run = promisify(execFile);
    const failure = await run(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH, NODE_ENV: "test" } }).catch(
      (error: { code: number; stdout: string; stderr: string }) => error,
    );

    expect(failure).toMatchObject({
      code: 1,
      stdout: "",
      stderr: "export-clerk-accounts: falta CLERK_SECRET_KEY en el entorno del proceso.\n",
    });
  });
});
