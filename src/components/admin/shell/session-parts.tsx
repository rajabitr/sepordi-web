import "server-only";

import { LogOut } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { fa } from "@/lib/utils";
import { requireAdmin } from "@/server/auth/session";
import { logoutAction } from "@/server/auth/actions";

/** Blocks the staff content until a sepordi admin is signed in (redirects otherwise). */
export async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}

export async function AdminTopbarSession() {
  const { user } = await requireAdmin();
  return (
    <div className="flex items-center gap-2">
      <Avatar name={user.display_name} size="sm" />
      <div className="hidden min-w-0 flex-col leading-normal sm:flex">
        <span className="max-w-40 truncate text-sm font-semibold">{user.display_name}</span>
        <bdi dir="ltr" className="text-xs text-muted-foreground">{fa(user.phone)}</bdi>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          aria-label="خروج"
          className="flex size-11 cursor-pointer items-center justify-center rounded-control text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="size-5" strokeWidth={1.5} />
        </button>
      </form>
    </div>
  );
}
