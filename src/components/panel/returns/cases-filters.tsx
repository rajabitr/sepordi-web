"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { CASE_KINDS, CASE_STATES, caseKindLabel, caseStateMeta, filteredCasesHref, type CaseFilters, type CaseKind, type CaseState } from "./model";

const TABS: { value: string; label: string; state?: CaseState }[] = [
  { value: "all", label: "همه" },
  { value: "open", label: "باز", state: "open" },
  { value: "awaiting_customer", label: "منتظر پاسخ مشتری", state: "awaiting_customer" },
  { value: "accepted", label: "پذیرفته‌شده", state: "accepted" },
];

const STATE_OPTIONS = [{ value: "", label: "همه‌ی وضعیت‌ها" }, ...CASE_STATES.map((s) => ({ value: s, label: caseStateMeta(s).label }))];
const KIND_OPTIONS = [{ value: "", label: "همه‌ی نوع‌ها" }, ...CASE_KINDS.map((k) => ({ value: k, label: caseKindLabel(k) }))];

/** Every change is a new URL and one list call; nothing polls. */
export function CasesFilters({ filters, children }: { filters: Pick<CaseFilters, "state" | "kind">; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const go = (next: Partial<CaseFilters>) => startTransition(() => router.push(filteredCasesHref(filters, next)));
  const tab = TABS.find((t) => t.state === filters.state)?.value ?? "custom";

  return (
    <Tabs
      variant="underline"
      value={tab}
      defaultValue="all"
      onValueChange={(v) => {
        const t = TABS.find((x) => x.value === v);
        if (t) go({ state: t.state });
      }}
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList aria-label="وضعیت درخواست‌ها" className="min-w-max">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="min-h-11">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cases-state">وضعیت</Label>
          <Select
            id="cases-state"
           
            value={filters.state ?? ""}
            options={STATE_OPTIONS}
            onChange={(e) => go({ state: (e.target.value || undefined) as CaseState | undefined })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cases-kind">نوع درخواست</Label>
          <Select
            id="cases-kind"
           
            value={filters.kind ?? ""}
            options={KIND_OPTIONS}
            onChange={(e) => go({ kind: (e.target.value || undefined) as CaseKind | undefined })}
          />
        </div>
      </div>
      <TabsContent value={tab} className={cn("mt-6 transition-opacity duration-200", pending && "opacity-60")}>
        <div aria-busy={pending}>{children}</div>
      </TabsContent>
    </Tabs>
  );
}
