import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
function hex(bytes: Uint8Array) { return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""); }
async function sha256(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return text("method not allowed", 405);
  const secret = Deno.env.get("LOOTABLY_POSTBACK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !supabaseUrl || !serviceRoleKey) {
    console.error("Lootably postback environment is not configured");
    return text("reward endpoint not configured", 503);
  }
  const p = new URL(req.url).searchParams;
  const userId = p.get("userID") ?? "";
  const eventId = p.get("transactionID") ?? "";
  const ip = p.get("ip") ?? "";
  const revenue = p.get("revenue") ?? "";
  const currencyReward = p.get("currencyReward") ?? "";
  const status = p.get("status") ?? "";
  const supplied = (p.get("hash") ?? "").toLowerCase();
  if (!uuid.test(userId) || !eventId || eventId.length > 255 || !ip || !revenue ||
      !currencyReward || status !== "1" || !supplied) return text("invalid postback parameters", 400);
  // Official Lootably formula: SHA256(userID + ip + revenue + currencyReward + Postback Secret).
  const expected = await sha256(userId + ip + revenue + currencyReward + secret);
  if (!equal(supplied, expected)) return text("invalid signature", 401);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.rpc("sainig_record_verified_reward", {
    p_provider: "lootably", p_event_id: eventId, p_user_id: userId,
  });
  if (error) {
    console.error("Failed to record Lootably reward", error.message);
    return text("reward processing failed", 500);
  }
  return text("1");
});
