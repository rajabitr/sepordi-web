import "server-only";

import { mulberry32 } from "@/lib/utils";

import type { Schemas } from "../schema";
import { DEMO_SHOPS, demoOwnerId, type Rand, tenantRand, uuidFrom } from "./demo";
import { mockPng } from "./png";
import type { MockTenant, MockWorld } from "./state";

export { DEMO_SHOPS, uuidFrom };

type Flavor = "jewelry" | "coffee";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const iso = (ms: number) => new Date(ms).toISOString();
const pick = <T,>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length)];

// ---- catalogue ---------------------------------------------------------------------------------------------

interface ProductSeed {
  ext: string;
  title: string;
  category: string;
  description: string;
  /** [variant title, price in Rial, stock] */
  variants: [string, number, number | null][];
}

const JEWELRY: ProductSeed[] = [
  { ext: "NL-101", title: "گردنبند نقره‌ی ماه", category: "گردنبند", description: "نقره‌ی ۹۲۵ با آبکاری رودیوم، زنجیر ۴۵ سانتی.", variants: [["نقره‌ای", 18_500_000, 7], ["طلایی", 19_800_000, 3]] },
  { ext: "NL-102", title: "دستبند چرم و مهره", category: "دستبند", description: "چرم طبیعی با مهره‌ی فیروزه‌ی نیشابور، قابل تنظیم.", variants: [["قهوه‌ای", 6_200_000, 12], ["مشکی", 6_200_000, 0]] },
  { ext: "NL-103", title: "گوشواره‌ی آویز اشک", category: "گوشواره", description: "نقره با سنگ عقیق سبز، وزن سبک برای استفاده‌ی روزانه.", variants: [["عقیق سبز", 9_400_000, 5]] },
  { ext: "NL-104", title: "انگشتر فیروزه", category: "انگشتر", description: "فیروزه‌ی اصل در رکاب نقره‌ی دست‌ساز.", variants: [["سایز ۵۴", 24_000_000, 2], ["سایز ۵۶", 24_000_000, 1], ["سایز ۵۸", 24_000_000, 0]] },
  { ext: "NL-105", title: "پابند ظریف ستاره", category: "پابند", description: "نقره‌ی ۹۲۵ با آویزهای ستاره.", variants: [["نقره‌ای", 4_800_000, 20]] },
  { ext: "NL-106", title: "ست گردنبند و گوشواره‌ی مروارید", category: "ست", description: "مروارید پرورشی با قفل نقره، داخل جعبه‌ی هدیه.", variants: [["سفید", 32_500_000, 4]] },
  { ext: "NL-107", title: "دستبند اسم دلخواه", category: "دستبند", description: "حک اسم فارسی یا انگلیسی تا ۸ حرف؛ آماده‌سازی ۳ روز کاری.", variants: [["نقره", 11_500_000, null], ["طلا ۱۸ عیار", 68_000_000, null]] },
  { ext: "NL-108", title: "گیره‌ی مو مینیاتوری", category: "اکسسوری مو", description: "نقاشی مینیاتور روی صدف.", variants: [["طرح گل", 3_200_000, 9], ["طرح پرنده", 3_200_000, 6]] },
  { ext: "NL-109", title: "آویز ساعت جیبی", category: "آویز", description: "برنج آنتیک با زنجیر ۸۰ سانتی.", variants: [["برنجی", 7_900_000, 3]] },
  { ext: "NL-110", title: "انگشتر حلقه‌ای ساده", category: "انگشتر", description: "نقره‌ی مات، مناسب ست کردن.", variants: [["سایز ۵۲", 5_600_000, 8], ["سایز ۵۴", 5_600_000, 10], ["سایز ۵۶", 5_600_000, 4]] },
  { ext: "NL-111", title: "جعبه‌ی جواهر مخمل", category: "بسته‌بندی", description: "جعبه‌ی هدیه‌ی مخمل سرمه‌ای.", variants: [["کوچک", 1_500_000, 30], ["بزرگ", 2_400_000, 14]] },
  { ext: "NL-112", title: "گردنبند حرف اول اسم", category: "گردنبند", description: "حروف فارسی، نقره با آبکاری طلا.", variants: [["نقره‌ای", 8_900_000, null], ["طلایی", 9_600_000, null]] },
];

