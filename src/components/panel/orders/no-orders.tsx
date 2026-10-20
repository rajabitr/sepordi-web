import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** The shop has no order at all yet: say where orders come from and what the seller still has to do. */
export function NoOrdersYet() {
  return (
    <EmptyState
      icon={ShoppingBag}
      className="min-h-80 justify-center"
      title="هنوز سفارشی ثبت نشده است"
      description="دستیار هوشمند در گفت‌وگو با مشتری سفارش را می‌نویسد. کافی است یک کانال (واتس‌اپ، اینستاگرام یا تلگرام) وصل کنید و محصولاتتان را اضافه کنید؛ سفارش‌ها همین‌جا برای بررسی شما می‌آیند."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/panel/channels" className={buttonVariants({ variant: "default", className: "min-h-11" })}>
            وصل کردن کانال
          </Link>
          <Link href="/panel/products" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
            افزودن محصول
          </Link>
        </div>
      }
    />
  );
}
