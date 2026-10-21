import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Lock } from "lucide-react";

import { ApiErrorAlert } from "@/components/panel/products/api-error";
import { draftFromProduct } from "@/components/panel/products/catalog";
import { toImagesView } from "@/components/panel/products/images-model";
import { PageHeader } from "@/components/panel/products/page-header";
import { ProductForm } from "@/components/panel/products/product-form";
import { ProductImages } from "@/components/panel/products/product-images";
import { ProductFormSkeleton } from "@/components/panel/products/skeletons";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { requireSeller } from "@/server/auth/session";
import { getProduct } from "@/server/bizin/client";
import { isBizinError } from "@/server/bizin/error";
import { toFarsiError } from "@/server/bizin/errors-fa";
import { getProductImages } from "@/server/product-images/store";

export const metadata: Metadata = { title: "ویرایش محصول" };

type Params = Promise<{ ext: string }>;

async function EditProductData({ params }: { params: Params }) {
  const { shop } = await requireSeller();
  const productExt = (await params).ext;

  let product;
  try {
    product = await getProduct(shop.external_business_id, productExt);
  } catch (e) {
    if (isBizinError(e) && (e.code === "product_not_found" || e.code === "not_found")) notFound();
    const f = toFarsiError(e);
    return <ApiErrorAlert title="محصول بارگذاری نشد" message={f.message} requestId={f.requestId} />;
  }

  if (!product.external_id) {
    return (
      <Alert icon={Lock} title="این محصول فقط خواندنی است">
        «{product.title}» از راه دیگری ساخته شده و این‌جا فقط قابل مشاهده است.{" "}
        <Link href="/panel/products" className="font-medium text-brand-ink underline underline-offset-4">
          بازگشت به محصولات
        </Link>
      </Alert>
    );
  }

  const { draft, panelOnlyVariants } = draftFromProduct(product);
  const images = toImagesView(await getProductImages(shop.id, product.external_id));
  return (
    <div className="flex flex-col gap-6">
      <ProductForm productExt={product.external_id} initial={draft} panelOnlyVariants={panelOnlyVariants} />
      <ProductImages productExt={product.external_id} initial={images} />
    </div>
  );
}

export default function EditProductPage({ params }: { params: Params }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="ویرایش محصول"
        actions={
          <Link href="/panel/products" className={buttonVariants({ variant: "ghost", className: "min-h-11" })}>
            بازگشت به محصولات
          </Link>
        }
      />
      <Suspense fallback={<ProductFormSkeleton />}>
        <EditProductData params={params} />
      </Suspense>
    </div>
  );
}
