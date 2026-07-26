import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("build emits the SAS People Vite application", async () => {
  await access(new URL("../dist/index.html", import.meta.url));
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /SAS People/);
  assert.match(html, /Employee Management and Onboarding Portal/);
  assert.match(html, /src="\/assets\/index-[^"]+\.js"/);
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
