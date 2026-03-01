import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Update the current user's profile with wallet_address and sol_balance.
 * POST body: { walletAddress: string | null, solBalance?: number }
 * - walletAddress: null clears the wallet (on disconnect).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session?.user?.sub) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const walletAddress = body.walletAddress ?? null;
    const solBalance = body.solBalance != null ? Number(body.solBalance) : null;

    const updates: { wallet_address: string | null; sol_balance: number } = {
      wallet_address: walletAddress,
      sol_balance: walletAddress == null ? 0 : solBalance ?? 0,
    };

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", session.user.sub)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
