import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const secret = Deno.env.get("REWARD_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !supabaseUrl || !serviceRoleKey) {
    console.error("Reward webhook environment is not configured");
    return json(503, { error: "Reward verification is not configured" });
  }

  const rawBody = await req.text();
  if (rawBody.length > 16_384) return json(413, { error: "Payload too large" });

  // Provider adapter contract: X-Reward-Signature must be HMAC-SHA256(raw request body),
  // hex encoded. Only configure providers that can securely sign callbacks this way,
  // or implement their official signature verification here.
  const supplied = (req.headers.get("x-reward-signature") ?? "").replace(/^sha256=/i, "").toLowerCase();
  const expected = await sign(secret, rawBody);
  if (!supplied || !constantTimeEqual(supplied, expected)) {
    return json(401, { error: "Invalid provider signature" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const provider = payload.provider;
  const eventId = payload.event_id;
  const userId = payload.user_id;
  const eventStatus = payload.status;

  if (
    typeof provider !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(provider) ||
    typeof eventId !== "string" || eventId.length < 1 || eventId.length > 255 ||
    typeof userId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) ||
    eventStatus !== "completed"
  ) {
    return json(400, { error: "Invalid or incomplete reward event" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("sainig_record_verified_reward", {
    p_provider: provider,
    p_event_id: eventId,
    p_user_id: userId,
  });

  if (error) {
    console.error("Failed to record verified reward", error.message);
    return json(500, { error: "Could not record reward" });
  }
  return json(200, data as Record<string, unknown>);
});
