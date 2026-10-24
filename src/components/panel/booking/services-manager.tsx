"use client";

import * as React from "react";
import { Archive, Pencil, Plus, Save, Tag } from "lucide-react";

import { archiveCategoryAction, archiveServiceAction, saveCategoryAction, saveServiceAction } from "@/app/panel/booking/setup-actions";
import { useIntent } from "@/components/panel/orders/use-intent";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { AmountInput } from "@/components/ui/amount-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckboxGroup } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Label } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatToman } from "@/lib/money";
import { formatTomanValue } from "@/lib/money";
import { fa } from "@/lib/utils";
import { CATEGORY_COLORS, type BookingCategory, type BookingResource, type BookingService, type CategoryColor } from "@/server/bizin/booking/types";

import { serviceInputToPut, serviceToInput, type ServiceInput } from "./inputs";
import { durationLabel } from "./model";

const MODE_OPTIONS = [
  { value: "auto", label: "خودکار" },
  { value: "seller", label: "با تأیید شما" },
  { value: "payment", label: "با بیعانه" },
];
const MODE_FA: Record<string, string> = { auto: "تأیید خودکار", seller: "با تأیید شما", payment: "با بیعانه" };
const CHANNEL_OPTIONS = [
  { value: "instagram", label: "اینستاگرام" },
  { value: "whatsapp", label: "واتس‌اپ" },
  { value: "telegram", label: "تلگرام" },
];
const COLOR_FA: Record<CategoryColor, string> = { teal: "فیروزه‌ای", blue: "آبی", violet: "بنفش", amber: "کهربایی", rose: "صورتی", slate: "خاکستری", green: "سبز", orange: "نارنجی" };

const blank = (categoryId: string): ServiceInput => ({
  title: "",
  categoryId,
  description: "",
  durationMin: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  priceToman: null,
  depositToman: null,
  mode: "seller",
  channels: ["instagram", "telegram", "whatsapp"],
  offerInChat: true,
  requirePhone: true,
  active: true,
  resourceIds: [],
  locationText: "",
  onlineLink: "",
});

/** Services and their categories (`PUT/DELETE …/services`, `…/categories`). Rows made in Bizin's panel are read-only here. */
export function ServicesManager({ services, categories, resources }: { services: BookingService[]; categories: BookingCategory[]; resources: BookingResource[] }) {
  const [editing, setEditing] = React.useState<{ ext: string | null; input: ServiceInput } | null>(null);
  const [archiving, setArchiving] = React.useState<BookingService | null>(null);
  const { begin, run } = useIntent();
  const liveCategories = categories.filter((c) => !c.archived_at);
  const live = services.filter((s) => !s.archived_at);
  const archived = services.filter((s) => s.archived_at);
  const resourceTitle = Object.fromEntries(resources.map((r) => [r.id, r.title]));

  return (
    <div className="flex flex-col gap-6">
      <CategoriesBar categories={liveCategories} services={live} />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold leading-tight">خدمت‌ها</h2>
        <Button className="min-h-11" disabled={liveCategories.length === 0} onClick={() => setEditing({ ext: null, input: blank(liveCategories[0]?.id ?? "") })}>
          <Plus className="size-4" strokeWidth={2} />
          خدمت تازه
        </Button>
      </div>

      {live.length === 0 ? (
        <EmptyState
          className="min-h-48 justify-center"
          title="هنوز خدمتی تعریف نشده"
          description={liveCategories.length === 0 ? "اول یک دسته بسازید، مثلاً «خدمات مو»، بعد خدمت‌ها را اضافه کنید." : "خدمتی مثل «کوتاهی مو» با مدت و قیمتش بسازید تا مشتری بتواند نوبت بگیرد."}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {live.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-semibold">{s.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {durationLabel(s.duration_min)} · {s.price !== null ? formatToman(s.price) : "قیمت اعلام نشده"}
                    {s.deposit ? ` · بیعانه ${formatToman(s.deposit)}` : ""}
                  </span>
                </div>
                {s.external_id && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="size-11" aria-label={`ویرایش ${s.title}`} onClick={() => setEditing({ ext: s.external_id, input: serviceToInput(s) })}>
                      <Pencil className="size-4" strokeWidth={1.5} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 text-destructive hover:text-destructive"
                      aria-label={`بایگانی ${s.title}`}
                      onClick={() => {
                        begin();
                        setArchiving(s);
                      }}
                    >
                      <Archive className="size-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <Badge variant={s.active ? "success" : "secondary"}>{s.active ? "فعال" : "غیرفعال"}</Badge>
                <Badge variant="secondary">{MODE_FA[s.confirmation_mode] ?? "سایر"}</Badge>
                {s.offer_in_chat && s.active && <Badge variant="brand">در گفت‌وگو پیشنهاد می‌شود</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {s.resource_ids.length ? `پرسنل: ${s.resource_ids.map((id) => resourceTitle[id] ?? "—").join("، ")}` : "پرسنل: همه‌ی سالن"}
              </p>
              {!s.external_id && <p className="text-xs text-muted-foreground">این خدمت در پنل بیزین ساخته شده و اینجا فقط دیده می‌شود.</p>}
            </li>
          ))}
        </ul>
      )}
      {archived.length > 0 && <p className="text-xs text-muted-foreground">{fa(archived.length)} خدمت بایگانی‌شده دارید؛ نوبت‌های گذشته‌ی آن‌ها سر جایشان است.</p>}

      {editing && (
        <ServiceSheet
          key={editing.ext ?? "new"}
          ext={editing.ext}
          initial={editing.input}
          categories={liveCategories}
          resources={resources.filter((r) => !r.archived_at && !r.is_default)}
          onClose={() => setEditing(null)}
        />
      )}

      <AlertDialog
        open={archiving !== null}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={archiving ? `«${archiving.title}» بایگانی شود؟` : ""}
        description="دیگر نوبت تازه‌ای برای این خدمت گرفته نمی‌شود. نوبت‌هایی که گرفته شده، همان‌طور می‌مانند."
        confirmText="بایگانی"
        cancelText="منصرف شدم"
        destructive
        onConfirm={async () => {
          const ext = archiving?.external_id;
          if (ext) await run((key) => archiveServiceAction(ext, key), "خدمت بایگانی شد");
        }}
      />
    </div>
  );
}

