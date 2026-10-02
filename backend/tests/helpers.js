/**
 * Test helpers for E2E API tests.
 *
 * Starts the Express app on a random port, provides login and authenticated
 * fetch utilities. Uses Node 20 built-in fetch. Connects to the real database
 * (dev MySQL) through the same config the app uses.
 */
import { verificarConexion, pool } from "../src/config/db.js";
import { asegurarTablasAuth } from "../src/auth/repositorio.js";

let server = null;
let baseUrl = "";

/**
 * Checks whether the database is reachable. Runs synchronously-ish via
 * top-level await in the test file.
 */
export async function checkDb() {
  try {
    await verificarConexion();
    await asegurarTablasAuth();
    return true;
  } catch (e) {
    console.warn(`\n  [test] MySQL not available (${e.code || e.message}).`);
    console.warn("         Start MySQL and set DB_* env vars to run E2E tests.\n");
    return false;
  }
}

/**
 * Starts the Express app on a random port. Call once in a top-level beforeAll.
 * Requires the DB to be available (call checkDb first).
 */
export async function startServer() {
  if (server) return baseUrl;

  // Dynamic import to avoid loading all route modules when the DB is not available.
  const { app } = await import("../src/app.js");

  return new Promise((resolve, reject) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`  [test] Server listening on ${baseUrl}`);
      resolve(baseUrl);
    });
    server.on("error", reject);
  });
}

/**
 * Stops the server and closes the DB pool. Call in a top-level afterAll.
 */
export async function stopServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
  await pool.end().catch(() => {});
}

/**
 * Logs in with the given credentials and returns the raw cookie string
 * to use in subsequent requests (e.g. "notarius_sesion=xxx").
 */
export async function login(email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Login failed (${res.status}): ${JSON.stringify(body)}`);
  }
  const cookies = res.headers.getSetCookie?.() || [];
  const sessionCookie = cookies.find((c) => c.startsWith("notarius_sesion="));
  if (!sessionCookie) throw new Error("Login succeeded but no session cookie was set");
  return sessionCookie.split(";")[0];
}

/**
 * Makes an authenticated HTTP request to the API.
 */
export async function authedFetch(cookie, method, path, body) {
  const headers = {
    Cookie: cookie,
    "Sec-Fetch-Site": "same-origin",
  };
  const opts = { method, headers, redirect: "manual" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  return fetch(`${baseUrl}${path}`, opts);
}

/**
 * Makes an unauthenticated HTTP request to the API.
 */
export async function anonFetch(method, path, body) {
  const headers = { "Sec-Fetch-Site": "same-origin" };
  const opts = { method, headers, redirect: "manual" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  return fetch(`${baseUrl}${path}`, opts);
}

export function getBaseUrl() {
  return baseUrl;
}
