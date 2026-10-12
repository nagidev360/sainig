# SAINIG Rewards — Lootably website offerwall

This integration uses Lootably's official server-to-server postback hash validation. A browser redirect or client-side JavaScript event never credits coins.

## Reward rule
Every 3 unique, verified Lootably completed transactions award 10 SAINIG coins. Duplicate transaction IDs are ignored by the database.

## 1. Create a Lootably placement
1. Sign up at https://dashboard.lootably.com/ and create a website placement for `sainig.onrender.com`.
2. In the placement's Postback settings, copy its **Postback Secret**. Keep it private.
3. Configure the offerwall user ID/SID to be the authenticated user's Supabase Auth UUID. Never trust a user ID supplied independently by the browser.

## 2. Set the Supabase secret
In Supabase Dashboard → Project `kxrxeodrmpfdrektivll` → Edge Functions → Secrets, add:
- Name: `LOOTABLY_POSTBACK_SECRET`
- Value: the private Postback Secret from Lootably

The function also needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in its runtime. Supabase normally provides these automatically. Never place secrets in `index.html` or GitHub.

## 3. Configure Lootably's postback URL
Set the placement's postback URL to:

`https://kxrxeodrmpfdrektivll.supabase.co/functions/v1/lootably-postback?userID={userID}&ip={ip}&revenue={revenue}&currencyReward={currencyReward}&transactionID={transactionID}&status={status}&hash={hash}`

Use the exact macros shown in Lootably's Postbacks dashboard. The endpoint validates SHA-256 of `userID + ip + revenue + currencyReward + Postback Secret`, accepts only status `1`, and requires `userID` to be a Supabase Auth UUID. It returns plain text `1` on success as required by Lootably.

## 4. Finish and test the placement
- Copy the placement's official iframe/direct integration from Lootably's Integration tab and configure its public placement identifier in the website. The UI/offerwall is not active until this is done.
- Use Lootably's postback tester with a test user's actual Supabase Auth UUID.
- Confirm three unique verified callbacks add 10 coins; replaying a transaction ID must not award again.
- Confirm invalid signatures and non-completed statuses are rejected.
- Do not use ordinary AdSense impressions/clicks as rewards.

## Current status
The `lootably-postback` Edge Function is deployed, and its source is committed. The Lootably account/placement, private secret, offerwall UI configuration, and end-to-end live test are still required. Do not claim rewards are live until those steps pass.

Official docs: https://documentation.lootably.com/docs/postbacks and https://documentation.lootably.com/docs/offerwall-integration
