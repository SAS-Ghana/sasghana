import { useCallback, useEffect, useState } from "react";
import type { UserProfile } from "./lib/supabase-auth";
import { DataRow, listRows, listRowsWhereUnordered } from "./lib/supabase-data";

/** Permissions that let someone create or edit a vacancy, mirroring the RLS on job_openings. */
const postingPermissions = [
  "hiring.manage",
  "admin.recruitment.manage",
  "hr.recruitment.manage",
];

/**
 * Whether this user may post a vacancy.
 *
 * Managing a team does not by itself confer this: a manager sees and applies to vacancies like
 * anyone else, and only gains posting rights when an administrator grants them one of the
 * recruitment permissions. The check mirrors the RLS on job_openings, which remains the actual
 * gate -- this only decides whether to offer the button.
 */
export function canPostVacancies(profile: UserProfile) {
  if (profile.roles.some((role) => /system administrator|^administrator$/i.test(role))) return true;
  return profile.permissions.some((permission) => postingPermissions.includes(permission));
}

/**
 * Open internal vacancies, with the viewer's own application state against each.
 *
 * Vacancies were previously only reachable by opening a recruitment page, so a job posted by HR
 * went unseen unless someone thought to look for it.
 */
export function InternalVacanciesCard({
  accessToken,
  profile,
  onNavigate,
  recruitmentPage,
}: {
  accessToken: string;
  profile: UserProfile;
  onNavigate: (page: string) => void;
  recruitmentPage: string;
}) {
  const [jobs, setJobs] = useState<DataRow[]>([]);
  const [applications, setApplications] = useState<DataRow[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [openings, mine] = await Promise.all([
        listRows(accessToken, "job_openings", "*", 100),
        profile.employee_id
          ? listRowsWhereUnordered(
              accessToken,
              "internal_job_applications",
              { employee_id: String(profile.employee_id) },
              "id,job_opening_id,status",
              200,
            )
          : Promise.resolve([] as DataRow[]),
      ]);
      setJobs(openings);
      setApplications(mine);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Vacancies could not be loaded.");
    }
  }, [accessToken, profile.employee_id]);

  useEffect(() => {
    const refresh = () => void load();
    refresh();
    window.addEventListener("sas-data-changed", refresh);
    return () => window.removeEventListener("sas-data-changed", refresh);
  }, [load]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const open = jobs.filter((job) => {
    if (!["open", "published"].includes(String(job.status))) return false;
    if (!job.closing_date) return true;
    const closing = new Date(String(job.closing_date));
    return !Number.isNaN(closing.getTime()) && closing.getTime() >= today.getTime();
  });
  const appliedTo = new Map(
    applications.map((row) => [String(row.job_opening_id), String(row.status)]),
  );

  if (error) {
    return (
      <article className="card dashboard-insights employee-vacancy-card">
        <div className="panel-head"><div><h2>Open roles</h2></div></div>
        <p className="muted">{error}</p>
      </article>
    );
  }
  if (!open.length) return null;

  return (
    <article className="card dashboard-insights employee-vacancy-card">
      <div className="panel-head">
        <div>
          <h2>Open roles</h2>
          <p className="muted">
            {open.length} internal {open.length === 1 ? "vacancy is" : "vacancies are"} open to you
          </p>
        </div>
        <button type="button" className="text-btn" onClick={() => onNavigate(recruitmentPage)}>
          {canPostVacancies(profile) ? "Manage vacancies" : "View all"}
        </button>
      </div>
      <ul className="employee-vacancy-list">
        {open.slice(0, 4).map((job) => {
          const applied = appliedTo.get(String(job.id));
          return (
            <li key={String(job.id)}>
              <div>
                <strong>{String(job.title)}</strong>
                <small>
                  {[job.employment_type, job.location].filter(Boolean).join(" · ") || "Internal vacancy"}
                  {job.closing_date ? ` · closes ${String(job.closing_date)}` : ""}
                </small>
              </div>
              {applied ? (
                <span className={`status-pill ${applied}`}>{applied}</span>
              ) : (
                <button type="button" onClick={() => onNavigate(recruitmentPage)}>Apply</button>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
