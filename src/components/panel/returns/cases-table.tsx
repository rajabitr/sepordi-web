import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import { fa } from "@/lib/utils";

import { CaseStateBadge } from "./badges";
import { caseKindLabel, type CaseSummary } from "./model";

const orderLabel = (c: CaseSummary) => (c.order?.code ? `سفارش ${fa(c.order.code)}` : "سفارش نامشخص");
const customer = (c: CaseSummary) => c.customer.name?.trim() || "مشتری بی‌نام";

export function CasesTable({ cases }: { cases: CaseSummary[] }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>کد درخواست</TableHead>
              <TableHead>نوع</TableHead>
              <TableHead>وضعیت</TableHead>
              <TableHead>سفارش</TableHead>
              <TableHead>مشتری</TableHead>
              <TableHead>تاریخ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map((c) => (
              <TableRow key={c.id} className="relative h-14">
                <TableCell numeric>
                  <Link
                    href={`/panel/returns/${c.id}`}
                    dir="ltr"
                    className="font-semibold text-brand-ink after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring"
                  >
                    {fa(c.code)}
                  </Link>
                </TableCell>
                <TableCell>{caseKindLabel(c.kind)}</TableCell>
                <TableCell>
                  <CaseStateBadge state={c.state} />
                </TableCell>
                <TableCell numeric className="text-muted-foreground">{orderLabel(c)}</TableCell>
                <TableCell className="max-w-48 truncate">{customer(c)}</TableCell>
                <TableCell numeric className="whitespace-nowrap text-muted-foreground">{formatDate(c.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {cases.map((c) => (
          <li key={c.id}>
            <Link
              href={`/panel/returns/${c.id}`}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors duration-200 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">
                  {caseKindLabel(c.kind)} <span dir="ltr" className="tabular-nums">{fa(c.code)}</span>
                </span>
                <CaseStateBadge state={c.state} />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="truncate tabular-nums">
                  {customer(c)}، {orderLabel(c)}، {formatDate(c.created_at)}
                </span>
                <ChevronLeft className="size-4 shrink-0" strokeWidth={1.5} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
