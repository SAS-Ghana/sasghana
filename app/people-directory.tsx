import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  createRow,
  createSignedStorageUrl,
  DataRow,
  listNamedRows,
  listRows,
  updateRow,
  uploadStorageFile,
} from "./lib/supabase-data";
import { MenuIcon } from "./menu-icon";
import { moduleIcon } from "./module-icons";

type EmployeeField = [
  key: string,
  label: string,
  type: string,
  required: boolean,
];

const fields: EmployeeField[] = [
  ["employee_number", "Employee ID", "text", false],
  ["first_name", "First name", "text", true],
  ["middle_name", "Middle name", "text", false],
  ["last_name", "Last name", "text", true],
  ["preferred_name", "Preferred name", "text", false],
  ["work_email", "Work email", "email", true],
  ["personal_email", "Personal email", "email", false],
  ["phone", "Phone", "tel", false],
  ["position_title", "Job title", "text", true],
  ["branch", "Branch", "text", true],
  ["start_date", "Start date", "date", true],
  ["probation_end_date", "Probation end date", "date", false],
  ["contract_end_date", "Contract end date", "date", false],
  ["basic_salary", "Salary amount", "number", false],
  ["date_of_birth", "Date of birth", "date", false],
  ["gender", "Gender", "text", false],
  ["nationality", "Nationality", "text", false],
  ["marital_status", "Marital status", "text", false],
  ["residential_address", "Residential address", "textarea", false],
  ["digital_address", "Digital address", "text", false],
  ["emergency_contact_name", "Emergency contact name", "text", false],
  ["emergency_contact_phone", "Emergency contact phone", "tel", false],
  [
    "emergency_contact_relationship",
    "Emergency contact relationship",
    "text",
    false,
  ],
  ["ghana_card_number", "Ghana Card number", "text", false],
  ["ssnit_number", "SSNIT number", "text", false],
  ["bank_name", "Bank name", "text", false],
  ["bank_account_name", "Bank account name", "text", false],
  ["bank_account_number", "Bank account number", "text", false],
  ["skills", "Skills", "textarea", false],
  ["qualifications", "Qualifications", "textarea", false],
  ["biography", "Biography", "textarea", false],
  ["linkedin_url", "LinkedIn URL", "url", false],
  ["internal_notes", "Internal HR notes", "textarea", false],
];

function money(value: unknown, currency = "GHS") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    Number(value ?? 0),
  );
}

