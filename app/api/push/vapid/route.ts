export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return Response.json(
      { error: "Push notifications are not configured yet." },
      { status: 503 },
    );
  }

  return Response.json({ publicKey });
}
