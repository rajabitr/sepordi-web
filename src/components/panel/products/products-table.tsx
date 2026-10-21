"use client";

import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { Archive, Lock, Package, PencilLine } from "lucide-react";

import { archiveProductAction } from "@/app/panel/products/actions";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatToman } from "@/lib/money";
import { cn, fa, faNumber } from "@/lib/utils";

import { priceRange, STOCK_LABEL, stockLevel, type ProductView, type StockLevel } from "./catalog";

type Filter = "active" | "archived" | "all";

/** The product's first picture as sepordi holds it; the Partner API's product carries none. */
function Thumb({ url }: { url: string | undefined }) {
  return (
    <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
      {url ? (
        <Image src={url} alt="" fill sizes="48px" className="object-cover" />
      ) : (
        <Package className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      )}
    </div>
  );
}

const STOCK_VARIANT: Record<StockLevel, "destructive" | "warning" | "success" | "secondary"> = {
  out: "destructive",
  low: "warning",
  in: "success",
  unlimited: "secondary",
};

function PriceText({ p }: { p: ProductView }) {
  const r = priceRange(p);
  if (!r) return <span className="text-muted-foreground">—</span>;
  if (r.min === r.max) return <span className="tabular-nums">{formatToman(r.min)}</span>;
  return (
    <span className="tabular-nums">
      {faNumber(Math.round(r.min / 10))} تا {formatToman(r.max)}
    </span>
  );
}

function StockBadge({ p }: { p: ProductView }) {
  const { level, counted } = stockLevel(p);
  return (
    <Badge variant={STOCK_VARIANT[level]} className="gap-1.5">
      <span aria-hidden className="size-2 rounded-full bg-current" />
      {STOCK_LABEL[level]}
      {counted !== null && level !== "out" && <span className="tabular-nums">({fa(counted)})</span>}
    </Badge>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return <Badge variant={active ? "success" : "secondary"}>{active ? "فعال" : "بایگانی"}</Badge>;
}

function RowActions({ p, onArchive }: { p: ProductView; onArchive: (p: ProductView) => void }) {
  if (!p.external_id) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="این محصول از راه دیگری ساخته شده و این‌جا فقط قابل مشاهده است.">
        <Lock className="size-4" strokeWidth={1.5} aria-hidden />
        فقط خواندنی
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/panel/products/${encodeURIComponent(p.external_id)}/edit`}
        className={buttonVariants({ variant: "ghost", size: "sm", className: "min-h-11 min-w-11" })}
        aria-label={`ویرایش ${p.title}`}
      >
        <PencilLine strokeWidth={1.5} aria-hidden />
        <span className="hidden sm:inline">ویرایش</span>
      </Link>
      {p.active && (
        <Button variant="ghost" size="sm" className="min-h-11 min-w-11 text-destructive" onClick={() => onArchive(p)} aria-label={`بایگانی ${p.title}`}>
          <Archive strokeWidth={1.5} aria-hidden />
          <span className="hidden sm:inline">بایگانی</span>
        </Button>
      )}
    </div>
  );
}

export function ProductsTable({ products, thumbs = {} }: { products: ProductView[]; thumbs?: Record<string, string> }) {
  const { toast } = useToast();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("active");
  const [archiving, setArchiving] = React.useState<ProductView | null>(null);

  const q = query.trim().toLocaleLowerCase("fa");
  const visible = products.filter(
    (p) =>
      (filter === "all" || (filter === "active" ? p.active : !p.active)) &&
      (!q || p.title.toLocaleLowerCase("fa").includes(q) || p.sku.toLocaleLowerCase().includes(q)),
  );
  const readOnlyCount = products.filter((p) => !p.external_id).length;
  const thumbOf = (p: ProductView) => (p.external_id ? thumbs[p.external_id] : undefined);

  async function archive() {
    if (!archiving?.external_id) return;
    const res = await archiveProductAction(archiving.external_id);
    if (res.ok) toast({ variant: "success", title: "محصول بایگانی شد", description: "دستیار دیگر این محصول را به مشتری پیشنهاد نمی‌دهد." });
    else toast({ variant: "error", title: "بایگانی انجام نشد", description: res.requestId ? `${res.message} (کد پیگیری: ${res.requestId})` : res.message, duration: 8000 });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={query} onChange={setQuery} placeholder="جست‌وجوی نام یا کد کالا در همین صفحه…" className="sm:max-w-sm" aria-label="جست‌وجوی محصول" />
        <SegmentedControl
          aria-label="وضعیت محصول"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: "active", label: "فعال" },
            { value: "archived", label: "بایگانی" },
            { value: "all", label: "همه" },
          ]}
        />
      </div>

      {readOnlyCount > 0 && (
        <Alert title="محصولات فقط‌خواندنی">
          {fa(readOnlyCount)} محصول از راه دیگری ساخته شده و این‌جا فقط قابل مشاهده است. دستیار این‌ها را می‌شناسد، ولی ویرایش و بایگانی‌شان از این‌جا ممکن نیست.
        </Alert>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Package}
          className="min-h-64 justify-center"
          title={products.length === 0 ? "هنوز محصولی ندارید" : "محصولی با این مشخصات پیدا نشد"}
          description={
            products.length === 0
              ? "دستیار قیمت و موجودی را فقط از محصولات شما می‌گوید. اولین محصول را بسازید یا فهرست را از اکسل وارد کنید."
              : "عبارت جست‌وجو یا فیلتر وضعیت را تغییر دهید."
          }
          action={
            products.length === 0 ? (
              <Link href="/panel/products/new" className={buttonVariants({ variant: "brand", className: "min-h-11" })}>
                ساخت محصول
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3 md:hidden" aria-label="فهرست محصولات">
            {visible.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 rounded-surface border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <Thumb url={thumbOf(p)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.category || "بدون دسته"} · {fa(p.variants.filter((v) => v.active).length)} تنوع
                    </p>
                  </div>
                  <StatusBadge active={p.active} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <PriceText p={p} />
                  <StockBadge p={p} />
                </div>
                <div className="flex justify-end">
                  <RowActions p={p} onArchive={setArchiving} />
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead>دسته</TableHead>
                  <TableHead>تنوع‌ها</TableHead>
                  <TableHead>قیمت</TableHead>
                  <TableHead>موجودی</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>
                    <span className="sr-only">کارها</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => (
                  <TableRow key={p.id} className={cn(!p.active && "text-muted-foreground")}>
                    <TableCell className="max-w-72">
                      <div className="flex items-center gap-3">
                        <Thumb url={thumbOf(p)} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.title}</p>
                          {p.sku && (
                            <p className="text-xs text-muted-foreground">
                              کد کالا: <bdi dir="ltr">{p.sku}</bdi>
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{p.category || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell numeric>{fa(p.variants.filter((v) => v.active).length)}</TableCell>
                    <TableCell>
                      <PriceText p={p} />
                    </TableCell>
                    <TableCell>
                      <StockBadge p={p} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={p.active} />
                    </TableCell>
                    <TableCell>
                      <RowActions p={p} onArchive={setArchiving} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AlertDialog
        open={archiving !== null}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={`«${archiving?.title ?? ""}» بایگانی شود؟`}
        description="دستیار دیگر این محصول را به مشتری پیشنهاد نمی‌دهد. محصول پاک نمی‌شود و هر وقت بخواهید با ویرایش و روشن کردن «فعال» برمی‌گردد."
        confirmText="بایگانی کن"
        destructive
        onConfirm={archive}
      />
    </div>
  );
}
