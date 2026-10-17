import type { InferContractRouterInputs, InferContractRouterOutputs } from '@orpc/contract';
import { appContract } from './contract/app.ts';
import { publicContract } from './contract/public.ts';

export * from './schemas/connection.ts';
export * from './schemas/destination.ts';
export * from './schemas/gathering.ts';
export * from './schemas/link.ts';
export * from './schemas/phone.ts';
export * from './schemas/profile.ts';
export * from './schemas/push.ts';
export * from './schemas/report.ts';
export * from './schemas/tag.ts';
export * from './schemas/terms.ts';
export * from './schemas/text.ts';
export { ResolveOutputSchema, publicContract } from './contract/public.ts';
export type { ResolveOutput } from './contract/public.ts';
export { appContract } from './contract/app.ts';

/**
 * The whole API surface. `public` is tag-scoped (the SDK wraps it);
 * `app` is session-scoped (authed clients only). Served by apps/api.
 */
export const contract = {
  public: publicContract,
  app: appContract,
};

export type ContractInputs = InferContractRouterInputs<typeof contract>;
export type ContractOutputs = InferContractRouterOutputs<typeof contract>;
