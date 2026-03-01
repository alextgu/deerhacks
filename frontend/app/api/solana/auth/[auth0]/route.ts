import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.pathname;
  
  if (url.includes("/login")) {
    return NextResponse.redirect(
      `https://dev-78oup18wokgg6j2o.ca.auth0.com/authorize?` +
      `client_id=TqYHAjdNadTmNQMsc5sYXiYHaNwM2PCg` +
      `&redirect_uri=${encodeURIComponent("http://localhost:3000/auth/callback")}` +
      `&response_type=code&scope=openid profile email`
    );
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}