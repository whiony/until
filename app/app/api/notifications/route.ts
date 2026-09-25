export function GET() {
  return Response.json({
    available: false,
    reason:
      "Reminders are not available yet. This site needs a server scheduler, a push subscription store, and Web Push credentials. Your preferences can be saved, but no alerts will be sent.",
  });
}
