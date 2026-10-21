import "server-only";

import type { Schemas } from "../schema";

export interface MockMedia {
  mime: string;
  bytes: Buffer;
}

export interface MockPairing {
  channelId: string;
  polls: number;
  status: Schemas["Pairing"]["status"];
  expiresAt: string;
}

export interface MockTenant {
  detail: Schemas["TenantDetail"];
  ownerEmail: string;
  metadata: Record<string, unknown> | null;
  stats: Schemas["StatsDay"][];
  pairings: Map<string, MockPairing>;
  products: Schemas["Product"][];
  assistant: Schemas["Assistant"];
  returnPolicy: Schemas["ReturnPolicy"] | null;
  paymentDetails: Schemas["PaymentDetails"];
  shipping: Schemas["Shipping"];
  conversations: Schemas["Conversation"][];
  messages: Map<string, Schemas["Message"][]>;
  optedOut: Set<string>;
  orders: Schemas["Order"][];
  evidence: Map<string, Schemas["Evidence"][]>;
  evidenceText: Map<string, string>;
  cases: Schemas["Case"][];
  media: Map<string, MockMedia>;
  entitlements: Schemas["ShopEntitlements"];
  catalogJobs: Schemas["CatalogImportJob"][];
  /** The product rows of each file job, by job id. */
  catalogRows?: Map<string, (Schemas["CatalogImportRow"] & { image_urls: string[] })[]>;
  /** Pictures a committed file job attached, by product ext; the Partner product shape carries none. */
  productImages?: Map<string, string[]>;
}

export interface MockWorld {
  partnerId: string;
  tenants: Map<string, MockTenant>;
  webhooks: Schemas["Webhook"][];
  deliveries: Map<string, Schemas["Delivery"][]>;
  branding: Schemas["Branding"];
  contract: Schemas["Contract"];
  onboardingJobs: Schemas["OnboardingJob"][];
  idempotency: Map<string, { fingerprint: string; status: number; body: string }>;
}

/** Lives on globalThis so dev-server hot reloads keep the seller's mock edits. */
const KEY = Symbol.for("sepordi.bizin.mock.world");
type WithWorld = typeof globalThis & { [KEY]?: MockWorld };

export function getWorld(create: () => MockWorld): MockWorld {
  const g = globalThis as WithWorld;
  g[KEY] ??= create();
  return g[KEY];
}

export function resetWorld(): void {
  delete (globalThis as WithWorld)[KEY];
}
