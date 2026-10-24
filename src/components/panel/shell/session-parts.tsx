import "server-only";

import { requireSeller } from "@/server/auth/session";
import { members } from "@/server/db/repo";
import { hiddenSectionsFor } from "@/server/entitlements/sections";
import { can } from "@/server/team/roles";

import { PanelBottomNavLive, PanelSidebarNavLive } from "./panel-nav";
import { ShopSwitcher } from "./shop-switcher";
import { UserMenu } from "./user-menu";

/** Blocks the panel content until a seller with a shop is signed in (redirects otherwise). */
export async function SellerGate({ children }: { children: React.ReactNode }) {
  await requireSeller();
  return <>{children}</>;
}

/** Shop name (a switcher when the user has several) and account menu; renders inside a Suspense boundary. */
export async function TopbarSession() {
  const { user, shop, role } = await requireSeller();
  const shops = members.shopsFor(user.id).map((m) => ({ id: m.shop.id, name: m.shop.name }));
  return (
    <>
      <ShopSwitcher current={{ id: shop.id, name: shop.name }} shops={shops} />
      <UserMenu name={user.display_name} phone={user.phone} canViewCredit={can(role, "credit.view")} />
    </>
  );
}

/** The menu for the member's role, without the sections the shop's plan leaves out. */
export async function RoleSidebarNav() {
  const { role, shop } = await requireSeller();
  return <PanelSidebarNavLive role={role} hidden={await hiddenSectionsFor(shop.external_business_id)} />;
}

export async function RoleBottomNav() {
  const { role, shop } = await requireSeller();
  return <PanelBottomNavLive role={role} hidden={await hiddenSectionsFor(shop.external_business_id)} />;
}
