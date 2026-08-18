import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (command === "build" && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)) {
    // Without these, app/lib/supabase-config.ts throws unconditionally at module init.
    // Rollup can prove that at build time and dead-code-eliminates everything after it,
    // so `vite build` exits 0 while shipping a near-empty bundle that just crashes on load.
    throw new Error(
      "Build aborted: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set before running `vite build`.",
    );
  }
  return {
    plugins: [react()],
    build: { outDir: "dist" },
  };
});