const COFFEE: ProductSeed[] = [
  { ext: "RS-201", title: "قهوه‌ی اسپرسو بلند رستا", category: "دانه‌ی قهوه", description: "۷۰٪ عربیکا، ۳۰٪ روبوستا؛ رست متوسط رو به تیره.", variants: [["۲۵۰ گرم", 4_900_000, 40], ["۱ کیلو", 17_500_000, 12]] },
  { ext: "RS-202", title: "قهوه‌ی اتیوپی یرگاچف", category: "دانه‌ی قهوه", description: "تک‌خاستگاه، نت‌های گل و مرکبات؛ مناسب دم‌آوری.", variants: [["۲۵۰ گرم", 7_800_000, 18]] },
  { ext: "RS-203", title: "قهوه‌ی برزیل سانتوس", category: "دانه‌ی قهوه", description: "شکلاتی و کم‌اسید، مناسب موکاپات.", variants: [["۲۵۰ گرم", 5_600_000, 25], ["۵۰۰ گرم", 10_400_000, 9]] },
  { ext: "RS-204", title: "موکاپات ۳ کاپ", category: "تجهیزات", description: "آلومینیوم، دسته‌ی ضدحرارت.", variants: [["نقره‌ای", 12_900_000, 6]] },
  { ext: "RS-205", title: "فرنچ‌پرس ۶۰۰ میلی‌لیتر", category: "تجهیزات", description: "شیشه‌ی نسوز با فیلتر استیل.", variants: [["مشکی", 9_500_000, 4]] },
  { ext: "RS-206", title: "آسیاب دستی سرامیکی", category: "تجهیزات", description: "تیغه‌ی سرامیکی با ۱۸ درجه‌ی آسیاب.", variants: [["استیل", 21_000_000, 3]] },
  { ext: "RS-207", title: "پودر هات‌چاکلت", category: "نوشیدنی", description: "کاکائوی هلندی با شیر خشک.", variants: [["۵۰۰ گرم", 4_200_000, 22]] },
  { ext: "RS-208", title: "بسته‌ی هدیه‌ی قهوه", category: "هدیه", description: "سه قهوه‌ی ۱۰۰ گرمی با ماگ سرامیکی.", variants: [["استاندارد", 15_800_000, 8]] },
];

function seedProducts(rand: Rand, flavor: Flavor, now: number): Schemas["Product"][] {
  const list = flavor === "jewelry" ? JEWELRY : COFFEE;
  return list.map((p, i) => {
    const created = now - (40 - i) * DAY;
    return {
      id: uuidFrom(rand),
      external_id: p.ext,
      title: p.title,
      description: p.description,
      category: p.category,
      sku: p.ext,
      active: true,
      currency: "IRR",
      price_exponent: 0,
      variants: p.variants.map(([title, price, stock], j) => ({
        id: uuidFrom(rand),
        external_id: `${p.ext}-${j + 1}`,
        title,
        price,
        stock,
        active: true,
      })),
      created_at: iso(created),
      updated_at: iso(created + 3 * DAY),
    };
  });
}

// ---- people and conversations ------------------------------------------------------------------------------

const CUSTOMERS: [string, string][] = [
  ["سارا محمدی", "+989121234567"],
  ["علی رضایی", "+989351112233"],
  ["مریم احمدی", "+989194445566"],
  ["رضا کریمی", "+989127778899"],
  ["نگار حسینی", "+989301234455"],
  ["امیر جعفری", "+989128889900"],
  ["زهرا موسوی", "+989133332211"],
  ["حمید نوری", "+989156667788"],
  ["الهام صادقی", "+989124443322"],
  ["کاوه رحیمی", "+989371119988"],
  ["پریسا قاسمی", "+989122225544"],
  ["مهدی عباسی", "+989198887766"],
  ["شیما یوسفی", "+989135556677"],
  ["بهنام طاهری", "+989123339900"],
  ["فاطمه اکبری", "+989306668844"],
];

