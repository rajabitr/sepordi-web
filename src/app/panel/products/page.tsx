import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileSpreadsheet, Plus } from "lucide-react";

import { ApiErrorAlert } from "@/components/panel/products/api-error";
import type { ProductView } from "@/components/panel/products/catalog";
import { parseFilters } from "@/components/panel/products/filter";
import { PageHeader } from "@/components/panel/products/page-header";
import { collectPages, PAGE_SIZE } from "@/components/panel/products/paging";
import { ProductsTable } from "@/components/panel/products/products-table";
import { ProductsListSkeleton } from "@/components/panel/products/skeletons";
import { buttonVariants } from "@/components/ui/button";
import { requireCapability } from "@/server/auth/session";
import { listProducts } from "@/server/bizin/client";
import { toFarsiError } from "@/server/bizin/errors-fa";
import { firstImages, publicImagePath } from "@/server/product-images/store";

export const metadata: Metadata = { title: "محصولات" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function ProductsData({ searchParams }: { searchParams: SearchParams }) {
  const { shop } = await requireCapability("products.view");
  const params = await searchParams;
  const all = params.all === "1";
  const raw = params.cursor;
  const cursor = !all && typeof raw === "string" && raw.length <= 512 ? raw : undefined;

  let products: ProductView[];
  let nextCursor: string | null;
  try {
    const fetchPage = (c: string | undefined) => listProducts(shop.external_business_id, { limit: PAGE_SIZE, cursor: c });
    if (all) {
      ({ products, nextCursor } = await collectPages(fetchPage));
    } else {
      const page = await fetchPage(cursor);
      products = page.products;
      nextCursor = page.next_cursor;
    }
  } catch (e) {
    const f = toFarsiError(e);
    return <ApiErrorAlert title="فهرست محصولات بارگذاری نشد" message={f.message} requestId={f.requestId} />;
  }

  const thumbs = Object.fromEntries(Object.entries(await firstImages(shop.id).catch(() => ({}))).map(([ext, file]) => [ext, publicImagePath(file)]));
  return (
    <ProductsTable
      products={products}
      thumbs={thumbs}
      initialFilters={parseFilters(params)}
      paging={{ firstPage: !cursor, nextCursor, all }}
    />
  );
}

export default function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="محصولات"
        description="دستیار قیمت و موجودی را فقط از همین فهرست به مشتری می‌گوید. هر تغییری این‌جا، از پیام بعدی در پاسخ‌ها دیده می‌شود."
        actions={
          <>
            <Link href="/panel/products/import" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
              <FileSpreadsheet strokeWidth={1.5} aria-hidden />
              ورود از اکسل
            </Link>
            <Link href="/panel/products/new" className={buttonVariants({ variant: "brand", className: "min-h-11" })}>
              <Plus strokeWidth={2} aria-hidden />
              محصول تازه
            </Link>
          </>
        }
      />
      <Suspense fallback={<ProductsListSkeleton />}>
        <ProductsData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
