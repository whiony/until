import { owner, failure } from "@/lib/until/server";
export async function GET(req: Request) {
  try {
    await owner(req);
    return Response.json(
      {
        available: false,
        state: "unavailable",
        reason:
          "Server delivery is not configured. No device subscriptions or alerts are active. Saving reminder preferences does not enable notifications.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
