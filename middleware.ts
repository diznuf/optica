import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = pathname === "/login" || pathname.startsWith("/_next") || pathname === "/favicon.ico";
  const isAuthApi = pathname.startsWith("/api/auth/login") || pathname.startsWith("/api/auth/logout");

  if (isPublic || isAuthApi) {
    return NextResponse.next();
  }

  const token = request.cookies.get("optica_session")?.value;

  if (!token && !pathname.startsWith("/api")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};