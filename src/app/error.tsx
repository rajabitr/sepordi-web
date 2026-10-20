"use client";

import { useEffect } from "react";

import { ErrorScreen } from "@/components/brand/error-screen";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error && typeof error === "object" && "digest" in error ? String(error.digest) : undefined;
  return <ErrorScreen kind="500" onRetry={retry} reference={digest} />;
}
