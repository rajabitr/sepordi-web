"use client";

import * as React from "react";
import { ImagePlus, Lock, SendHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { CAPTION_LIMIT, imageAllowed, imageProblem, textLimit, type ChannelKind, type ComposerBlock } from "./model";

export interface Draft {
  text: string;
  image: File | null;
}

export function Composer({
  channel,
  block,
  sending,
  onSend,
}: {
  channel: ChannelKind;
  block: ComposerBlock;
  sending: boolean;
  /** Resolves true when the draft was delivered and may be cleared. */
  onSend: (draft: Draft) => Promise<boolean>;
}) {
  const [text, setText] = React.useState("");
  const [image, setImage] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const hintId = React.useId();

  React.useEffect(() => {
    if (!image) return;
    const u = URL.createObjectURL(image);
    // The object URL is created and revoked with the file it shows.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [image]);

  const canAttach = imageAllowed(channel);
  const limit = image ? CAPTION_LIMIT : textLimit(channel);
  const ready = !block && !sending && (image !== null || text.trim().length > 0);

  async function submit() {
    if (!ready) return;
    const ok = await onSend({ text: text.trim(), image });
    if (ok) {
      setText("");
      setImage(null);
      setPreview(null);
    }
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const problem = imageProblem(f);
    setFileError(problem);
    if (!problem) setImage(f);
  }

  if (block) {
    return (
      <div className="flex items-start gap-3 border-t border-border bg-muted/50 p-4 text-sm" role="note">
        <Lock className="mt-1 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        <div>
          <p className="font-medium leading-6">{block.title}</p>
          <p className="leading-6 text-muted-foreground">{block.detail}</p>
        </div>
      </div>
    );
  }

  return (
    <form
      className="border-t border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {image && preview && (
        <div className="mb-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
          <img src={preview} alt="عکس انتخاب‌شده" className="aspect-square size-16 rounded-control border border-border object-cover" />
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{image.name}</span>
          <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="حذف عکس" disabled={sending} onClick={() => setImage(null)}>
            <X />
          </Button>
        </div>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        readOnly={sending}
        rows={3}
        maxLength={limit}
        showCount
        aria-label={image ? "توضیح عکس" : "متن پاسخ"}
        aria-describedby={hintId}
        placeholder={image ? "توضیح عکس (اختیاری)" : "پاسخ‌تان را بنویسید…"}
      />
      <p id={hintId} className="sr-only">
        با Enter فرستاده می‌شود و با Shift و Enter به خط بعد می‌روید.
      </p>
      {fileError && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {fileError}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <input ref={fileInput} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden onChange={pick} />
        {canAttach ? (
          <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="پیوست عکس (JPEG یا PNG، حداکثر ۸ مگابایت)" disabled={sending} onClick={() => fileInput.current?.click()}>
            <ImagePlus strokeWidth={1.5} />
          </Button>
        ) : (
          <Tooltip content="در اینستاگرام از این‌جا نمی‌شود عکس فرستاد.">
            <Button type="button" variant="ghost" size="icon" className="size-11 cursor-not-allowed opacity-50" aria-label="پیوست عکس در اینستاگرام ممکن نیست" aria-disabled>
              <ImagePlus strokeWidth={1.5} />
            </Button>
          </Tooltip>
        )}
        <Button type="submit" className={cn("ms-auto min-h-11")} disabled={!ready}>
          {sending ? (
            <Spinner size="sm" label="در حال ارسال…" className="text-current" />
          ) : (
            <>
              ارسال
              <SendHorizontal className="-scale-x-100" strokeWidth={2} />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
