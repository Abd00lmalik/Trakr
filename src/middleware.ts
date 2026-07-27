import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname !== "/api/a2mcp/recommend/") {
    return NextResponse.next();
  }

  const canonicalUrl = request.nextUrl.clone();
  canonicalUrl.pathname = "/api/a2mcp/recommend";
  return NextResponse.rewrite(canonicalUrl);
}

export const config = {
  matcher: ["/api/a2mcp/recommend/:path*"],
};
