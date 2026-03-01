import { NextRequest, NextResponse } from "next/server";
import { AUTH_SCOPES } from "@/lib/auth-scopes";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.pathname;

  if (url.includes("/login")) {
    return NextResponse.redirect(
      `https://dev-78oup18wokgg6j2o.ca.auth0.com/authorize?` +
        `client_id=TqYHAjdNadTmNQMsc5sYXiYHaNwM2PCg` +
        `&redirect_uri=${encodeURIComponent("http://localhost:3000/auth/callback")}` +
        `&response_type=code&scope=${encodeURIComponent(AUTH_SCOPES)}`
    );
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}