type Line = [sender: "customer" | "ai" | "human", text: string, kind?: "image"];

function dialogue(product: Schemas["Product"], i: number): Line[] {
  const v = product.variants[0];
  const toman = (v.price / 10).toLocaleString("en-US");
  const scripts: Line[][] = [
    [
      ["customer", `سلام، ${product.title} موجود دارید؟`],
      ["ai", `سلام، وقت‌تان بخیر. بله، ${product.title} (${v.title}) موجود است و قیمتش ${toman} تومان است.`],
      ["customer", "ارسال به شیراز چند روز طول می‌کشد؟"],
      ["ai", "ارسال با پست پیشتاز معمولاً ۲ تا ۴ روز کاری طول می‌کشد."],
    ],
    [
      ["customer", "قیمت این چنده؟"],
      ["customer", "", "image"],
      ["ai", `این ${product.title} است؛ ${toman} تومان. اگر بخواهید همین حالا سفارش را ثبت می‌کنم.`],
      ["customer", "باشه، یکی برام ثبت کن"],
      ["ai", "سفارش ثبت شد. شماره کارت برای واریز را برای‌تان می‌فرستم."],
    ],
    [
      ["customer", "سلام، می‌خوام با خود فروشنده صحبت کنم"],
      ["ai", "حتماً. گفت‌وگو را به همکارم می‌سپارم؛ به‌زودی جواب می‌دهد."],
    ],
    [
      ["customer", "واریز کردم، این رسیدش"],
      ["customer", "", "image"],
      ["ai", "رسید را دریافت کردم. بعد از بررسی فروشنده، سفارش‌تان تأیید می‌شود."],
    ],
    [
      ["customer", "تخفیف ندارید برای دو تا؟"],
      ["ai", "درباره‌ی تخفیف باید از فروشنده بپرسم. گفت‌وگو را به همکارم سپردم."],
      ["human", "سلام، برای خرید دوتایی ۱۰٪ تخفیف می‌دهیم."],
      ["customer", "عالیه، ممنون"],
    ],
  ];
  return scripts[i % scripts.length];
}

interface ConversationPlan {
  state: Schemas["HandoffState"];
  script: number;
  handoff?: { reason: string; reason_class: Schemas["HandoffClass"]; priority: Schemas["HandoffPriority"]; queue: Schemas["HandoffQueue"] };
}

const PLANS: ConversationPlan[] = [
  { state: "handoff", script: 3, handoff: { reason: "receipt_received", reason_class: "PAYMENT_VERIFICATION", priority: "high", queue: "accounting" } },
  { state: "handoff", script: 2, handoff: { reason: "customer_request", reason_class: "EXPLICIT_HUMAN_REQUEST", priority: "normal", queue: "support" } },
  { state: "human", script: 4 },
  { state: "ai", script: 0 },
  { state: "ai", script: 1 },
  { state: "handoff", script: 4, handoff: { reason: "discount_request", reason_class: "POLICY_REQUIRED", priority: "normal", queue: "sales" } },
  { state: "ai", script: 0 },
  { state: "ai", script: 1 },
  { state: "human", script: 4 },
  { state: "ai", script: 0 },
  { state: "handoff", script: 3, handoff: { reason: "receipt_received", reason_class: "PAYMENT_VERIFICATION", priority: "high", queue: "accounting" } },
  { state: "ai", script: 1 },
  { state: "ai", script: 0 },
  { state: "ai", script: 0 },
  { state: "ai", script: 1 },
];

// ---- orders ----------------------------------------------------------------------------------------------

