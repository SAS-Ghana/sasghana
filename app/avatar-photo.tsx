import { useEffect, useState } from "react";
import { createSignedStorageUrl, listRowsWhereUnordered } from "./lib/supabase-data";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "") || "?";
}

function jwtSubject(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return "";
    const normalised = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalised.padEnd(Math.ceil(normalised.length / 4) * 4, "="))) as { sub?: string };
    return decoded.sub ?? "";
  } catch {
    return "";
  }
}

// Shared photo circle for dashboard headers, sidebar account chips and profile pages.
// profiles.avatar_path is preferred; older records only have a photo on the linked employee row,
// where the column is passport_photo_path. This fallback asked employees for avatar_path, which
// does not exist on that table, so every avatar without a profiles.avatar_path raised
// 42703 "column employees.avatar_path does not exist" and then fell into the catch below and
// resolved to no photo at all -- 22 of them in the last day of production logs.
export function AvatarPhoto({ accessToken, path, name, size = 40 }: { accessToken: string; path?: string | null; name: string; size?: number }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function resolveAvatar() {
      let resolvedPath = path?.trim() ?? "";

      if (!resolvedPath) {
        const profileId = jwtSubject(accessToken);
        if (profileId) {
          try {
            const employeeRows = await listRowsWhereUnordered(
              accessToken,
              "employees",
              { profile_id: profileId },
              "passport_photo_path",
              1,
            );
            resolvedPath = String(employeeRows[0]?.passport_photo_path ?? "").trim();
          } catch {
            resolvedPath = "";
          }
        }
      }

      if (!resolvedPath) return "";

      // Some older imports may already contain an absolute image URL. Do not try to sign those.
      if (/^https?:\/\//i.test(resolvedPath)) return resolvedPath;
      return createSignedStorageUrl(accessToken, "employee-media", resolvedPath);
    }

    resolveAvatar()
      .then((resolved) => { if (!cancelled) setUrl(resolved); })
      .catch(() => { if (!cancelled) setUrl(""); });

    return () => { cancelled = true; };
  }, [accessToken, path]);

  return <div className="avatar-photo" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
    {url ? <img src={url} alt={`${name} profile`} /> : initialsOf(name).toUpperCase()}
  </div>;
}
