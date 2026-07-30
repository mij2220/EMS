import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "ems_session";

// This only checks that a session cookie is present, not that it's a valid,
// unexpired JWT — Next.js middleware runs on the Edge runtime, which can't
// use Node's crypto module that jsonwebtoken needs. Real verification happens
// in every API route via verifySession() (see src/lib/auth.ts). This middleware
// exists purely so a logged-out visitor is redirected before the page renders,
// rather than briefly flashing protected content.
export function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
