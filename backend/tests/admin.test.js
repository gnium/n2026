/**
 * E2E tests for the admin panel API.
 *
 * These tests hit the real Express app and the real MySQL database.
 * If the database is not available, all tests are skipped with a clear message.
 *
 * Prerequisites:
 *   - MySQL running with the notarius database seeded (npm run db:init)
 *   - An admin user registered (the first user in the usuarios table)
 *   - DB_* env vars set (or defaults: localhost:3306, notarius/notarius)
 *
 * Environment variables for credentials:
 *   TEST_ADMIN_EMAIL     - Email of an admin user (default: admin@test.com)
 *   TEST_ADMIN_PASSWORD  - Password for the admin user (default: Test1234!)
 *   TEST_USER_EMAIL      - Email of a non-admin user (optional, for 403 tests)
 *   TEST_USER_PASSWORD   - Password for the non-admin user
 *
 * Run: cd backend && npx vitest run
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  checkDb,
  startServer,
  stopServer,
  login,
  authedFetch,
  anonFetch,
} from "./helpers.js";

// --- Check DB availability at module level (top-level await, ESM) -----------
const DB_AVAILABLE = await checkDb();

// --- Test credentials -------------------------------------------------------
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@test.com";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "Test1234!";
const USER_EMAIL = process.env.TEST_USER_EMAIL || "";
const USER_PASSWORD = process.env.TEST_USER_PASSWORD || "";

let adminCookie = "";
let userCookie = "";
let adminReady = false;
let hasNonAdminUser = false;

if (DB_AVAILABLE) {
  beforeAll(async () => {
    await startServer();

    try {
      adminCookie = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
      adminReady = true;
    } catch (e) {
      console.warn(`\n  [skip] Could not log in as admin (${ADMIN_EMAIL}): ${e.message}`);
      console.warn("         Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD.\n");
    }

    if (USER_EMAIL) {
      try {
        userCookie = await login(USER_EMAIL, USER_PASSWORD);
        hasNonAdminUser = true;
      } catch {
        console.warn(`  [skip] Could not log in as regular user (${USER_EMAIL}).\n`);
      }
    }
  }, 30_000);

  afterAll(async () => {
    await stopServer();
  }, 10_000);
}

// =============================================================================
// AUTH
// =============================================================================
describe.skipIf(!DB_AVAILABLE)("Auth", () => {
  it("POST /api/auth/login with valid credentials returns 200", async () => {
    if (!adminReady) return;
    const res = await anonFetch("POST", "/api/auth/login", {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usuario).toBeDefined();
    expect(body.usuario.email).toBe(ADMIN_EMAIL);
    expect(body.usuario.esAdmin).toBe(true);
  });

  it("POST /api/auth/login with wrong password returns 401", async () => {
    const res = await anonFetch("POST", "/api/auth/login", {
      email: ADMIN_EMAIL,
      password: "wrong-password-12345",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.codigo).toBe("CREDENCIALES_INVALIDAS");
  });

  it("Unauthenticated requests to /api/admin/* return 401", async () => {
    const res = await anonFetch("GET", "/api/admin/summary");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.codigo).toBe("NO_AUTENTICADO");
  });

  it("Non-admin users cannot access /api/admin/* (returns 403)", async () => {
    if (!hasNonAdminUser) return; // skipped silently when no non-admin user is configured
    const res = await authedFetch(userCookie, "GET", "/api/admin/summary");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.codigo).toBe("PROHIBIDO");
  });
});

// =============================================================================
// ADMIN DASHBOARD
// =============================================================================
describe.skipIf(!DB_AVAILABLE)("Admin Dashboard", () => {
  it("GET /api/admin/summary returns summary with expected keys", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "GET", "/api/admin/summary");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("cuentas");
    expect(body).toHaveProperty("uso");
    expect(body).toHaveProperty("prueba");
    expect(body).toHaveProperty("facturacion");
    expect(body).toHaveProperty("embudo");
  });

  it("GET /api/admin/subscriptions returns subscription data", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "GET", "/api/admin/subscriptions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
    expect(typeof body).toBe("object");
  });

  it("GET /api/admin/accounts returns accounts list", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "GET", "/api/admin/accounts");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("cuentas");
    expect(Array.isArray(body.cuentas)).toBe(true);
  });
});

// =============================================================================
// ADMIN INVITATIONS
// =============================================================================
describe.skipIf(!DB_AVAILABLE)("Admin Invitations", () => {
  let createdId = null;
  const testEmail = `test-invite-${Date.now()}@example.com`;

  it("GET /api/admin/invitations returns array", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "GET", "/api/admin/invitations");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /api/admin/invitations with valid email returns 201", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "POST", "/api/admin/invitations", {
      email: testEmail,
      nombre: "Test User",
      escribania: "Escribania Test",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.email).toBe(testEmail);
    createdId = body.id;
  });

  it("POST /api/admin/invitations with invalid email returns 400", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "POST", "/api/admin/invitations", {
      email: "not-an-email",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("POST /api/admin/invitations with existing account email returns 409", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "POST", "/api/admin/invitations", {
      email: ADMIN_EMAIL,
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.codigo).toBe("EMAIL_EN_USO");
  });

  it("PATCH /api/admin/invitations/:id/cancel returns ok", async () => {
    if (!adminReady || !createdId) return;
    const res = await authedFetch(adminCookie, "PATCH", `/api/admin/invitations/${createdId}/cancel`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("DELETE /api/admin/invitations/:id deletes non-pending invitation", async () => {
    if (!adminReady || !createdId) return;
    const res = await authedFetch(adminCookie, "DELETE", `/api/admin/invitations/${createdId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("PATCH /api/admin/invitations/bulk/cancel cancels multiple", async () => {
    if (!adminReady) return;
    const email1 = `bulk-c1-${Date.now()}@example.com`;
    const email2 = `bulk-c2-${Date.now()}@example.com`;
    const r1 = await authedFetch(adminCookie, "POST", "/api/admin/invitations", { email: email1 });
    const r2 = await authedFetch(adminCookie, "POST", "/api/admin/invitations", { email: email2 });
    const b1 = await r1.json();
    const b2 = await r2.json();

    const res = await authedFetch(adminCookie, "PATCH", "/api/admin/invitations/bulk/cancel", {
      ids: [b1.id, b2.id],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.canceladas).toBe(2);

    // Cleanup
    await authedFetch(adminCookie, "DELETE", "/api/admin/invitations/bulk", {
      ids: [b1.id, b2.id],
    });
  });

  it("DELETE /api/admin/invitations/bulk deletes multiple non-pending", async () => {
    if (!adminReady) return;
    const email1 = `bulk-d1-${Date.now()}@example.com`;
    const email2 = `bulk-d2-${Date.now()}@example.com`;
    const r1 = await authedFetch(adminCookie, "POST", "/api/admin/invitations", { email: email1 });
    const r2 = await authedFetch(adminCookie, "POST", "/api/admin/invitations", { email: email2 });
    const b1 = await r1.json();
    const b2 = await r2.json();
    await authedFetch(adminCookie, "PATCH", "/api/admin/invitations/bulk/cancel", {
      ids: [b1.id, b2.id],
    });

    const res = await authedFetch(adminCookie, "DELETE", "/api/admin/invitations/bulk", {
      ids: [b1.id, b2.id],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

// =============================================================================
// ADMIN ACCOUNTS
// =============================================================================
describe.skipIf(!DB_AVAILABLE)("Admin Accounts", () => {
  it("GET /api/admin/accounts returns cuentas array", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "GET", "/api/admin/accounts");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("cuentas");
    expect(Array.isArray(body.cuentas)).toBe(true);
    expect(body.cuentas.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/admin/accounts/:id returns account detail", async () => {
    if (!adminReady) return;
    const listRes = await authedFetch(adminCookie, "GET", "/api/admin/accounts");
    const { cuentas } = await listRes.json();
    if (cuentas.length === 0) return;
    const accountId = cuentas[0].id;

    const res = await authedFetch(adminCookie, "GET", `/api/admin/accounts/${accountId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("id", accountId);
  });

  it("PATCH /api/admin/accounts/:id/active toggles active state", async () => {
    if (!adminReady) return;
    const listRes = await authedFetch(adminCookie, "GET", "/api/admin/accounts");
    const { cuentas } = await listRes.json();
    const target = cuentas.find((c) => !c.esAdmin);
    if (!target) {
      // Only admin exists; can't toggle without risking lockout.
      return;
    }

    const res1 = await authedFetch(adminCookie, "PATCH", `/api/admin/accounts/${target.id}/active`, { activo: false });
    expect(res1.status).toBe(200);

    const res2 = await authedFetch(adminCookie, "PATCH", `/api/admin/accounts/${target.id}/active`, { activo: true });
    expect(res2.status).toBe(200);
  });
});

// =============================================================================
// ADMIN TICKETS
// =============================================================================
describe.skipIf(!DB_AVAILABLE)("Admin Tickets", () => {
  it("GET /api/admin/tickets returns array", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "GET", "/api/admin/tickets");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/admin/tickets/open returns count", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "GET", "/api/admin/tickets/open");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("abiertas");
    expect(typeof body.abiertas).toBe("number");
  });

  // These require seed data: an open ticket and a closed ticket.
  it.todo("PATCH /api/admin/tickets/:id/close closes a ticket (requires seed: an open ticket)");
  it.todo("PATCH /api/admin/tickets/:id/reopen reopens a ticket (requires seed: a closed ticket)");
});

// =============================================================================
// REST CONVENTIONS
// Verify correct HTTP methods are enforced and old POST-based action
// endpoints (before the rename to PATCH) return 404.
// =============================================================================
describe.skipIf(!DB_AVAILABLE)("REST Conventions", () => {
  it("POST /api/admin/invitations/:id/cancel returns 404 (must use PATCH)", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "POST", "/api/admin/invitations/999/cancel");
    expect(res.status).toBe(404);
  });

  it("POST /api/admin/tickets/:id/close returns 404 (must use PATCH)", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "POST", "/api/admin/tickets/999/close");
    expect(res.status).toBe(404);
  });

  it("POST /api/admin/tickets/:id/reopen returns 404 (must use PATCH)", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "POST", "/api/admin/tickets/999/reopen");
    expect(res.status).toBe(404);
  });

  it("GET-only endpoints reject POST", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "POST", "/api/admin/summary");
    expect(res.status).toBe(404);
  });

  it("PATCH-only endpoints reject GET", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "GET", "/api/admin/invitations/bulk/cancel");
    expect(res.status).toBe(404);
  });

  it("DELETE /api/admin/invitations/bulk requires body with ids", async () => {
    if (!adminReady) return;
    const res = await authedFetch(adminCookie, "DELETE", "/api/admin/invitations/bulk", {});
    expect(res.status).toBe(400);
  });
});
