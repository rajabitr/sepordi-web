import { PanelPageSkeleton } from "@/components/panel/shell/skeletons";

/* Applies to every panel route without its own loading.tsx, so it stays generic; the overview streams its own sections. */
export default function PanelLoading() {
  return <PanelPageSkeleton />;
}