const ORDER_PLAN: [Schemas["OrderStatus"], Schemas["PaymentStatus"]][] = [
  ["confirmed", "pending_verification"],
  ["confirmed", "pending_verification"],
  ["confirmed", "pending_verification"],
  ["confirmed", "unpaid"],
  ["confirmed", "unpaid"],
  ["confirmed", "rejected"],
  ["draft", "unpaid"],
  ["draft", "unpaid"],
  ["paid", "paid"],
  ["paid", "paid"],
  ["paid", "paid"],
  ["paid", "paid"],
  ["packing", "paid"],
  ["packing", "paid"],
  ["shipped", "paid"],
  ["shipped", "paid"],
  ["shipped", "paid"],
  ["delivered", "paid"],
  ["delivered", "paid"],
  ["cancelled", "unpaid"],
];

const PROVINCES = ["تهران", "اصفهان", "فارس", "خراسان رضوی", "البرز", "گیلان"] as const;

function seedShipping(now: number): Schemas["Shipping"] {
  return {
    enabled: true,
    default_fee: 600_000,
    free_over: 50_000_000,
    rates: [
      { province: "تهران", city: "تهران", fee: 300_000 },
      { province: "تهران", fee: 400_000 },
      { province: "البرز", fee: 450_000 },
      { province: "اصفهان", fee: 550_000 },
      { province: "فارس", fee: 600_000 },
      { province: "خراسان رضوی", fee: 650_000 },
    ],
    currency: "IRR",
    minor_unit: 0,
    updated_at: iso(now - 12 * DAY),
  };
}

function shippingFee(s: Schemas["Shipping"], province: string, subtotal: number): number {
  if (s.free_over !== null && subtotal >= s.free_over) return 0;
  return s.rates.find((r) => r.province === province && !r.city)?.fee ?? s.default_fee ?? 0;
}

// ---- tenant ------------------------------------------------------------------------------------------------

