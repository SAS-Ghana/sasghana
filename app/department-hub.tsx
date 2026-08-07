import { FormEvent, useCallback, useEffect, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import {
  createRow,
  DataRow,
  deleteRow,
  listNamedRows,
  listRows,
  updateRow,
} from "./lib/supabase-data";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

export function DepartmentHub({
  accessToken,
  profile,
}: {
  accessToken: string;
  profile: UserProfile;
}) {
  const [departments, setDepartments] = useState<DataRow[]>([]);
  const [employees, setEmployees] = useState<DataRow[]>([]);
  const [profiles, setProfiles] = useState<DataRow[]>([]);
  const [editing, setEditing] = useState<DataRow | null | undefined>(undefined);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [d, e, p] = await Promise.all([
        listNamedRows(accessToken, "departments", "*"),
        listNamedRows(
          accessToken,
          "employees",
          "id,first_name,last_name,department_id,employment_status",
          "first_name",
        ),
        listRows(accessToken, "profiles", "id,display_name,job_title", 500),
      ]);
      setDepartments(d);
      setEmployees(e);
      setProfiles(p);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Departments could not be loaded.",
      );
    }
  }, [accessToken]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const manager = (id: unknown) =>
    String(profiles.find((x) => x.id === id)?.display_name || "Not assigned");

  async function removeDepartment(row: DataRow, teamSize: number) {
    if (teamSize > 0) {
      setError(
        "Move the department's employees before deleting it so no employee loses their reporting line.",
      );
      return;
    }
    if (!window.confirm(`Delete ${String(row.name)}? This cannot be undone.`))
      return;
    try {
      await deleteRow(accessToken, "departments", String(row.id));
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Department could not be deleted.",
      );
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <span className="eyebrow">Organisation design</span>
          <h1>
            <MenuIcon name={moduleIcon("Organization Structure")} />
            Departments & managers
          </h1>
          <p className="muted">
            Managers receive scoped access to their department's people,
            attendance and performance.
          </p>
        </div>
        <button className="primary" onClick={() => setEditing(null)}>
          Create department
        </button>
      </header>
      {error && <p className="form-error">{error}</p>}
      <div className="department-grid">
        {departments.map((d) => {
          const team = employees.filter((e) => e.department_id === d.id);
          return (
            <article className="card department-card" key={String(d.id)}>
              <div className="department-icon">
                {String(d.name).slice(0, 2).toUpperCase()}
              </div>
              <span className={`status-pill ${d.status}`}>
                {String(d.status || "active")}
              </span>
              <h2>{String(d.name)}</h2>
              <p>{String(d.description || "No department description yet.")}</p>
              <dl>
                <div>
                  <dt>Manager</dt>
                  <dd>{manager(d.manager_profile_id)}</dd>
                </div>
                <div>
                  <dt>Employees</dt>
                  <dd>{team.length}</dd>
                </div>
                <div>
                  <dt>Active</dt>
                  <dd>
                    {
                      team.filter((x) => x.employment_status === "active")
                        .length
                    }
                  </dd>
                </div>
                <div>
                  <dt>Cost centre</dt>
                  <dd>{String(d.cost_centre || "—")}</dd>
                </div>
              </dl>
              <div className="row-actions">
                <button className="secondary" onClick={() => setEditing(d)}>
                  Manage department
                </button>
                <button
                  className="danger"
                  onClick={() => void removeDepartment(d, team.length)}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {editing !== undefined && (
        <DepartmentDialog
          accessToken={accessToken}
          profile={profile}
          row={editing}
          profiles={profiles}
          employees={employees}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await load();
          }}
        />
      )}
    </section>
  );
}

function DepartmentDialog({
  accessToken,
  profile,
  row,
  profiles,
  employees,
  onClose,
  onSaved,
}: {
  accessToken: string;
  profile: UserProfile;
  row: DataRow | null;
  profiles: DataRow[];
  employees: DataRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [v, setV] = useState({
    name: String(row?.name || ""),
    description: String(row?.description || ""),
    cost_centre: String(row?.cost_centre || ""),
    manager_profile_id: String(row?.manager_profile_id || ""),
    status: String(row?.status || "active"),
  });
  const [error, setError] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>(
    employees
      .filter(
        (employee) => String(employee.department_id) === String(row?.id ?? ""),
      )
      .map((employee) => String(employee.id)),
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const payload = {
        ...v,
        manager_profile_id: v.manager_profile_id || null,
        organisation_id: profile.organisation_id,
      };
      const saved = row?.id
        ? await updateRow(accessToken, "departments", String(row.id), payload)
        : await createRow(accessToken, "departments", payload);
      const departmentId = String(row?.id ?? saved[0]?.id ?? "");
      if (departmentId) {
        await Promise.all(
          employees.map((employee) => {
            const assigned =
              String(employee.department_id ?? "") === departmentId;
            const selected = memberIds.includes(String(employee.id));
            if (assigned === selected) return Promise.resolve();
            return updateRow(accessToken, "employees", String(employee.id), {
              department_id: selected ? departmentId : null,
              department_name: selected ? v.name : null,
            });
          }),
        );
      }
      await onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Department could not be saved.",
      );
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <span className="eyebrow">Department access scope</span>
        <h2>{row ? "Manage department" : "Create department"}</h2>
        <form onSubmit={submit}>
          <label>
            Name
            <input
              required
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
            />
          </label>
          <label>
            Description
            <textarea
              value={v.description}
              onChange={(e) => setV({ ...v, description: e.target.value })}
            />
          </label>
          <label>
            Cost centre
            <input
              value={v.cost_centre}
              onChange={(e) => setV({ ...v, cost_centre: e.target.value })}
            />
          </label>
          <label>
            Department manager
            <select
              value={v.manager_profile_id}
              onChange={(e) =>
                setV({ ...v, manager_profile_id: e.target.value })
              }
            >
              <option value="">Not assigned</option>
              {profiles.map((x) => (
                <option value={String(x.id)} key={String(x.id)}>
                  {String(x.display_name)} — {String(x.job_title || "Employee")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={v.status}
              onChange={(e) => setV({ ...v, status: e.target.value })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <fieldset className="permission-group">
            <legend>Department employees</legend>
            <p className="muted">
              The assigned manager will automatically receive scoped access to
              these employees, their tasks, attendance, reports and cases.
            </p>
            <div className="checkbox-grid">
              {employees.map((employee) => (
                <label className="check" key={String(employee.id)}>
                  <input
                    type="checkbox"
                    checked={memberIds.includes(String(employee.id))}
                    onChange={() =>
                      setMemberIds((current) =>
                        current.includes(String(employee.id))
                          ? current.filter((id) => id !== String(employee.id))
                          : [...current, String(employee.id)],
                      )
                    }
                  />
                  {String(employee.first_name)} {String(employee.last_name)}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="form-error">{error}</p>}
          <button className="primary">Save department</button>
        </form>
      </section>
    </div>
  );
}
