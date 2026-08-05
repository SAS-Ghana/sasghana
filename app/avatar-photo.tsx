import { useEffect, useState } from "react";
import { createSignedStorageUrl } from "./lib/supabase-data";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "") || "?";
}

// Shared photo circle for dashboard headers and profile pages. Falls back to initials whenever
// no path is set or the signed URL can't be resolved -- accounts with no linked employee record
// (e.g. Administrator) have no employee-scoped photo, so callers pass profile.avatar_path instead.
export function AvatarPhoto({ accessToken, path, name, size = 40 }: { accessToken: string; path?: string | null; name: string; size?: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    (path ? createSignedStorageUrl(accessToken, "employee-media", path) : Promise.resolve(""))
      .then((resolved) => { if (!cancelled) setUrl(resolved); })
      .catch(() => { if (!cancelled) setUrl(""); });
    return () => { cancelled = true; };
  }, [accessToken, path]);
  return <div className="avatar-photo" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
    {url ? <img src={url} alt="" /> : initialsOf(name).toUpperCase()}
  </div>;
}