export function seedTenant(
  world: MockWorld,
  init: { ext: string; name: string; flavor: Flavor; ownerExternalId: string; ownerEmail: string; ownerStatus?: "pending" | "active"; now: number; demo: boolean },
): MockTenant {
  const rand = tenantRand(init.ext);
  const { now } = init;
  const tenantId = uuidFrom(rand);
  const created = init.demo ? now - 45 * DAY : now;

  const channels: Schemas["Channel"][] = init.demo
    ? [
        { channel_id: uuidFrom(rand), kind: "whatsapp", status: "connected", connected_at: iso(created + DAY), health: { state: "ok", reason: "none", since: iso(now - 3 * DAY) } },
        ...(init.flavor === "jewelry"
          ? [{ channel_id: uuidFrom(rand), kind: "instagram", status: "connected", connected_at: iso(created + 2 * DAY), health: { state: "quiet", reason: "idle", since: iso(now - 9 * HOUR) } } satisfies Schemas["Channel"]]
          : []),
      ]
    : [];

  const products = init.demo ? seedProducts(rand, init.flavor, now) : [];
  const shipping = seedShipping(now);
  const media = new Map<string, { mime: string; bytes: Buffer }>();
  const conversations: Schemas["Conversation"][] = [];
  const messages = new Map<string, Schemas["Message"][]>();
  const orders: Schemas["Order"][] = [];
  const evidence = new Map<string, Schemas["Evidence"][]>();
  const evidenceText = new Map<string, string>();
  const mediaPath = (id: string) => `/partner/v1/tenants/${encodeURIComponent(init.ext)}/media/${id}`;

  if (init.demo && products.length) {
    // orders first, so receipt conversations can point at them
    ORDER_PLAN.forEach(([status, payment], i) => {
      const [name, phone] = CUSTOMERS[i % CUSTOMERS.length];
      const province = PROVINCES[i % PROVINCES.length];
      const lines = 1 + (i % 3 === 0 ? 1 : 0);
      const items: Schemas["OrderItem"][] = Array.from({ length: lines }, (_, j) => {
        const p = products[(i * 3 + j * 5) % products.length];
        const v = p.variants[(i + j) % p.variants.length];
        const quantity = 1 + ((i + j) % 2);
        return { title: p.title, variant_name: v.title, quantity, unit_price: v.price, line_total: v.price * quantity };
      });
      const subtotal = items.reduce((s, it) => s + it.line_total, 0);
      const fee = shippingFee(shipping, province, subtotal);
      const createdAt = now - (i * 31 + 20) * HOUR;
      const paidAt = payment === "paid" ? createdAt + 5 * HOUR : null;
      const order: Schemas["Order"] = {
        id: uuidFrom(rand),
        code: `B-${1040 + ORDER_PLAN.length - i}`,
        status,
        source: i % 4 === 3 ? "dashboard" : "ai",
        created_at: iso(createdAt),
        updated_at: iso(createdAt + 6 * HOUR),
        items,
        totals: { subtotal, shipping: fee, shipping_basis: fee === 0 ? "free" : "province", shipping_zone: province, total: subtotal + fee, currency: "IRR", minor_unit: 0 },
        customer: { name, phone, channel: i % 3 === 1 ? "instagram" : "whatsapp", conversation_id: null },
        payment: {
          method: "card_to_card",
          status: payment,
          receipt_received: payment !== "unpaid",
          pending_evidence: payment === "pending_verification" ? 1 : 0,
          paid_at: paidAt ? iso(paidAt) : null,
        },
        confirmed_at: status === "draft" ? null : iso(createdAt + HOUR),
        paid_at: paidAt ? iso(paidAt) : null,
        packing_at: ["packing", "shipped", "delivered"].includes(status) ? iso(createdAt + 10 * HOUR) : null,
        shipped_at: ["shipped", "delivered"].includes(status) ? iso(createdAt + 26 * HOUR) : null,
        cancelled_at: status === "cancelled" ? iso(createdAt + 8 * HOUR) : null,
      };
      orders.push(order);

      if (payment !== "unpaid") {
        const isText = i === 2;
        const ev: Schemas["Evidence"] = {
          id: uuidFrom(rand),
          order_id: order.id,
          kind: isText ? "text" : "image",
          status: payment === "pending_verification" ? "pending_verification" : payment === "rejected" ? "rejected" : "approved",
          created_at: iso(createdAt + 3 * HOUR),
          expected_amount: order.totals.total,
          currency: "IRR",
          minor_unit: 0,
          decided_at: payment === "pending_verification" ? null : iso(createdAt + 5 * HOUR),
          decided_by: payment === "pending_verification" ? null : "user",
          reject_reason: payment === "rejected" ? "amount_mismatch" : null,
          note: payment === "rejected" ? "مبلغ واریزی کمتر از جمع سفارش است." : "",
          closed_reason: null,
          has_content: true,
        };
        evidence.set(order.id, [ev]);
        if (isText) evidenceText.set(ev.id, `واریز شد. شماره پیگیری ۸۴۲۱۹۳ — ${order.totals.total / 10} تومان از کارت ملت`);
        else media.set(`evidence:${ev.id}`, { mime: "image/png", bytes: mockPng(240, 360, [236, 240, 248], [210, 220, 236]) });
      }
    });

    PLANS.forEach((plan, i) => {
      const [name, phone] = CUSTOMERS[i];
      const channel: Schemas["ChannelKind"] = init.flavor === "jewelry" && i % 3 === 1 ? "instagram" : i === 7 ? "telegram" : "whatsapp";
      const id = uuidFrom(rand);
      const product = products[(i * 2) % products.length];
      const start = now - (i * 2 + 1) * HOUR - i * 7 * MIN;
      const thread: Schemas["Message"][] = dialogue(product, plan.script).map(([sender, text, kind], j) => {
        const mid = uuidFrom(rand);
        let m: Schemas["Message"]["media"] = null;
        if (kind === "image") {
          const receipt = plan.script === 3;
          const bytes = receipt ? mockPng(240, 360, [236, 240, 248], [210, 220, 236]) : mockPng(320, 320, [123, 98, 255], [43, 36, 81]);
          const mediaId = uuidFrom(rand);
          media.set(`media:${mediaId}`, { mime: "image/png", bytes });
          m = { id: mediaId, mime: "image/png", size: bytes.length, path: mediaPath(mediaId) };
        }
        return {
          id: mid,
          conversation_id: id,
          direction: sender === "customer" ? "in" : "out",
          sender,
          kind: kind ?? "text",
          text,
          status: sender === "customer" ? "received" : "read",
          created_at: iso(start + j * 3 * MIN),
          media: m,
        };
      });
      messages.set(id, thread);
      const last = thread[thread.length - 1];
      const lastCustomer = [...thread].reverse().find((m) => m.sender === "customer");
      const receiptOrder = plan.handoff?.reason_class === "PAYMENT_VERIFICATION" ? orders.find((o) => o.payment.status === "pending_verification" && !o.customer.conversation_id) : undefined;
      if (receiptOrder) {
        receiptOrder.customer = { name, phone, channel, conversation_id: id };
      }
      conversations.push({
        id,
        channel_kind: channel,
        status: "open",
        state: plan.state,
        handoff: plan.handoff ? { reason: plan.handoff.reason, raised_at: iso(start + 6 * MIN), reason_class: plan.handoff.reason_class, priority: plan.handoff.priority } : null,
        held_since: plan.state === "human" ? iso(start + 7 * MIN) : null,
        customer: { id: uuidFrom(rand), display_name: name, phone: channel === "whatsapp" ? phone : null },
        last_message: last,
        last_message_at: last.created_at,
        last_customer_message_at: lastCustomer?.created_at ?? null,
        reply_window_closes_at: channel === "instagram" && lastCustomer ? iso(Date.parse(lastCustomer.created_at) + DAY) : null,
        ...(plan.handoff ? { queue: plan.handoff.queue } : {}),
        ...(receiptOrder
          ? {
              intent: { code: "payment.receipt.submit", parent: "payment.receipt", at: iso(start) },
              related_order: { id: receiptOrder.id, code: receiptOrder.code, status: receiptOrder.status, payment_status: receiptOrder.payment.status },
            }
          : {}),
      });
    });
  }

  const shipped = orders.filter((o) => o.status === "shipped" || o.status === "delivered");
  const cases: Schemas["Case"][] = [];
  if (init.demo && shipped.length >= 3) {
    const kinds: [Schemas["CaseKind"], Schemas["CaseState"], string][] = [
      ["return", "open", "سایز انگشتر کوچک است، می‌خواهم پس بدهم."],
      ["exchange", "awaiting_customer", "رنگ را اشتباه فرستادید، طلایی سفارش داده بودم."],
      ["complaint", "accepted", "بسته دیر رسید و جعبه آسیب دیده بود."],
    ];
    kinds.forEach(([kind, state, text], i) => {
      const order = shipped[i];
      const conv = conversations[(i + 3) % conversations.length];
      const photos: Schemas["CasePhoto"][] =
        i === 0
          ? [0, 1].map(() => {
              const pid = uuidFrom(rand);
              const bytes = mockPng(300, 300, [43, 36, 81], [123, 98, 255]);
              media.set(`case:${pid}`, { mime: "image/png", bytes });
              return { id: pid, content_type: "image/png", bytes: bytes.length, created_at: iso(now - (2 - i) * DAY) };
            })
          : [];
      const createdAt = now - (3 - i) * DAY;
      const events: Schemas["CaseEvent"][] = [
        { seq: 1, action: "opened", actor: "assistant", from_state: null, to_state: "open", notice: "sent", occurred_at: iso(createdAt) },
        ...photos.map((_, k) => ({ seq: 2 + k, action: "photo_added" as const, actor: "customer" as const, from_state: "open" as const, to_state: "open" as const, notice: null, occurred_at: iso(createdAt + (k + 1) * 10 * MIN) })),
        ...(state === "awaiting_customer" ? [{ seq: 2, action: "request_info" as const, actor: "seller" as const, from_state: "open" as const, to_state: "awaiting_customer" as const, notice: "sent" as const, occurred_at: iso(createdAt + 2 * HOUR) }] : []),
        ...(state === "accepted" ? [{ seq: 2, action: "accept" as const, actor: "seller" as const, from_state: "open" as const, to_state: "accepted" as const, notice: "sent" as const, occurred_at: iso(createdAt + 3 * HOUR) }] : []),
      ];
      cases.push({
        id: uuidFrom(rand),
        code: `R${12 + i}`,
        kind,
        state,
        order: { id: order.id, code: order.code },
        order_unresolved: false,
        days_since_ship: 2 + i,
        customer: { name: order.customer.name ?? null, phone: order.customer.phone ?? null, channel: conv.channel_kind, conversation_id: conv.id },
        reject_reason: null,
        refund: null,
        photo_count: photos.length,
        created_at: iso(createdAt),
        updated_at: iso(events[events.length - 1].occurred_at ? Date.parse(events[events.length - 1].occurred_at) : createdAt),
        customer_text: text,
        note: "",
        photos,
        events,
      });
    });
  }

  const stats: Schemas["StatsDay"][] = Array.from({ length: 30 }, (_, k) => {
    const day = new Date(now - (29 - k) * DAY);
    const started = init.demo ? Math.round(14 + rand() * 22 + k * 0.6) : 0;
    const automated = Math.round(started * (2.4 + rand()));
    return {
      date: day.toISOString().slice(0, 10),
      conversations_started: started,
      automated_replies: automated,
      handoffs: Math.round(started * (0.08 + rand() * 0.1)),
      orders_created: Math.round(started * (0.15 + rand() * 0.15)),
    };
  });

  const features: Schemas["Feature"][] = ["channel.whatsapp", "channel.instagram", "channel.telegram", "inbox.api", "payments.verification", "returns.cases", "shipping.rules"];

  return {
    detail: {
      tenant: { id: tenantId, external_business_id: init.ext, name: init.name, status: "active", reply_language: "fa", market_profile: "ir", created_at: iso(created) },
      owner: { user_id: uuidFrom(rand), external_user_id: init.ownerExternalId, status: init.ownerStatus ?? "pending" },
      channels,
      credit: { state: "ok" },
    },
    ownerEmail: init.ownerEmail,
    metadata: null,
    stats,
    pairings: new Map(),
    products,
    assistant: init.demo
      ? {
          enabled: true,
          auto_reply: true,
          reply_language: "fa",
          persona_name: init.flavor === "jewelry" ? "نیلا" : "رستا",
          business_profile:
            init.flavor === "jewelry"
              ? "گالری نیلا زیورآلات نقره‌ی دست‌ساز می‌فروشد. ارسال به سراسر ایران با پست پیشتاز، ۲ تا ۴ روز کاری. پرداخت کارت‌به‌کارت؛ سفارش بعد از تأیید رسید ارسال می‌شود. ساعت پاسخ‌گویی انسانی: شنبه تا پنجشنبه ۱۰ تا ۱۹."
              : "قهوه‌ی رستا دانه‌ی قهوه‌ی تازه‌برشته و تجهیزات دم‌آوری می‌فروشد. سفارش‌های تهران همان روز با پیک ارسال می‌شود.",
          updated_at: iso(now - 6 * DAY),
        }
      : { enabled: false, auto_reply: false, reply_language: "fa", persona_name: "", business_profile: "", updated_at: iso(now) },
    returnPolicy: init.demo ? { enabled: true, window_days: 7, conditions: "کالا سالم و در بسته‌بندی اصلی باشد. هزینه‌ی ارسال مرجوعی با مشتری است، مگر کالا ایراد داشته باشد.", updated_at: iso(now - 10 * DAY) } : null,
    paymentDetails: init.demo
      ? { configured: true, card_number_last4: "4721", iban_last4: "0153", holder_name: init.flavor === "jewelry" ? "نیلوفر کاظمی" : "رستا مرادی", bank_name: "ملت" }
      : { configured: false, card_number_last4: null, iban_last4: null, holder_name: "", bank_name: "" },
    shipping: init.demo ? shipping : { enabled: false, default_fee: null, free_over: null, rates: [], currency: "IRR", minor_unit: 0, updated_at: null },
    conversations,
    messages,
    optedOut: new Set(),
    orders,
    evidence,
    evidenceText,
    cases,
    media,
    entitlements: {
      external_business_id: init.ext,
      contract_version: 1,
      features: Object.fromEntries(features.map((f) => [f, { allowed: true, source: "contract" as const }])),
      limits: { "channels.max": { value: null, used: channels.length, source: "contract" } },
    },
    catalogJobs: [],
  };
}

