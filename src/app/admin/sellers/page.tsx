import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Search } from "lucide-react";

import { ApiError, PageHeader, Pill, SectionSkeleton } from "@/components/admin/page-parts";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import { fa } from "@/lib/utils";
import { load } from "@/server/admin/errors";
import { requireAdmin } from "@/server/auth/session";
import { localSellersByExt, searchLocalSellers, type LocalSeller } from "@/server/admin/sellers";
import * as bizin from "@/server/bizin/client";

export const metadata: Metadata = { title: "فروشندگان" };

const PAGE_SIZE = 50;

type Search = Promise<{ q?: string; cursor?: string }>;

export default async function SellersPage({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const { q = "", cursor } = await searchParams;
  const query = q.trim().slice(0, 100);
  return (
    <>
      <PageHeader title="فروشندگان" description="فروشگاه‌های سپردی در بیزین، کنار حساب صاحبشان در سپردی." />
      <form role="search" action="/admin/sellers" className="mb-6 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <label htmlFor="sellers-q" className="mb-1.5 block text-sm font-medium">جست‌وجو</label>
          <Input id="sellers-q" name="q" defaultValue={query} placeholder="نام فروشگاه، نام صاحب، موبایل یا شناسه" startAddon={<Search className="size-4" strokeWidth={1.5} />} />
        </div>
        <button type="submit" className={buttonVariants({ size: "lg" })}>جست‌وجو</button>
        {query && (
          <Link href="/admin/sellers" className={buttonVariants({ variant: "ghost", size: "lg" })}>
            پاک کردن
          </Link>
        )}
      </form>
      <Suspense key={`${query}|${cursor ?? ""}`} fallback={<SectionSkeleton rows={8} />}>
        {query ? <LocalResults query={query} /> : <TenantPage cursor={cursor} />}
      </Suspense>
    </>
  );
}

async function LocalResults({ query }: { query: string }) {
  await requireAdmin();
  const rows = searchLocalSellers(query);
  if (rows.length === 0) {
    return <EmptyState icon={Search} title="فروشنده‌ای پیدا نشد" description="جست‌وجو فقط در فروشگاه‌هایی است که در سپردی ثبت‌نام کرده‌اند." />;
  }
  return (
    <SellersTable
      rows={rows.map((l) => ({ ext: l.ext, name: l.shop_name, created_at: l.shop_created_at, status: null, local: l }))}
      caption={`${fa(rows.length)} نتیجه در فروشگاه‌های سپردی`}
    />
  );
}

async function TenantPage({ cursor }: { cursor?: string }) {
  await requireAdmin();
  const page = await load(bizin.listTenants({ limit: PAGE_SIZE, cursor }));
  if (!page.ok) return <ApiError message={page.message} requestId={page.requestId} />;
  const { tenants, next_cursor } = page.data;
  if (tenants.length === 0) {
    return <EmptyState title="هنوز فروشگاهی در بیزین ساخته نشده است" description="فروشگاه‌ها با ثبت‌نام فروشنده یا از «ثبت گروهی فروشگاه» ساخته می‌شوند." />;
  }
  const local = localSellersByExt(tenants.map((t) => t.external_business_id));
  return (
    <div className="flex flex-col gap-4">
      <SellersTable
        rows={tenants.map((t) => ({ ext: t.external_business_id, name: t.name, created_at: t.created_at, status: t.status, local: local.get(t.external_business_id) }))}
      />
      <nav aria-label="صفحه‌بندی" className="flex flex-wrap justify-between gap-2">
        {cursor ? (
          <Link href="/admin/sellers" className={buttonVariants({ variant: "outline", size: "lg" })}>
            صفحه‌ی اول
          </Link>
        ) : (
          <span />
        )}
        {next_cursor && (
          <Link href={`/admin/sellers?cursor=${encodeURIComponent(next_cursor)}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            صفحه‌ی بعد
            <ArrowLeft strokeWidth={2} />
          </Link>
        )}
      </nav>
    </div>
  );
}

interface Row {
  ext: string;
  name: string;
  created_at: string;
  status: "active" | "suspended" | null;
  local: LocalSeller | undefined;
}

function SellersTable({ rows, caption }: { rows: Row[]; caption?: string }) {
  return (
    <Table>
      {caption && <caption className="p-3 text-start text-xs text-muted-foreground">{caption}</caption>}
      <TableHeader>
        <TableRow>
          <TableHead>فروشگاه</TableHead>
          <TableHead>صاحب فروشگاه</TableHead>
          <TableHead>وضعیت</TableHead>
          <TableHead>ساخته‌شده</TableHead>
          <TableHead>
            <span className="sr-only">جزئیات</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.ext}>
            <TableCell>
              <span className="block font-medium">{r.name}</span>
              <bdi dir="ltr" className="block font-mono text-xs text-muted-foreground">{r.ext}</bdi>
            </TableCell>
            <TableCell>
              {r.local ? (
                <>
                  <span className="block">{r.local.display_name}</span>
                  <bdi dir="ltr" className="block text-xs text-muted-foreground">{fa(r.local.phone)}</bdi>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">حساب سپردی ندارد</span>
              )}
            </TableCell>
            <TableCell>
              {r.status === null ? <Pill>—</Pill> : r.status === "active" ? <Pill tone="success">فعال</Pill> : <Pill tone="danger">معلق</Pill>}
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.created_at)}</TableCell>
            <TableCell>
              <Link
                href={`/admin/sellers/${encodeURIComponent(r.ext)}`}
                className="inline-flex h-11 items-center gap-1 rounded-control px-3 font-semibold text-brand-ink hover:bg-secondary"
                aria-label={`جزئیات ${r.name}`}
              >
                جزئیات
                <ArrowLeft className="size-4" strokeWidth={2} />
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