function ServiceSheet({
  ext,
  initial,
  categories,
  resources,
  onClose,
}: {
  ext: string | null;
  initial: ServiceInput;
  categories: BookingCategory[];
  resources: BookingResource[];
  onClose: () => void;
}) {
  const [v, setV] = React.useState<ServiceInput>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const { begin, run } = useIntent();
  const set = <K extends keyof ServiceInput>(k: K, value: ServiceInput[K]) => setV((p) => ({ ...p, [k]: value }));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={ext ? "ویرایش خدمت" : "خدمت تازه"} side="start" className="sm:max-w-xl">
      <div className="flex flex-col gap-4 pb-4">
        <Field label="نام خدمت" htmlFor="sv-title">
          <Input id="sv-title" value={v.title} maxLength={80} onChange={(e) => set("title", e.target.value)} placeholder="مثلاً: کوتاهی مو بانوان" />
        </Field>
        <Field label="دسته" htmlFor="sv-cat">
          <Select id="sv-cat" className="min-h-11" options={categories.map((c) => ({ value: c.id, label: c.title }))} value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="مدت (دقیقه)">
            <NumberField value={v.durationMin} min={5} max={720} step={5} onChange={(n) => set("durationMin", n)} aria-label="مدت خدمت به دقیقه" />
          </Field>
          <Field label="فاصله‌ی قبل (دقیقه)">
            <NumberField value={v.bufferBeforeMin} min={0} max={240} step={5} onChange={(n) => set("bufferBeforeMin", n)} aria-label="فاصله‌ی قبل از نوبت" />
          </Field>
          <Field label="فاصله‌ی بعد (دقیقه)">
            <NumberField value={v.bufferAfterMin} min={0} max={240} step={5} onChange={(n) => set("bufferAfterMin", n)} aria-label="فاصله‌ی بعد از نوبت" />
          </Field>
        </div>
        <Field label="قیمت" hint={v.priceToman === null ? "خالی یعنی قیمت را در گفت‌وگو اعلام نمی‌کنیم." : formatTomanValue(v.priceToman)}>
          <AmountInput value={v.priceToman} onChange={(n) => set("priceToman", n)} min={0} words={false} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <Label>روش تأیید نوبت</Label>
          <SegmentedControl aria-label="روش تأیید نوبت" options={MODE_OPTIONS} value={v.mode} onChange={(m) => set("mode", m as ServiceInput["mode"])} fullWidth />
        </div>
        {(v.mode === "payment" || v.depositToman !== null) && (
          <Field label="بیعانه" hint="مشتری کارت‌به‌کارت می‌کند و رسید را در گفت‌وگو می‌فرستد؛ تأیید آن با شماست.">
            <AmountInput value={v.depositToman} onChange={(n) => set("depositToman", n)} min={0} words={false} />
          </Field>
        )}
        {resources.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label>چه کسی یا کجا انجام می‌دهد</Label>
            <CheckboxGroup options={resources.map((r) => ({ value: r.id, label: r.title }))} value={v.resourceIds} onChange={(ids) => set("resourceIds", ids)} />
            <p className="text-xs text-muted-foreground">هیچ‌کدام را نزنید تا خدمت روی کل سالن نوبت بگیرد.</p>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label>کانال‌ها</Label>
          <CheckboxGroup options={CHANNEL_OPTIONS} value={v.channels} onChange={(c) => set("channels", c)} />
        </div>
        <label className="flex min-h-11 items-center justify-between gap-4">
          <span className="font-medium">در گفت‌وگو پیشنهاد شود</span>
          <Switch checked={v.offerInChat} onCheckedChange={(c) => set("offerInChat", c)} aria-label="در گفت‌وگو پیشنهاد شود" />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-4">
          <span className="font-medium">شماره‌ی موبایل مشتری لازم است</span>
          <Switch checked={v.requirePhone} onCheckedChange={(c) => set("requirePhone", c)} aria-label="شماره‌ی موبایل مشتری لازم است" />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-4">
          <span className="font-medium">فعال</span>
          <Switch checked={v.active} onCheckedChange={(c) => set("active", c)} aria-label="فعال" />
        </label>
        <Field label="توضیح برای مشتری" htmlFor="sv-desc">
          <Textarea id="sv-desc" value={v.description} maxLength={2000} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="نشانی" htmlFor="sv-loc">
          <Input id="sv-loc" value={v.locationText} maxLength={500} onChange={(e) => set("locationText", e.target.value)} />
        </Field>
        <Field label="پیوند جلسه‌ی آنلاین" htmlFor="sv-link">
          <Input id="sv-link" dir="ltr" value={v.onlineLink} maxLength={500} onChange={(e) => set("onlineLink", e.target.value)} placeholder="https://" />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          className="min-h-11"
          disabled={saving}
          onClick={async () => {
            const checked = serviceInputToPut(v);
            if (!checked.ok) {
              setError(checked.message);
              return;
            }
            setError(null);
            setSaving(true);
            begin();
            const r = await run(() => saveServiceAction(ext, v), ext ? "خدمت ذخیره شد" : "خدمت ساخته شد");
            setSaving(false);
            if (r.ok) onClose();
          }}
        >
          <Save className="size-4" strokeWidth={2} />
          ذخیره‌ی خدمت
        </Button>
      </div>
    </Sheet>
  );
}

