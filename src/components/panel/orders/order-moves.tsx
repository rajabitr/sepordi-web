"use client";

import * as React from "react";
import { Ban, PackageCheck, PackageOpen, Truck } from "lucide-react";

import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatToman } from "@/lib/money";
import { fa } from "@/lib/utils";

import { moveOrderAction } from "@/app/panel/orders/actions";

import { MOVE_LABEL, allowedOrderMoves, type StatusMove } from "./model";
import { useIntent } from "./use-intent";

const ICON = { packing: PackageOpen, shipped: Truck, delivered: PackageCheck, cancelled: Ban } as const;

export interface OrderMovesProps {
  orderId: string;
  code: string;
  status: string;
  /** Rial. */
  total: number;
  paymentStatus: string;
  pendingEvidence: number;
}

/** The fulfilment buttons the order's status allows, each behind a confirmation naming the order and its amount. */
export function OrderMoves({ orderId, code, status, total, paymentStatus, pendingEvidence }: OrderMovesProps) {
  const moves = allowedOrderMoves(status);
  const [asking, setAsking] = React.useState<StatusMove | null>(null);
  const { begin, run } = useIntent();

  if (moves.length === 0) return null;
  const forward = moves.filter((m) => m !== "cancelled");
  const canCancel = moves.includes("cancelled");
  const amount = formatToman(total);
  const name = `سفارش ${fa(code)}`;

  function describe(m: StatusMove): string {
    switch (m) {
      case "packing":
        return `${name} به مبلغ ${amount} به «در حال آماده‌سازی» می‌رود.`;
      case "shipped":
        return `ارسال ${name} به مبلغ ${amount} ثبت می‌شود و موجودی رزروشده‌ی آن فروخته‌شده حساب می‌شود.`;
      case "delivered":
        return `تحویل ${name} به مبلغ ${amount} به مشتری ثبت می‌شود. این مرحله آخر سفارش است.`;
      case "cancelled": {
        const parts = [`${name} به مبلغ ${amount} لغو می‌شود و موجودی رزروشده آزاد می‌شود.`];
        if (paymentStatus === "paid") parts.push("پرداخت این سفارش ثبت شده است؛ برگرداندن پول به مشتری با خود شماست.");
        if (pendingEvidence > 0) parts.push("رسیدهای در انتظار بررسی این سفارش بسته می‌شوند.");
        return parts.join(" ");
      }
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {forward.map((m, i) => {
        const Icon = ICON[m];
        return (
          <Button
            key={m}
            variant={i === 0 ? "default" : "outline"}
            className="min-h-11"
            onClick={() => {
              begin();
              setAsking(m);
            }}
          >
            <Icon className="size-4" strokeWidth={2} />
            {MOVE_LABEL[m].button}
          </Button>
        );
      })}
      {canCancel && (
        <Button
          variant="ghost"
          className="min-h-11 text-destructive hover:text-destructive"
          onClick={() => {
            begin();
            setAsking("cancelled");
          }}
        >
          <Ban className="size-4" strokeWidth={2} />
          {MOVE_LABEL.cancelled.button}
        </Button>
      )}

      <AlertDialog
        open={asking !== null}
        onOpenChange={(o) => !o && setAsking(null)}
        title={asking ? MOVE_LABEL[asking].ask(name) : ""}
        description={asking ? describe(asking) : undefined}
        confirmText={asking ? MOVE_LABEL[asking].button : undefined}
        cancelText="منصرف شدم"
        destructive={asking === "cancelled"}
        onConfirm={async () => {
          if (!asking) return;
          const m = asking;
          await run((key) => moveOrderAction(orderId, m, key), MOVE_LABEL[m].done);
        }}
      />
    </div>
  );
}
