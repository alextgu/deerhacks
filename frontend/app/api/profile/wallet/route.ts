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

    const updates: Record<string, unknown> = {
      wallet_address: walletAddress,
    };
    if (solBalance != null) {
      updates.sol_balance = walletAddress == null ? 0 : solBalance;
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", session.user.sub)
      .select()
      .single();

    if (error) {
      if (error.message?.includes("sol_balance")) {
        const { data: d2, error: e2 } = await supabaseAdmin
          .from("profiles")
          .update({ wallet_address: walletAddress })
          .eq("id", session.user.sub)
          .select()
          .single();
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
        return NextResponse.json({ profile: d2 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
