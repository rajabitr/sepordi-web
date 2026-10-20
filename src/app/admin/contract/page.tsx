import type { Metadata } from "next";
import { Suspense } from "react";
import { Check, X } from "lucide-react";

import { FEATURE_FA, LIMIT_FA, label } from "@/components/admin/model/labels";
import { ApiError, KeyValues, PageHeader, Section, SectionSkeleton } from "@/components/admin/page-parts";
import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/date";
import { fa, faNumber } from "@/lib/utils";
import { load } from "@/server/admin/errors";
import { requireAdmin } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";

export const metadata: Metadata = { title: "قرارداد" };

export default async function ContractPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="قرارداد با بیزین" description="امکانات و سقف‌هایی که قرارداد فعلی به همه‌ی فروشگاه‌های سپردی می‌دهد. فقط بیزین آن را تغییر می‌دهد." />
      <Suspense fallback={<SectionSkeleton rows={8} />}>
        <Contract />
      </Suspense>
    </>
  );
}

async function Contract() {
  await requireAdmin();
  const c = await load(bizin.getContract());
  if (!c.ok) return <ApiError message={c.message} requestId={c.requestId} />;
  const { contract, features, limits, next } = c.data;
  const allowed = new Set<string>(features);
  return (
    <div className="flex flex-col gap-6">
      {!contract && (
        <Alert variant="destructive" title="قراردادی در جریان نیست">
          تا بیزین نسخه‌ای از قرارداد را فعال نکند، ساخت فروشگاه و همه‌ی امکانات وابسته به قرارداد بسته است.
        </Alert>
      )}
      <Section title="نسخه">
        <KeyValues
          items={[
            { label: "نسخه‌ی فعلی", value: contract ? fa(contract.version) : "—" },
            { label: "از تاریخ", value: contract ? formatDate(contract.effective_from) : "—" },
            { label: "شماره‌ی قرارداد", value: contract?.commercial_ref ?? "—", ltr: Boolean(contract?.commercial_ref) },
            { label: "نسخه‌ی بعدی", value: next ? `نسخه‌ی ${fa(next.version)} از ${formatDate(next.effective_from)}` : "برنامه‌ریزی نشده" },
          ]}
        />
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="امکانات">
          <ul className="flex flex-col divide-y divide-border">
            {Object.keys(FEATURE_FA).map((f) => {
              const on = allowed.has(f);
              return (
                <li key={f} className="flex min-h-12 items-center justify-between gap-3 py-2">
                  <span>{label(FEATURE_FA, f)}</span>
                  <span className={on ? "flex items-center gap-1 text-sm text-success" : "flex items-center gap-1 text-sm text-muted-foreground"}>
                    {on ? <Check className="size-4" strokeWidth={2} /> : <X className="size-4" strokeWidth={1.5} />}
                    {on ? "دارد" : "ندارد"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
        <Section title="سقف‌ها" description="سقفی که این‌جا نیست، نامحدود است.">
          {Object.keys(limits).length === 0 ? (
            <p className="text-sm text-muted-foreground">قرارداد سقفی ندارد.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {Object.entries(limits).map(([key, l]) => (
                <li key={key} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span>{label(LIMIT_FA, key)}</span>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {l.used === null ? `${faNumber(l.value)} برای هر فروشگاه` : `${faNumber(l.used)} از ${faNumber(l.value)}`}
                    </span>
                  </div>
                  {l.used !== null && <Progress value={l.used} max={Math.max(l.value, 1)} />}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
