// The one Workers global the source reaches (env.ts), for the bun-typed test
// project. Same shape as @cloudflare/workers-types' RateLimit.
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
