"use client";

import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { Archive, Lock, Package, PencilLine, SearchX } from "lucide-react";

import { archiveProductAction } from "@/app/panel/products/actions";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatToman } from "@/lib/money";
import { cn, fa, faNumber } from "@/lib/utils";

import { priceRange, STOCK_LABEL, stockLevel, type ProductView, type StockLevel } from "./catalog";
import {
  categoryOptions,
  DEFAULT_FILTERS,
  filterProducts,
  filtersToSearch,
  isFiltered,
  type ProductFilters,
  type StatusFilter,
  type StockFilter,
} from "./filter";
import { LOAD_ALL_CAP } from "./paging";

/** Where the loaded list sits in the whole catalogue: the first page, a later one, or «بارگذاری همه». */
export interface ProductsPaging {
  firstPage: boolean;
  nextCursor: string | null;
  all: boolean;
}

const STOCK_OPTIONS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "همه‌ی موجودی‌ها" },
  { value: "out", label: STOCK_LABEL.out },
  { value: "low", label: STOCK_LABEL.low },
  { value: "in", label: STOCK_LABEL.in },
  { value: "unlimited", label: STOCK_LABEL.unlimited },
];

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

export function ProductsTable({
  products,
  thumbs = {},
  initialFilters = DEFAULT_FILTERS,
  paging = { firstPage: true, nextCursor: null, all: false },
}: {
  products: ProductView[];
  thumbs?: Record<string, string>;
  initialFilters?: ProductFilters;
  paging?: ProductsPaging;
}) {
  const { toast } = useToast();
  const [filters, setFilters] = React.useState<ProductFilters>(initialFilters);
  const [archiving, setArchiving] = React.useState<ProductView | null>(null);

  // The history API keeps the URL shareable without a server round trip: the list is already in hand.
  React.useEffect(() => {
    const search = filtersToSearch(filters, window.location.search);
    if (search !== window.location.search) window.history.replaceState(null, "", `${window.location.pathname}${search}`);
  }, [filters]);

  const setFilter = <K extends keyof ProductFilters>(k: K, v: ProductFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const visible = filterProducts(products, filters);
  const filtered = isFiltered(filters);
  const complete = paging.firstPage && !paging.nextCursor;
  const categories = categoryOptions(products);
  if (filters.category && !categories.includes(filters.category)) categories.unshift(filters.category);
  const keep = filtersToSearch(filters);
  const loadAllHref = `/panel/products${filtersToSearch(filters, "all=1")}`;
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
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={filters.q}
            onChange={(v) => setFilter("q", v)}
            placeholder="نام یا کد کالا…"
            className="sm:max-w-sm"
            aria-label="جست‌وجوی نام یا کد کالا"
          />
          <SegmentedControl
            aria-label="وضعیت محصول"
            value={filters.status}
            onChange={(v) => setFilter("status", v as StatusFilter)}
            options={[
              { value: "active", label: "فعال" },
              { value: "archived", label: "بایگانی" },
              { value: "all", label: "همه" },
            ]}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <Select
            aria-label="دسته"
            value={filters.category}
            onChange={(e) => setFilter("category", e.target.value)}
            options={[{ value: "", label: "همه‌ی دسته‌ها" }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
          <Select
            aria-label="وضعیت موجودی"
            value={filters.stock}
            onChange={(e) => setFilter("stock", e.target.value as StockFilter)}
            options={STOCK_OPTIONS}
          />
        </div>
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p aria-live="polite">
            {complete
              ? `${fa(visible.length)} از ${fa(products.length)} محصول`
              : `جست‌وجو در محصولات بارگذاری‌شده: ${fa(visible.length)} از ${fa(products.length)} محصول`}
          </p>
          <div className="flex flex-wrap gap-2">
            {filtered && (
              <Button variant="ghost" className="min-h-11" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>
                پاک کردن فیلترها
              </Button>
            )}
            {!complete && !paging.all && (
              <Link href={loadAllHref} className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
                بارگذاری همه
              </Link>
            )}
          </div>
        </div>
        {paging.all && paging.nextCursor && (
          <Alert variant="warning" title={`فقط ${fa(products.length)} محصول اول بارگذاری شد`}>
            «بارگذاری همه» حداکثر {fa(LOAD_ALL_CAP)} محصول را می‌آورد تا سهمیه‌ی درخواست‌های فروشگاه تمام نشود. برای بقیه از «صفحه‌ی بعد» استفاده کنید.
          </Alert>
        )}
      </div>

      {readOnlyCount > 0 && (
        <Alert title="محصولات فقط‌خواندنی">
          {fa(readOnlyCount)} محصول از راه دیگری ساخته شده و این‌جا فقط قابل مشاهده است. دستیار این‌ها را می‌شناسد، ولی ویرایش و بایگانی‌شان از این‌جا ممکن نیست.
        </Alert>
      )}

      {visible.length === 0 && products.length === 0 && paging.firstPage ? (
        <EmptyState
          icon={Package}
          className="min-h-64 justify-center"
          title="هنوز محصولی ندارید"
          description="دستیار قیمت و موجودی را فقط از محصولات شما می‌گوید. اولین محصول را بسازید یا فهرست را از اکسل وارد کنید."
          action={
            <Link href="/panel/products/new" className={buttonVariants({ variant: "brand", className: "min-h-11" })}>
              ساخت محصول
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          className="min-h-64 justify-center"
          title="نتیجه‌ای پیدا نشد"
          description={
            complete || paging.all
              ? "هیچ محصولی با این جست‌وجو و فیلترها جور نیست. عبارت یا فیلترها را تغییر دهید."
              : "در محصولات بارگذاری‌شده چیزی با این جست‌وجو و فیلترها نیست. شاید در صفحه‌های بعد باشد."
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {!complete && !paging.all && (
                <Link href={loadAllHref} className={buttonVariants({ variant: "brand", className: "min-h-11" })}>
                  بارگذاری همه
                </Link>
              )}
              {filtered && (
                <Button variant="outline" className="min-h-11" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>
                  پاک کردن فیلترها
                </Button>
              )}
            </div>
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

      {(!paging.firstPage || paging.nextCursor) && (
        <nav className="flex flex-wrap justify-between gap-2" aria-label="صفحه‌های فهرست">
          {!paging.firstPage ? (
            <Link href={`/panel/products${keep}`} className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
              صفحه‌ی اول
            </Link>
          ) : (
            <span />
          )}
          {paging.nextCursor && (
            <Link
              href={`/panel/products${filtersToSearch(filters, new URLSearchParams({ cursor: paging.nextCursor }))}`}
              className={buttonVariants({ variant: "outline", className: "min-h-11" })}
            >
              صفحه‌ی بعد
            </Link>
          )}
        </nav>
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
