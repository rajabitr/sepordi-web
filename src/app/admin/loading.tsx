import { AdminPageSkeleton } from "@/components/admin/page-parts";

/* Every staff page reads the session at request time, so each needs its own boundary for an instant navigation. */
export default function AdminLoading() {
  return <AdminPageSkeleton />;
}
