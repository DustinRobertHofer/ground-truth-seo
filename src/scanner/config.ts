/**
 * Scan configuration, PRODUCT.md §11. Every value that can change output is
 * echoed in `meta` and included in `config_hash`.
 */

import type { Engine } from "./rules/types.js";
import { canonicalize } from "./snapshot/canonical-json.js";
import { sha256Hex } from "./snapshot/sha256.js";

export interface ScanConfig {
  start_url: string;
  engines: Engine[];
  preferred_origin: string | null;
  additional_origins: string[];
  max_pages: number;
  max_depth: number;
  max_extra_fetches: number;
  max_images_per_page: number;
  include: string[];
  exclude: string[];
  robots_mode: "respect" | "owner";
  staging_hosts: string[];
  indexnow_key: string | null;
  render: boolean;
  crux: boolean;
  parity_check: boolean;
  check_third_party_resources: boolean;
  house_conventions: boolean;
  /** Optional per-rule weights for enabled house conventions. */
  house_convention_weights: Record<string, number>;
}

export type ScanConfigInput = Partial<Omit<ScanConfig, "start_url">> & { start_url: string };

export const CONFIG_DEFAULTS: Omit<ScanConfig, "start_url"> = {
  engines: ["google", "bing"],
  preferred_origin: null,
  additional_origins: [],
  max_pages: 500,
  max_depth: 20,
  max_extra_fetches: 500,
  max_images_per_page: 20,
  include: [],
  exclude: [],
  robots_mode: "respect",
  staging_hosts: [],
  indexnow_key: null,
  render: false,
  crux: false,
  parity_check: false,
  check_third_party_resources: false,
  house_conventions: false,
  house_convention_weights: {},
};

export class ConfigError extends Error {}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ConfigError(`origin must be http(s): ${value}`);
  return url.origin;
}

export function resolveConfig(input: ScanConfigInput): ScanConfig {
  const start = input.start_url.trim();
  if (start === "") throw new ConfigError("start_url is required");
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(start) ? start : `https://${start}`;
  let startUrl: URL;
  try {
    startUrl = new URL(withScheme);
  } catch {
    throw new ConfigError(`start_url is not a valid URL: ${input.start_url}`);
  }
  if (startUrl.protocol !== "http:" && startUrl.protocol !== "https:") {
    throw new ConfigError("start_url must use http or https");
  }
  if (startUrl.username || startUrl.password) throw new ConfigError("start_url must not carry credentials");
  startUrl.hash = "";

  const engines = [...new Set(input.engines ?? CONFIG_DEFAULTS.engines)].sort() as Engine[];
  if (engines.length === 0) throw new ConfigError("at least one engine must be selected");
  for (const engine of engines) {
    if (engine !== "google" && engine !== "bing") throw new ConfigError(`unknown engine ${engine as string}`);
  }
  const key = input.indexnow_key ?? null;
  if (key !== null && (key.length < 8 || key.length > 128)) {
    throw new ConfigError("indexnow_key must be between 8 and 128 characters");
  }
  const int = (name: keyof ScanConfig, value: number | undefined, min: number, max: number): number => {
    const v = value ?? (CONFIG_DEFAULTS[name as keyof typeof CONFIG_DEFAULTS] as number);
    if (!Number.isInteger(v) || v < min || v > max) throw new ConfigError(`${name} must be an integer between ${min} and ${max}`);
    return v;
  };

  return {
    start_url: startUrl.toString(),
    engines,
    preferred_origin: input.preferred_origin ? normalizeOrigin(input.preferred_origin) : null,
    additional_origins: [...new Set((input.additional_origins ?? []).map(normalizeOrigin))].sort(),
    max_pages: int("max_pages", input.max_pages, 1, 100_000),
    max_depth: int("max_depth", input.max_depth, 0, 1_000),
    max_extra_fetches: int("max_extra_fetches", input.max_extra_fetches, 0, 100_000),
    max_images_per_page: int("max_images_per_page", input.max_images_per_page, 0, 1_000),
    include: [...(input.include ?? [])].sort(),
    exclude: [...(input.exclude ?? [])].sort(),
    robots_mode: input.robots_mode ?? "respect",
    staging_hosts: [...new Set((input.staging_hosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean))].sort(),
    indexnow_key: key,
    render: input.render ?? false,
    crux: input.crux ?? false,
    parity_check: input.parity_check ?? false,
    check_third_party_resources: input.check_third_party_resources ?? false,
    house_conventions: input.house_conventions ?? false,
    house_convention_weights: { ...(input.house_convention_weights ?? {}) },
  };
}

export function configHash(config: ScanConfig): string {
  return sha256Hex(canonicalize(config));
}
