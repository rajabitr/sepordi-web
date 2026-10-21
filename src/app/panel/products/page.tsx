import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileSpreadsheet, Plus } from "lucide-react";

import { ApiErrorAlert } from "@/components/panel/products/api-error";
import type { ProductView } from "@/components/panel/products/catalog";
import { PageHeader } from "@/components/panel/products/page-header";
import { ProductsTable } from "@/components/panel/products/products-table";
import { ProductsListSkeleton } from "@/components/panel/products/skeletons";
import { buttonVariants } from "@/components/ui/button";
import { requireSeller } from "@/server/auth/session";
import { listProducts } from "@/server/bizin/client";
import { toFarsiError } from "@/server/bizin/errors-fa";
import { firstImages, publicImagePath } from "@/server/product-images/store";

export const metadata: Metadata = { title: "محصولات" };

const PAGE_SIZE = 100;

async function ProductsData({ searchParams }: { searchParams: Promise<{ cursor?: string | string[] }> }) {
  const { shop } = await requireSeller();
  const raw = (await searchParams).cursor;
  const cursor = typeof raw === "string" && raw.length <= 512 ? raw : undefined;

  let products: ProductView[];
  let nextCursor: string | null;
  try {
    const page = await listProducts(shop.external_business_id, { limit: PAGE_SIZE, cursor });
    products = page.products;
    nextCursor = page.next_cursor;
  } catch (e) {
    const f = toFarsiError(e);
    return <ApiErrorAlert title="فهرست محصولات بارگذاری نشد" message={f.message} requestId={f.requestId} />;
  }

  const thumbs = Object.fromEntries(Object.entries(await firstImages(shop.id).catch(() => ({}))).map(([ext, file]) => [ext, publicImagePath(file)]));
  return (
    <div className="flex flex-col gap-4">
      <ProductsTable products={products} thumbs={thumbs} />
      {(cursor || nextCursor) && (
        <nav className="flex flex-wrap justify-between gap-2" aria-label="صفحه‌های فهرست">
          {cursor ? (
            <Link href="/panel/products" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
              صفحه‌ی اول
            </Link>
          ) : (
            <span />
          )}
          {nextCursor && (
            <Link href={`/panel/products?cursor=${encodeURIComponent(nextCursor)}`} className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
              صفحه‌ی بعد
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

export default function ProductsPage({ searchParams }: { searchParams: Promise<{ cursor?: string | string[] }> }) {
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
