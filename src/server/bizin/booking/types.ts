/*
 * Partner API booking surface, hand-written from docs/handover/2026-10-24-partner-booking-api.md §9 (the OpenAPI patch
 * that PB-1 applies to openapi-v1.yaml). When `npm run gen:bizin` starts emitting these schemas, switch to `Schemas[…]`.
 * Pure types and enum lists: client components import them too.
 *
 * Money is an integer in the market storage unit (`ir`: whole Rial, `price_exponent` 0). Instants are RFC 3339 UTC;
 * civil dates are YYYY-MM-DD in the business's `timezone`.
 */

export const BOOKING_STATUSES = [
  "pending_approval",
  "pending_payment",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
  "expired",
] as const;
/** Extensible: an unknown value from a newer Bizin is shown as «سایر». */
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_PAYMENT_STATES = ["none", "awaiting", "receipt_received", "confirmed", "rejected", "refund_due"] as const;
export type BookingPaymentState = (typeof BOOKING_PAYMENT_STATES)[number];

export type BookingSource = "ai" | "flow" | "panel" | "import" | "partner";
export const CONFIRMATION_MODES = ["auto", "seller", "payment"] as const;
export type BookingConfirmationMode = (typeof CONFIRMATION_MODES)[number];

export type BookingSlotReason =
  | "in_the_past"
  | "outside_horizon"
  | "closed_holiday"
  | "closed_by_seller"
  | "no_schedule"
  | "blocked"
  | "before_min_notice"
  | "fully_booked"
  | "max_per_day"
  | "customer_limit_reached"
  | "duration_does_not_fit";

export const CATEGORY_KINDS = ["in_person", "online", "phone", "on_site", "other"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];
export const CATEGORY_COLORS = ["teal", "blue", "violet", "amber", "rose", "slate", "green", "orange"] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];
export const RESOURCE_KINDS = ["person", "room", "equipment", "line"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export const EXCEPTION_KINDS = ["closed", "open", "hours", "block"] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];
export const SLOT_STEPS = [5, 10, 15, 20, 30, 60] as const;
export const BOOKING_CHANNELS = ["instagram", "telegram", "whatsapp"] as const;

export interface BookingInterval {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  start_min: number;
  /** Past 1440 runs into the next morning; at most 1440 after start_min. */
  end_min: number;
}

export interface BookingSettings {
  assistant_enabled: boolean;
  timezone: string;
  holidays_close_booking: boolean;
  horizon_days: number;
  min_notice_min: number;
  slot_step_min: number;
  max_per_day: number | null;
  max_active_per_customer: number;
  cancel_cutoff_min: number;
  hold_ttl_min: number;
  payment_window_min: number;
  payment_instructions: string;
  when_full: "tell" | "handoff";
  offers_per_reply: number;
  no_show_after_min: number;
  reminder_offsets_min: number[];
  notify_sms: boolean;
  config_version: number;
  updated_at: string | null;
}

export type BookingSettingsPut = { assistant_enabled: boolean } & Partial<
  Omit<BookingSettings, "assistant_enabled" | "timezone" | "config_version" | "updated_at">
>;

export interface BookingCategory {
  id: string;
  external_id: string | null;
  title: string;
  kind: CategoryKind;
  color: CategoryColor;
  position: number;
  archived_at: string | null;
}

export interface BookingCategoryPut {
  title: string;
  kind: CategoryKind;
  color?: CategoryColor;
  position?: number;
}

export interface BookingResource {
  id: string;
  external_id: string | null;
  title: string;
  kind: ResourceKind;
  capacity: number;
  schedule_id: string | null;
  schedule_external_id: string | null;
  is_default: boolean;
  position: number;
  archived_at: string | null;
}

export interface BookingResourcePut {
  title: string;
  kind?: ResourceKind;
  capacity: number;
  schedule_id?: string | null;
  schedule_external_id?: string | null;
  position?: number;
}

export interface BookingHours {
  schedule_id: string;
  intervals: BookingInterval[];
}

export interface BookingSchedule {
  id: string;
  external_id: string | null;
  title: string;
  is_default: boolean;
  intervals: BookingInterval[];
}

export interface BookingSchedulePut {
  title: string;
  intervals: BookingInterval[];
}