export function PeopleDirectory({
  accessToken,
  canManage = false,
  organisationId,
}: {
  accessToken: string;
  canManage?: boolean;
  organisationId?: string;
}) {
  const [people, setPeople] = useState<DataRow[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<DataRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const rows = canManage
        ? await listRows(accessToken, "employees", "*", 1000)
        : await listNamedRows(
            accessToken,
            "employee_directory",
            "*",
            "full_name",
          );
      setPeople(rows);
      const withPhotos = rows.filter((person) => person.passport_photo_path);
      const entries = await Promise.all(
        withPhotos.map(async (person) => {
          try {
            return [
              String(person.id),
              await createSignedStorageUrl(
                accessToken,
                "employee-media",
                String(person.passport_photo_path),
              ),
            ] as const;
          } catch {
            return [String(person.id), ""] as const;
          }
        }),
      );
      setPhotos(Object.fromEntries(entries.filter(([, url]) => url)));
    } catch (cause) {
      setPeople([]);
      setError(
        cause instanceof Error
          ? cause.message
          : "Directory could not be loaded.",
      );
    }
  }, [accessToken, canManage]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const departments = useMemo(
    () =>
      [
        ...new Set(
          people.map((person) =>
            String(
              person.department_name || person.department_id || "Unassigned",
            ),
          ),
        ),
      ].sort(),
    [people],
  );

  const visible = people.filter((person) => {
    const fullName =
      person.full_name ??
      `${person.first_name ?? ""} ${person.last_name ?? ""}`;
    const haystack =
      `${fullName} ${person.position_title ?? ""} ${person.department_name ?? ""} ${person.branch ?? ""} ${person.employee_number ?? ""}`.toLowerCase();
    return (
      haystack.includes(query.toLowerCase()) &&
      (department === "all" ||
        String(
          person.department_name || person.department_id || "Unassigned",
        ) === department)
    );
  });

  return (
    <section>
      <header className="page-header">
        <div>
          <span className="eyebrow">Our people</span>
          <h1>
            <MenuIcon name={moduleIcon("Employee Management")} />
            {canManage ? "Employee records" : "Organisation directory"}
          </h1>
          <p className="muted">
            {canManage
              ? "Create complete employee records, salary information and account links used by payroll, tax and HR documents."
              : "Find colleagues, roles and teams without exposing private information."}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            className="primary"
            onClick={() => setCreating(true)}
          >
            Add employee
          </button>
        )}
      </header>

      <div className="directory-filters">
        <input
          aria-label="Search directory"
          placeholder="Search name, ID, role, team or branch…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Filter by department"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
        >
          <option value="all">All departments</option>
          {departments.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="directory-grid">
        {visible.map((person) => {
          const fullName = String(
            person.full_name ??
              `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim(),
          );
          return (
            <article className="card person-card" key={String(person.id)}>
              <div className="profile-photo small">
                {photos[String(person.id)] ? (
                  <img src={photos[String(person.id)]} alt="" />
                ) : (
                  fullName
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")
                )}
              </div>
              <div>
                <h3>{fullName}</h3>
                <p>{String(person.position_title || "Employee")}</p>
                <span>
                  {String(
                    person.department_name || person.branch || "Unassigned",
                  )}{" "}
                  ·{" "}
                  {String(person.employee_number || person.year_joined || "—")}
                </span>
                {canManage && Number(person.basic_salary ?? 0) > 0 && (
                  <small className="table-subline">
                    Salary:{" "}
                    {money(
                      person.basic_salary,
                      String(person.salary_currency ?? "GHS"),
                    )}{" "}
                    {String(person.salary_frequency ?? "monthly")}
                  </small>
                )}
                {canManage && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setEditing(person)}
                  >
                    Edit full record
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!visible.length && (
          <div className="empty-state">
            <h3>No employees found</h3>
            <p>Use Add employee to create the first employee record.</p>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <EmployeeDialog
          accessToken={accessToken}
          organisationId={
            organisationId || String(editing?.organisation_id || "")
          }
          row={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await load();
          }}
        />
      )}
    </section>
  );
}

function EmployeeDialog({
  accessToken,
  organisationId,
  row,
  onClose,
  onSaved,
}: {
  accessToken: string;
  organisationId: string;
  row: DataRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const initial: DataRow = {
    employment_type: row?.employment_type ?? "Full time",
    employment_status: row?.employment_status ?? "active",
    salary_frequency: row?.salary_frequency ?? "monthly",
    salary_currency: row?.salary_currency ?? "GHS",
    department_id: row?.department_id ?? "",
    manager_id: row?.manager_id ?? "",
  };
  for (const [key] of fields)
    initial[key] = row?.[key] ?? (key === "basic_salary" ? 0 : "");

  const [values, setValues] = useState<DataRow>(initial);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [departments, setDepartments] = useState<DataRow[]>([]);
  const [managers, setManagers] = useState<DataRow[]>([]);

  useEffect(() => {
    void Promise.all([
      listNamedRows(accessToken, "departments", "id,name,department_code,manager_profile_id", "name"),
      listNamedRows(accessToken, "employees", "id,first_name,last_name,employee_number,department_id", "first_name"),
    ]).then(([departmentRows, employeeRows]) => { setDepartments(departmentRows); setManagers(employeeRows.filter((employee) => String(employee.id) !== String(row?.id ?? ""))); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Departments and managers could not be loaded."));
  }, [accessToken, row?.id]);

  const enteredSalary = Number(values.basic_salary ?? 0);
  const frequency = String(values.salary_frequency ?? "monthly");
  const monthlySalary =
    frequency === "annual" ? enteredSalary / 12 : enteredSalary;
  const annualSalary =
    frequency === "annual" ? enteredSalary : enteredSalary * 12;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organisationId)
      return setError("The employee organisation could not be identified.");
    setBusy(true);
    setError("");
    try {
      const payload: DataRow = { ...values };
      for (const [key, , type] of fields) {
        if (type === "date" && !payload[key]) payload[key] = null;
        if (type === "number") payload[key] = Number(payload[key] ?? 0);
      }
      payload.salary_frequency = frequency;
      payload.salary_currency = String(payload.salary_currency ?? "GHS")
        .trim()
        .toUpperCase();

      let recordId = row?.id ? String(row.id) : "";
      if (row?.id)
        await updateRow(accessToken, "employees", String(row.id), payload);
      else {
        const created = await createRow(accessToken, "employees", {
          organisation_id: organisationId,
          ...payload,
        });
        recordId = String(created[0]?.id ?? "");
      }

      if (photoFile && recordId) {
        const extension =
          photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${organisationId}/${recordId}/passport.${extension}`;
        await uploadStorageFile(accessToken, "employee-media", path, photoFile);
        await updateRow(accessToken, "employees", recordId, {
          passport_photo_path: path,
        });
      }

      await onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Employee record could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal record-modal employee-record-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-record-title"
      >
        <button
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        <span className="eyebrow">Employee administration</span>
        <h2 id="employee-record-title">
          {row ? "Edit complete employee record" : "Add employee"}
        </h2>
        <form className="record-form" onSubmit={submit}>
          <label className="wide">
            Photograph
            {row?.passport_photo_path && !photoFile && (
              <small className="table-subline">
                A photo is already on record; choose a new one to replace it.
              </small>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setPhotoFile(event.target.files?.[0] ?? null)
              }
            />
          </label>
          {fields.map(([key, label, type, required]) => (
            <label className={type === "textarea" ? "wide" : ""} key={key}>
              {label}
              {type === "textarea" ? (
                <textarea
                  required={required}
                  value={String(values[key] ?? "")}
                  onChange={(event) =>
                    setValues({ ...values, [key]: event.target.value })
                  }
                />
              ) : (
                <input
                  required={required}
                  readOnly={!row && key === "employee_number"}
                  placeholder={
                    !row && key === "employee_number"
                      ? "Generated automatically"
                      : undefined
                  }
                  min={type === "number" ? "0" : undefined}
                  step={type === "number" ? "0.01" : undefined}
                  type={type}
                  value={String(values[key] ?? "")}
                  onChange={(event) =>
                    setValues({ ...values, [key]: event.target.value })
                  }
                />
              )}
            </label>
          ))}

          <label>
            Salary frequency
            <select
              value={frequency}
              onChange={(event) =>
                setValues({ ...values, salary_frequency: event.target.value })
              }
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
          <label>
            Salary currency
            <input
              maxLength={3}
              value={String(values.salary_currency ?? "GHS")}
              onChange={(event) =>
                setValues({
                  ...values,
                  salary_currency: event.target.value.toUpperCase(),
                })
              }
            />
          </label>
          <div className="wide salary-preview">
            <span>
              Monthly basic{" "}
              <strong>
                {money(monthlySalary, String(values.salary_currency ?? "GHS"))}
              </strong>
            </span>
            <span>
              Annual salary{" "}
              <strong>
                {money(annualSalary, String(values.salary_currency ?? "GHS"))}
              </strong>
            </span>
            <small>
              This salary is synchronised to payroll and can be used in
              appointment letters and tax calculations.
            </small>
          </div>

          <label>
            Department
            <select value={String(values.department_id ?? "")} onChange={(event) => setValues({ ...values, department_id: event.target.value || null })}>
              <option value="">Unassigned</option>
              {departments.map((department) => <option key={String(department.id)} value={String(department.id)}>{String(department.name)} · {String(department.department_code ?? "Department")}</option>)}
            </select>
          </label>
          <label>
            Direct manager
            <select value={String(values.manager_id ?? "")} onChange={(event) => setValues({ ...values, manager_id: event.target.value || null })}>
              <option value="">No manager assigned</option>
              {managers.map((manager) => <option key={String(manager.id)} value={String(manager.id)}>{String(manager.first_name)} {String(manager.last_name)} · {String(manager.employee_number)}</option>)}
            </select>
          </label>

          <label>
            Employment type
            <select
              value={String(values.employment_type)}
              onChange={(event) =>
                setValues({ ...values, employment_type: event.target.value })
              }
            >
              <option>Full time</option>
              <option>Part time</option>
              <option>Contract</option>
              <option>Internship</option>
              <option>Casual</option>
            </select>
          </label>
          <label>
            Status
            <select
              value={String(values.employment_status)}
              onChange={(event) =>
                setValues({ ...values, employment_status: event.target.value })
              }
            >
              <option value="active">Active</option>
              <option value="probation">Probation</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="terminated">Terminated</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          {error && (
            <p className="form-error wide" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions wide">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save employee"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
