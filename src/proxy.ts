import { NextResponse, type NextRequest } from "next/server";

/*
 * Optimistic gate only: no cookie, no panel. It never reads the DB; the real check is requireSeller() /
 * requireAdmin() in the layouts, pages, actions and route handlers. Kept here so a signed-out visitor gets a
 * plain 307 instead of a streamed page that redirects itself.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("sp_session")) return NextResponse.next();
  const login = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/panel") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/panel/:path*", "/admin/:path*"],
};
