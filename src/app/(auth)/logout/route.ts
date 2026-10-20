import { NextResponse, type NextRequest } from "next/server";

import { destroySession } from "@/server/auth/session";

/**
 * `<form method="post" action="/logout">` from any signed-in screen, JavaScript or not. A cross-site POST is
 * refused so another site cannot sign the seller out.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return new NextResponse(null, { status: 403 });
  }
  await destroySession();
  // Relative: behind the CDN and the router request.url carries the internal host.
  return new NextResponse(null, { status: 303, headers: { Location: "/" } });
}
