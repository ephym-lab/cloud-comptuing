import { NextResponse, type NextRequest } from "next/server";

/**
 * Route guard: send visitors without a session to /login before the page loads.
 *
 * This is an optimistic check only. The JWT cookies are httpOnly and scoped to /api/,
 * so they're never sent for page URLs. Instead we look for `csrf_refresh_token`, which
 * is set at login, scoped to "/", and cleared on logout. Real authorization happens in
 * Flask on every API call; an expired session is caught there and redirected by api.ts.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("csrf_refresh_token")) {
    return NextResponse.next();
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
