import { paypalConfig } from "@/lib/paypal-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cfg = paypalConfig();
    return Response.json({ clientId: cfg.clientId, env: cfg.env });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "PayPal is not configured." }, { status: 500 });
  }
}
