import assert from "node:assert/strict";
import test from "node:test";
import {
  landingOptions,
  navigationLabels,
  resolveLandingPage,
  roleHome,
} from "../app/lib/dashboard-landing.ts";
import { resolveDashboardMode } from "../app/lib/dashboard-mode.ts";

const modes = ["admin", "hr", "manager", "auditor", "employee"];

function profile(account_type, preferred_dashboard, roles = []) {
  return { account_type, roles, preferred_dashboard };
}

test("every role's home is a real entry in that role's own navigation", () => {
  // Drift guard: roleHome() and the sidebar groups live in different modules, and a home that is
  // not a real label would fall through to the section-page "not enabled for this account" card.
  for (const mode of modes) {
    assert.ok(
      navigationLabels(mode).has(roleHome(mode)),
      `${mode} home "${roleHome(mode)}" is missing from its navigation`,
    );
  }
});

test('the legacy "Dashboard" preference resolves to the role home, never itself', () => {
  // Regression test for the reported bug: no sidebar defines a page called "Dashboard", so storing
  // it as preferred_dashboard (the old default, and an option in the admin picker) landed users on
  // an empty "This <role> feature is not enabled for this account." card.
  for (const mode of modes) {
    assert.ok(!navigationLabels(mode).has("Dashboard"));
  }
  assert.equal(
    resolveLandingPage(profile("manager", "Dashboard")),
    "Manager Dashboard",
  );
  assert.equal(resolveLandingPage(profile("hr", "Dashboard")), "HR Dashboard");
  assert.equal(
    resolveLandingPage(profile("administrator", "Dashboard")),
    "Administrator Dashboard",
  );
  assert.equal(
    resolveLandingPage(profile("auditor", "Dashboard")),
    "Audit Dashboard",
  );
  assert.equal(resolveLandingPage(profile("employee", "Dashboard")), "Home");
});

test("a missing or blank preference falls back to the role home", () => {
  for (const mode of modes) {
    const accountType = mode === "admin" ? "administrator" : mode;
    assert.equal(resolveDashboardMode(profile(accountType, undefined)), mode);
    assert.equal(resolveLandingPage(profile(accountType, undefined)), roleHome(mode));
    assert.equal(resolveLandingPage(profile(accountType, "   ")), roleHome(mode));
  }
});

test("a reachable preference is honoured", () => {
  assert.equal(resolveLandingPage(profile("manager", "My Team")), "My Team");
  assert.equal(
    resolveLandingPage(profile("hr", "Payroll Administration")),
    "Payroll Administration",
  );
  assert.equal(resolveLandingPage(profile("employee", "My Info")), "My Info");
});

test("a preference belonging to another role falls back to this role's home", () => {
  // e.g. a user demoted from HR to manager keeps the stored "Payroll Administration" preference,
  // which the manager sidebar has no entry for.
  assert.equal(
    resolveLandingPage(profile("manager", "Payroll Administration")),
    "Manager Dashboard",
  );
  assert.equal(
    resolveLandingPage(profile("employee", "Administrator Dashboard")),
    "Home",
  );
});

test("role wins over a stale preference when roles disagree with account_type", () => {
  // resolveDashboardMode promotes on role name, so the landing must follow the promoted role.
  assert.equal(
    resolveLandingPage(profile("employee", "Dashboard", ["SAS System Administrator"])),
    "Administrator Dashboard",
  );
});

test("landingOptions offers only reachable pages, home first", () => {
  for (const mode of modes) {
    const options = landingOptions(mode);
    assert.equal(options[0], roleHome(mode), `${mode} should offer its home first`);
    assert.equal(new Set(options).size, options.length, `${mode} has duplicates`);
    for (const option of options) {
      assert.ok(
        navigationLabels(mode).has(option),
        `${mode} offers unreachable landing page "${option}"`,
      );
    }
    // Every offered option must survive resolution unchanged, or the picker would silently
    // disagree with where the user actually lands.
    const accountType = mode === "admin" ? "administrator" : mode;
    for (const option of options) {
      assert.equal(resolveLandingPage(profile(accountType, option)), option);
    }
  }
});
