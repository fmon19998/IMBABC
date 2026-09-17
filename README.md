# IMBABC

IMBABC is an Indonesian-language WhatsApp Business Platform app. It uses the supplied logo unchanged, the official Meta Graph API, and a separate sender worker. This checkout runs on Next-compatible Vinext/Sites.

## What works when connected

1. Register/login through a dedicated Supabase Auth project; create a workspace.
2. Add contacts in E.164 format, with explicit opt-in evidence. An owner can opt a contact out; inbound STOP/Berhenti/Unsubscribe messages opt contacts out too.
3. Connect one WhatsApp Business number per workspace using its WABA ID, Phone Number ID, and a **system user access token** with official Meta permissions. The server verifies the phone against that WABA, subscribes the app to webhooks, and encrypts the token using AES-256-GCM before saving it.
4. Sync message templates directly from Meta. Only `APPROVED` static text templates without variables, headers, or buttons are eligible in this release.
5. Create a campaign draft, select a template, and enqueue **all currently opted-in contacts** via one atomic database operation. A healthy sender worker is required before launching.
6. The worker claims unique recipients using `FOR UPDATE SKIP LOCKED`, rechecks consent, posts official template messages to the WhatsApp Cloud API, and records the returned Meta message ID. A successful API response is `ACCEPTED`, not delivered. Signed webhook events provide `SENT`, `DELIVERED`, `READ`, or `FAILED` status. Timeouts and ambiguous failures become `UNKNOWN`, never blindly resent.

The app places no arbitrary IMBABC cap on campaign recipients. Meta messaging limits, eligibility, quality, pricing and policy still apply. IMBABC does not claim Meta partner status.

## Current deployment status

- Super admin portal: `/admin/login`; one-time owner activation: `/admin/aktivasi`.
- Separate agent portal: `/agen/login` and `/agen`. Super admin creates agent accounts and isolated workspaces. Public registration is disabled. A companion agent-only Site is hosted at https://imbabc-agen.mrchongno1.chatgpt.site; it omits admin pages and all local server API routes.
- Protected Supabase Edge Function `imbabc-api` handles account management and the existing Meta APIs. Every protected request checks the current Auth user and database role; webhook requests require HMAC; initial activation requires a single-use random secret.
- The owner activation code is delivered privately, never committed or included in a source ZIP.
- Configure Meta App Secret, Graph API version and webhook verification token in the admin portal. Agents then connect their WABA/phone/token and sync approved templates.
- Broadcast drafts support a one-contact test or all opted-in recipients. Scheduled cloud sender processes up to 3 recipients per minute initially; it starts after Meta settings are complete. No message has been sent or verified against a real Meta account yet.
- Agent deactivation blocks browser/backend access and suppresses unsent queue entries. A request already in flight at Meta cannot be recalled.
- The Site retains owner-private hosting access. External agents also need hosting access or an explicitly public login site. App login itself does not change Site sharing.
- Templates currently support approved static text, without media or variables. Meta Embedded Signup, inbox and Botcake feature parity are not implemented.

## Production setup

1. Create a **new dedicated Supabase project**; do not apply this schema to another product's database. Run `db/schema.sql` and then `db/phase2.sql` in SQL editor. Test RLS using two accounts in different organizations before using customer data.
2. Configure Supabase Auth and optionally Google OAuth. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the Site, along with backend-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Existing legacy `SUPABASE_SERVICE_ROLE_KEY` remains a temporary fallback. The raw webhook REST request sends a modern secret key only as `apikey`, not as an `Authorization` JWT.
3. Generate a random 32-byte key and base64-encode it for `TOKEN_ENCRYPTION_KEY`. Set the same value on the Site and worker. Rotating this key requires re-encrypting all stored tokens or reconnecting the Meta account. Keep the key and service-role token out of GitHub and client code.
4. In the Meta app set the WhatsApp webhook callback to `https://<site>/webhooks/meta/whatsapp`, with `META_WEBHOOK_VERIFY_TOKEN`, and set the app secret as `META_APP_SECRET` on the Site. Configure Meta's `whatsapp_business_messaging` and `whatsapp_business_management` permissions for the chosen WABA/number. Set a supported `META_GRAPH_API_VERSION` such as `vXX.Y` (use the version supported by your own Meta app).
5. Run the Node sender on an always-on host with the **same** Supabase URL, service-role key, encryption key, and Graph API version. Set `SEND_RATE_PER_SECOND` conservatively for your account. It updates `worker_heartbeats` every poll; campaign launch is refused when no recent heartbeat exists. A Cloudflare/Sites web runtime does not keep this separate Node process alive.
6. Use the WhatsApp section to connect WABA credentials; sync templates, record contact consent, and launch a small approved test campaign first. Verify the API acceptance and actual webhook status before production sends.

Example local worker command (configure environment before running):

```bash
pnpm install
pnpm worker:start
```

Use `.env.example` as a variable checklist. No real tokens belong in the repository or ZIP.

## Development and checks

```bash
pnpm install
pnpm dev
pnpm exec tsc --noEmit
pnpm lint
pnpm test:worker
pnpm build
```

Worker tests exercise the official template payload, ambiguous API outcomes, opt-out expressions, and AES-GCM interoperability. Without a dedicated Supabase project and Meta test WABA, full end-to-end sending and SQL/RLS integration cannot be verified yet.

## Cloud deployment

Apply `db/phase3.sql` after phase 2, then `db/phase4-cloud-worker.sql` (change its project URL for another deployment). Run `node scripts/package-edge.mjs` to package Edge Function source. Deploy as `imbabc-api` with entrypoint `index.ts`, import map `deno.json` and `verify_jwt=false`; the function explicitly authenticates each protected route. Default server keys remain in the Edge runtime. Runtime settings are service-role-only with RLS and no client grants.

The standalone Node worker remains available as an alternative. Do not run extra workers solely to bypass Meta rate limits. No secret values are stored in source.
