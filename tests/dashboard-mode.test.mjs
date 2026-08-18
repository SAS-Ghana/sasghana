import assert from "node:assert/strict";
import test from "node:test";
import { resolveDashboardMode } from "../app/lib/dashboard-mode.ts";

function profile(account_type, roles = []) {
  return { account_type, roles };
}

test("administrator account_type routes to admin", () => {
  assert.equal(resolveDashboardMode(profile("administrator")), "admin");
});

test("SAS System Administrator role routes to admin regardless of account_type", () => {
  assert.equal(
    resolveDashboardMode(profile("employee", ["SAS System Administrator"])),
    "admin",
  );
});

test("hr account_type routes to hr", () => {
  assert.equal(resolveDashboardMode(profile("hr")), "hr");
});

test("a role name matching the HR regex routes to hr", () => {
  assert.equal(
    resolveDashboardMode(profile("employee", ["Human Resources Administrator"])),
    "hr",
  );
});

test("manager account_type routes to manager", () => {
  assert.equal(resolveDashboardMode(profile("manager")), "manager");
});

test("a role name matching the manager regex routes to manager", () => {
  assert.equal(resolveDashboardMode(profile("employee", ["Team Lead"])), "manager");
});

test("auditor account_type routes to auditor, not admin", () => {
  // Regression test: this used to silently fall through to the admin dashboard
  // because isEmployeeOnly excluded auditor without a matching branch below it.
  assert.equal(resolveDashboardMode(profile("auditor")), "auditor");
});

test("a role name matching the auditor regex routes to auditor", () => {
  assert.equal(resolveDashboardMode(profile("employee", ["Read Only"])), "auditor");
});

test("no matching account_type or role routes to employee", () => {
  assert.equal(resolveDashboardMode(profile("employee")), "employee");
  assert.equal(resolveDashboardMode(profile("receptionist")), "employee");
});

test("admin takes precedence over every other role on the same profile", () => {
  assert.equal(
    resolveDashboardMode(
      profile("administrator", ["Human Resources Administrator", "Manager", "Auditor"]),
    ),
    "admin",
  );
});

test("hr takes precedence over manager and auditor when not admin", () => {
  assert.equal(
    resolveDashboardMode(profile("hr", ["Manager", "Auditor"])),
    "hr",
  );
});

test("manager takes precedence over auditor when not admin or hr", () => {
  assert.equal(
    resolveDashboardMode(profile("manager", ["Auditor"])),
    "manager",
  );
});
