import type { Metadata } from "next";

import { PageHeader } from "@/components/panel/products/page-header";
import { EMPTY_DRAFT, ProductForm } from "@/components/panel/products/product-form";

export const metadata: Metadata = { title: "محصول تازه" };

export default function NewProductPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader title="محصول تازه" description="نام، قیمت و موجودی را بنویسید؛ دستیار از همین اطلاعات به مشتری جواب می‌دهد." />
      <ProductForm productExt={null} initial={EMPTY_DRAFT} />
    </div>
  );
}
