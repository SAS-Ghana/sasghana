import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server renders the SAS People application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /SAS People/);
  assert.match(html, /Employee Management and Onboarding Portal/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("authentication uses Supabase and contains no embedded password", async () => {
  const [auth, app] = await Promise.all([
    readFile(new URL("../app/lib/supabase-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sas-people-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /\/auth\/v1\/token\?grant_type=password/);
  assert.match(auth, /\/auth\/v1\/user/);
  assert.match(app, /changePassword/);
  assert.doesNotMatch(`${auth}\n${app}`, /password\s*=\s*["'][^"']+["']/i);
});