export interface BookingService {
  id: string;
  external_id: string | null;
  category_id: string;
  category_external_id: string | null;
  title: string;
  description: string;
  duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  price: number | null;
  deposit: number | null;
  currency: string;
  price_exponent: number;
  confirmation_mode: BookingConfirmationMode;
  location_text: string;
  online_link: string;
  require_phone: boolean;
  offer_in_chat: boolean;
  channels: string[];
  schedule_id: string | null;
  schedule_external_id: string | null;
  horizon_days: number | null;
  min_notice_min: number | null;
  slot_step_min: number | null;
  max_per_day: number | null;
  max_active_per_customer: number | null;
  cancel_cutoff_min: number | null;
  resource_ids: string[];
  resource_external_ids: (string | null)[];
  active: boolean;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Exactly one of category_id / category_external_id; at most one of each other id pair. */
export interface BookingServicePut {
  category_id?: string;
  category_external_id?: string;
  title: string;
  description?: string;
  duration_min: number;
  buffer_before_min?: number;
  buffer_after_min?: number;
  price?: number | null;
  deposit?: number | null;
  confirmation_mode?: BookingConfirmationMode;
  location_text?: string;
  online_link?: string;
  require_phone?: boolean;
  offer_in_chat?: boolean;
  channels?: string[];
  schedule_id?: string | null;
  schedule_external_id?: string | null;
  horizon_days?: number | null;
  min_notice_min?: number | null;
  slot_step_min?: number | null;
  max_per_day?: number | null;
  max_active_per_customer?: number | null;
  cancel_cutoff_min?: number | null;
  resource_ids?: string[];
  resource_external_ids?: string[];
  active: boolean;
  position?: number;
}

export type Written<T> = T & { created: boolean };

export interface BookingException {
  id: string;
  on_date: string;
  kind: ExceptionKind;
  start_min: number | null;
  end_min: number | null;
  service_id: string | null;
  service_external_id: string | null;
  resource_id: string | null;
  resource_external_id: string | null;
  note: string;
  created_at: string;
}

export interface BookingExceptionCreate {
  on_date: string;
  kind: ExceptionKind;
  start_min?: number;
  end_min?: number;
  service_id?: string;
  service_external_id?: string;
  resource_id?: string;
  resource_external_id?: string;
  note?: string;
}

export interface BookingDayOverride {
  date: string;
  kind: "open" | "closed";
  note: string;
}

export interface BookingDayReason {
  code: string;
  kind?: string;
  title_fa?: string;
  title_en?: string;
  tentative?: boolean;
  note?: string;
}

export interface BookingDay {
  date: string;
  /** open | closed | half_day, extensible. */
  status: string;
  closes_at_min: number | null;
  weekend: boolean;
  reasons: BookingDayReason[];
}

export interface BookingDays {
  from: string;
  to: string;
  timezone: string;
  days: BookingDay[];
  overrides: BookingDayOverride[];
}

export interface BookingSlot {
  starts_at: string;
  ends_at: string;
  resource_id: string;
  resource_external_id: string | null;
  local_date: string;
  local_start_min: number;
  local_end_date: string;
  local_end_min: number;
}

export interface BookingSlots {
  service_id: string;
  service_external_id: string | null;
  timezone: string;
  from: string;
  to: string;
  horizon_end: string;
  slots: BookingSlot[];
  days: { date: string; slots: number; reason: string | null }[];
}

export interface Booking {
  id: string;
  code: string;
  status: string;
  confirmation_mode: BookingConfirmationMode;
  source: string;
  channel: string | null;
  service_id: string;
  service_external_id: string | null;
  service_title: string;
  resource_id: string;
  resource_external_id: string | null;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  conversation_id: string | null;
  customer_name: string;
  customer_phone: string;
  note: string;
  price: number | null;
  deposit: number | null;
  currency: string;
  price_exponent: number;
  payment_state: string;
  payment_due_at: string | null;
  payment_confirmed_at: string | null;
  approval_due_at: string | null;
  conflict: string;
  cancelled_by: string | null;
  cancel_reason: string;
  created_at: string;
  updated_at: string;
}

export interface BookingEvent {
  at: string;
  event: string;
  actor_kind: string;
  from_status: string | null;
  to_status: string | null;
}

export interface BookingReceipt {
  media_id: string;
  at: string;
  amount: number | null;
  reference: string;
}

export type BookingDetail = Booking & { events: BookingEvent[]; receipts: BookingReceipt[] };

export interface BookingCreate {
  service_id?: string;
  service_external_id?: string;
  resource_id?: string;
  resource_external_id?: string;
  starts_at: string;
  customer_name?: string;
  customer_phone?: string;
  note?: string;
  status?: "confirmed" | "pending_payment";
  force?: boolean;
}

export interface BookingReschedule {
  starts_at: string;
  resource_id?: string;
  resource_external_id?: string;
}

export interface ListBookingsQuery {
  from?: string;
  to?: string;
  status?: readonly string[];
  payment_state?: string;
  service_id?: string;
  service_external_id?: string;
  resource_id?: string;
  resource_external_id?: string;
  conversation_id?: string;
  has_conflict?: boolean;
  since?: string;
  sort?: "starts_at" | "-created_at";
  limit?: number;
  cursor?: string;
}

export interface Page {
  limit?: number;
  cursor?: string;
}

/** The action routes 27–34; confirm-payment and reject-payment need `payments:verify`. */
export const BOOKING_ACTIONS = [
  "approve",
  "reject",
  "cancel",
  "complete",
  "no-show",
  "confirm-payment",
  "reject-payment",
] as const;
export type BookingAction = (typeof BOOKING_ACTIONS)[number];
