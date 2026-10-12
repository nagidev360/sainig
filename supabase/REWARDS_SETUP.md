# SAINIG secure coin rewards (backend scaffold)

This backend preserves the existing static login/dashboard. It does **not** activate ads or award coins from browser events.

## Reward rules
- Only a signed server-to-server provider callback can record a completed ad.
- Three unique verified completed events for one Supabase Auth user award 10 coins.
- Provider event IDs are unique; replayed callbacks do not award again.
- Clients can read their own balance/ledger but cannot write reward events, balances, or ledger rows.

## Important: confirm the correct Supabase project first
The repository homepage currently uses Supabase project URL `https://kxrxeodrmpfdrektivll.supabase.co`. Before applying the migration or deploying the function, confirm you have access to that exact project in the Supabase dashboard. Do not apply this migration to another project.

## Apply migration and deploy function
From a trusted local terminal with Supabase CLI installed:

```sh
supabase login
supabase link --project-ref kxrxeodrmpfdrektivll
supabase db push
supabase secrets set REWARD_WEBHOOK_SECRET="REPLACE_WITH_A_LONG_RANDOM_SECRET"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_PROJECT_SERVICE_ROLE_KEY"
supabase functions deploy reward-callback --no-verify-jwt
```

The Edge Function runtime supplies `SUPABASE_URL`; confirm it is set for your project. Keep the service-role key and webhook secret private; never put them in `index.html`, GitHub, or a client app. If the service-role key is already managed automatically in the function environment, do not overwrite it with a wrong key.

## Provider integration required before production
This endpoint expects POST JSON with `provider`, `event_id`, `user_id` (the signed callback's mapped Supabase Auth UUID), and `status: "completed"`. Header `X-Reward-Signature` must be the hex HMAC-SHA256 of the exact raw request body using `REWARD_WEBHOOK_SECRET`.

This is a generic adapter contract, **not a claim that any ad network supports it**. Use it only if the selected provider can send a signed server callback in this format, or adapt the function to that provider's official signature and server-side verification scheme. Do not accept a user ID or completion claim from browser JavaScript. Never use regular AdSense ad views/clicks as rewards.

## Current state
The SQL migration and Edge Function source are committed to GitHub. They have **not** been applied/deployed or tested against the live Supabase project, and the existing dashboard does not yet load its coin balance from this backend. Do not announce rewards as active until provider verification, database migration, function deployment, and end-to-end tests all pass.