export function seedWorld(now = Date.now()): MockWorld {
  const rand = mulberry32(1405);
  const world: MockWorld = {
    partnerId: uuidFrom(rand),
    tenants: new Map(),
    webhooks: [],
    deliveries: new Map(),
    branding: {
      mode: "partner",
      names: { fa: "سپردی", en: "Sepordi" },
      support_label: { fa: "پشتیبانی سپردی" },
      support_url: "https://sepordi.ir/contact",
      logo_url: null,
      disclosures: {
        fa: { text: "این پاسخ‌ها را دستیار هوشمند سپردی می‌نویسد. برای گفت‌وگو با فروشنده بنویسید «اپراتور».", source: "brand" },
        en: { text: "Replies here are written by Sepordi's AI assistant. Type 'agent' to talk to a person.", source: "default" },
        ar: { text: "يكتب هذه الردود مساعد سپردی الذكي. اكتب «موظف» للتحدث مع شخص.", source: "default" },
      },
      updated_at: iso(now - 20 * DAY),
    },
    contract: {
      contract: { version: 1, effective_from: iso(now - 60 * DAY), commercial_ref: null },
      features: ["channel.whatsapp", "channel.instagram", "channel.telegram", "inbox.api", "payments.verification", "returns.cases", "shipping.rules", "flows.advanced"],
      limits: { "tenants.max": { value: 1000, used: DEMO_SHOPS.length } },
      next: null,
    },
    onboardingJobs: [],
    idempotency: new Map(),
  };

  DEMO_SHOPS.forEach((s) => {
    world.tenants.set(
      s.ext,
      seedTenant(world, { ext: s.ext, name: s.name, flavor: s.flavor, ownerExternalId: demoOwnerId(s.ext), ownerEmail: s.ownerEmail, now, demo: true }),
    );
  });

  const hookId = uuidFrom(rand);
  world.webhooks.push({
    id: hookId,
    url: "https://sepordi.ir/api/webhooks/bizin",
    event_types: ["*"],
    status: "active",
    disabled_reason: null,
    consecutive_failures: 0,
    description: "رویدادهای همه‌ی فروشگاه‌ها",
    created_at: iso(now - 30 * DAY),
    updated_at: iso(now - 30 * DAY),
  });
  const types: Schemas["EventType"][] = ["order.created", "message.received", "handoff.raised", "payment.evidence_received", "ping"];
  world.deliveries.set(
    hookId,
    Array.from({ length: 8 }, (_, i) => ({
      event_id: `evt_${uuidFrom(rand)}`,
      event_type: pick(rand, types),
      occurred_at: iso(now - i * 37 * MIN),
      state: i === 3 ? "pending" : "delivered",
      attempts: i === 3 ? 2 : 1,
      last_status: i === 3 ? 503 : 200,
      last_error: i === 3 ? "http_5xx" : null,
      last_attempt_at: iso(now - i * 37 * MIN + 2000),
      delivered_at: i === 3 ? null : iso(now - i * 37 * MIN + 1500),
    })),
  );
  return world;
}
