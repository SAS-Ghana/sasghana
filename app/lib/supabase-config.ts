const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase configuration is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export const serviceUrl = supabaseUrl;
export const publishableKey = supabaseAnonKey;
export const jsonHeaders = { apikey: publishableKey, "Content-Type": "application/json" };
