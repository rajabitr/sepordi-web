/**
 * A gated Partner API route answers 403 `feature_not_entitled` when the partner contract leaves the feature out
 * (partner-api.md §8.19). Accepts a thrown BizinError or a failed `settle` result, which both carry status and code.
 */
export function isNotEntitled(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { status, code } = e as { status?: unknown; code?: unknown };
  return status === 403 && code === "feature_not_entitled";
}