function CategoriesBar({ categories, services }: { categories: BookingCategory[]; services: BookingService[] }) {
  const [title, setTitle] = React.useState("");
  const [color, setColor] = React.useState<CategoryColor>("teal");
  const [archiving, setArchiving] = React.useState<BookingCategory | null>(null);
  const { begin, run } = useIntent();

  return (
    <section aria-label="دسته‌های خدمت" className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold leading-tight">
        <Tag className="size-4" strokeWidth={2} />
        دسته‌ها
      </h2>
      {categories.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const used = services.some((s) => s.category_id === c.id);
            return (
              <li key={c.id} className="flex items-center gap-1 rounded-full border border-border ps-3 text-sm">
                {c.title}
                {c.external_id && !used ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 rounded-full"
                    aria-label={`بایگانی دسته‌ی ${c.title}`}
                    onClick={() => {
                      begin();
                      setArchiving(c);
                    }}
                  >
                    <Archive className="size-4" strokeWidth={1.5} />
                  </Button>
                ) : (
                  <span className="pe-3 text-xs text-muted-foreground">{fa(services.filter((s) => s.category_id === c.id).length)} خدمت</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="دسته‌ی تازه" htmlFor="cat-title" className="min-w-48 flex-1">
          <Input id="cat-title" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: خدمات ناخن" />
        </Field>
        <Field label="رنگ" htmlFor="cat-color">
          <Select id="cat-color" className="min-h-11" options={CATEGORY_COLORS.map((c) => ({ value: c, label: COLOR_FA[c] }))} value={color} onChange={(e) => setColor(e.target.value as CategoryColor)} />
        </Field>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={!title.trim()}
          onClick={async () => {
            begin();
            const r = await run(() => saveCategoryAction(null, title, "in_person", color), "دسته ساخته شد");
            if (r.ok) setTitle("");
          }}
        >
          <Plus className="size-4" strokeWidth={1.5} />
          افزودن
        </Button>
      </div>
      <AlertDialog
        open={archiving !== null}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={archiving ? `دسته‌ی «${archiving.title}» بایگانی شود؟` : ""}
        confirmText="بایگانی"
        cancelText="منصرف شدم"
        destructive
        onConfirm={async () => {
          const ext = archiving?.external_id;
          if (ext) await run((key) => archiveCategoryAction(ext, key), "دسته بایگانی شد");
        }}
      />
    </section>
  );
}
