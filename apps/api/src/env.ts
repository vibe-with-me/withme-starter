/**
 * Worker bindings. SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are set in
 * .dev.vars locally and as Worker vars/secrets in deployment. The API never
 * holds the service-role key: every query runs under the caller's RLS
 * identity (or anon), so a compromised Worker cannot bypass row security.
 */
export interface ApiEnv {
  APP_ENV: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  CORS_ORIGIN: string;
  /** Per-UID scan/resolve limiter: a single tag cannot generate unbounded writes. */
  SCAN_RATE_LIMITER: RateLimit;
  /** Per-IP resolve limiter across all tags: one client cannot walk the UID space. */
  RESOLVE_IP_RATE_LIMITER: RateLimit;
}

export interface HonoEnv {
  Bindings: ApiEnv;
  Variables: {
    userId: string | null;
    accessToken: string | null;
    requestId: string;
  };
}
