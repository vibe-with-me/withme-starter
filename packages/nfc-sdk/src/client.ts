import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

// These mirror @withme/contract's public-router types. They are declared
// structurally here (rather than imported) so the published .d.ts is fully
// self-contained — the contract package is a private workspace package. A
// compile-time parity test in test/client-types.test.ts keeps them in sync.

/** Where a tag points: the owner's profile, or a gathering they host or belong to. */
export type Destination = { type: 'profile' } | { type: 'gathering'; gathering_id: string };

/** What an anonymous tap on a gathering tag may learn. */
export interface GatheringSummary {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
}

/** The public card a resolved tag exposes. */
export interface PublicProfileCard {
  id: string;
  display_name: string;
  /**
   * `<user-id>/<uuid>.(webp|jpg)` in the public `avatars` bucket, or null.
   * A path, never a URL: build it from your Supabase URL, with any trailing
   * slash stripped (`supabaseUrl.replace(/\/+$/, '')`), as
   * `${supabaseUrl}/storage/v1/object/public/avatars/${avatar_path}`.
   */
  avatar_path: string | null;
  bio: string | null;
}

/** A platform a card owner can be reached on. The card names it; only connections see the value. */
export type LinkPlatform =
  | 'instagram'
  | 'tiktok'
  | 'x'
  | 'threads'
  | 'snapchat'
  | 'facebook'
  | 'youtube'
  | 'linkedin'
  | 'bluesky'
  | 'telegram'
  | 'discord'
  | 'whatsapp'
  | 'signal'
  | 'phone'
  | 'email'
  | 'website';

export type TagStatus = 'unclaimed' | 'claimed' | 'disabled';

export type ApiResolveResult =
  | { status: 'unclaimed'; uid: string }
  | {
      status: 'claimed';
      uid: string;
      destination: Destination;
      /** The summary for a gathering destination; null for every other type. */
      gathering: GatheringSummary | null;
      profile: PublicProfileCard;
      /** The owner's link platforms, in their order, without values: the card shows them locked. */
      link_platforms: LinkPlatform[];
    }
  | { status: 'disabled'; uid: string };

export interface ApiClaimResult {
  tag: {
    uid: string;
    status: TagStatus;
    destination: Destination | null;
  };
}

interface PublicRpcClient {
  resolve(input: { uid: string }): Promise<ApiResolveResult>;
  claim(input: { uid: string; destination?: Destination }): Promise<ApiClaimResult>;
  logScan(input: { uid: string; user_agent?: string }): Promise<{ ok: true }>;
}

export interface NfcClientOptions {
  /** Base URL of a withme-starter API Worker, e.g. `https://api.example.com`. */
  baseUrl: string;
  /** Supplies a Supabase access token for authed calls (claim). */
  getAuthToken?: () => string | null | Promise<string | null>;
  /** Custom fetch (for tests or non-global environments). */
  fetch?: typeof globalThis.fetch;
}

/**
 * Client mode: talk to a running withme-starter API over its typed ORPC
 * contract. For embedded mode (bring-your-own storage, no API), use the
 * NfcSdk core from the package root instead.
 */
export class NfcClient {
  readonly #client: PublicRpcClient;

  constructor(options: NfcClientOptions) {
    const link = new RPCLink({
      url: `${options.baseUrl.replace(/\/+$/, '')}/rpc/public`,
      headers: async () => {
        const token = await options.getAuthToken?.();
        return token ? { authorization: `Bearer ${token}` } : {};
      },
      fetch: options.fetch,
    });
    this.#client = createORPCClient(link) as unknown as PublicRpcClient;
  }

  resolve(uid: string): Promise<ApiResolveResult> {
    return this.#client.resolve({ uid });
  }

  claim(uid: string, destination: Destination = { type: 'profile' }): Promise<ApiClaimResult> {
    return this.#client.claim({ uid, destination });
  }

  logScan(uid: string, userAgent?: string): Promise<{ ok: true }> {
    return this.#client.logScan({ uid, user_agent: userAgent });
  }
}
