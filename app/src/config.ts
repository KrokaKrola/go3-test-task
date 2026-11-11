import { z } from 'zod';

const flag = (defaultValue: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'on', 'off'])
    .optional()
    .transform((v) => (v === undefined ? defaultValue : ['true', '1', 'on'].includes(v)));

const envSchema = z.object({
  NEXT_PUBLIC_API_BASE: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_ACCOUNT_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_FLAG_REVIEW_STEP: flag(true),
  NEXT_PUBLIC_FLAG_MARKET_LV: flag(false),
});

export type Config = {
  API_BASE: string;
  ACCOUNT_URL: string;
  flags: { reviewStep: boolean; 'market.LV': boolean };
};

export function parseConfig(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.parse(env);
  return {
    API_BASE: parsed.NEXT_PUBLIC_API_BASE.replace(/\/$/, ''),
    ACCOUNT_URL: parsed.NEXT_PUBLIC_ACCOUNT_URL,
    flags: {
      reviewStep: parsed.NEXT_PUBLIC_FLAG_REVIEW_STEP,
      'market.LV': parsed.NEXT_PUBLIC_FLAG_MARKET_LV,
    },
  };
}

let cached: Config | undefined;

// Next inlines NEXT_PUBLIC_* only for literal `process.env.X` reads, so list them explicitly.
export function getConfig(): Config {
  cached ??= parseConfig({
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE,
    NEXT_PUBLIC_ACCOUNT_URL: process.env.NEXT_PUBLIC_ACCOUNT_URL,
    NEXT_PUBLIC_FLAG_REVIEW_STEP: process.env.NEXT_PUBLIC_FLAG_REVIEW_STEP,
    NEXT_PUBLIC_FLAG_MARKET_LV: process.env.NEXT_PUBLIC_FLAG_MARKET_LV,
  });
  return cached;
}
