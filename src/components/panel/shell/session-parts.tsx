import "server-only";

import { Store } from "lucide-react";

import { requireSeller } from "@/server/auth/session";

import { UserMenu } from "./user-menu";

/** Blocks the panel content until a seller with a shop is signed in (redirects otherwise). */
export async function SellerGate({ children }: { children: React.ReactNode }) {
  await requireSeller();
  return <>{children}</>;
}

/** Shop name and account menu; reads the session, so it renders inside a Suspense boundary. */
export async function TopbarSession() {
  const { user, shop } = await requireSeller();
  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <Store className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <span className="truncate font-semibold">{shop.name}</span>
      </div>
      <UserMenu name={user.display_name} phone={user.phone} />
    </>
  );
}
