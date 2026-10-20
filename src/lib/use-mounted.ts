import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during SSR and hydration, true after: for portals that need `document`. */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
