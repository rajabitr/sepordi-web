import { Alert } from "@/components/ui/alert";

/** A failed Partner API read, in Farsi, with the request id support asks for. */
export function ApiErrorAlert({ title, message, requestId }: { title?: string; message: string; requestId?: string }) {
  return (
    <Alert variant="destructive" title={title ?? "بارگذاری انجام نشد"}>
      <p className="leading-7">{message}</p>
      {requestId && <RequestId id={requestId} />}
    </Alert>
  );
}

export function RequestId({ id }: { id: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      کد پیگیری برای پشتیبانی:{" "}
      <bdi dir="ltr" className="select-all font-mono">
        {id}
      </bdi>
    </p>
  );
}
