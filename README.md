# IMBABC

IMBABC is an Indonesian-language WhatsApp Business Platform product in phased development. The supplied IMBABC logo is used unchanged. This checkout runs on Next.js-compatible Vinext for Sites hosting and keeps secrets out of the browser.

## Current scope

| Area | Status |
| --- | --- |
| Public homepage, registration/login UI, dashboard, responsive brand | Implemented |
| Email/password and Google sign-in | Wired to Supabase Auth; needs a dedicated project and Google provider configuration |
| Workspace creation, contact list/consent capture, campaign drafts | Implemented against the dedicated Supabase schema; inactive until configured |
| Tenant isolation | Row-level policies for initial owner-only workspace, contacts, templates and drafts in `db/schema.sql` |
| Meta webhook verification and durable ingress | Implemented at `/webhooks/meta/whatsapp`; requires Meta app secret and dedicated Supabase backend settings |
| Meta Embedded Signup, WABA/number linking | Planned; the UI correctly reports disconnected |
| Approved-template sync, broadcast workers, delivery tracking | Planned; sending is disabled |
| Inbox, automation, AI, analytics, billing, super admin | Planned; navigation clearly marks them inactive |

There is **no live broadcast capability** in this version. The platform does not claim Meta partner status. “Unlimited campaigns” can only mean that IMBABC imposes no separate campaign-creation cap, subject to Meta policies, eligibility, pricing, quality and API limits.

## Set up a dedicated Supabase project

Do not apply this schema to another product's database. In a new Supabase project, apply `db/schema.sql`, review database advisors, and test RLS with two separate user accounts before using customer data. Add the project's URL and publishable key as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. For Google sign-in, enable Google in Supabase Auth and configure Google's OAuth client, Supabase callback and this app's redirect URL.

The server-side webhook also needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never expose the service-role key to the client. Register `/webhooks/meta/whatsapp` as Meta's callback with the verify token and the Meta app secret. The ingress stores signed raw events idempotently; processing them into campaigns, messages and status analytics is a later phase.

The complete variable checklist is in `.env.example`. Configure hosted variables through the hosting environment; do not commit real secrets.

## Development

```bash
pnpm install
pnpm dev
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

The app runs in a Cloudflare Worker-compatible environment when hosted with Sites. It has no Redis/TCP worker yet; the requested BullMQ sending pipeline will need a separate Node.js worker service and queue deployment before production broadcasting. Do not mark Meta connection or send delivery “working” until that full end-to-end path has been tested with an approved account.

## GitHub

This source is ready for a **new** IMBABC repository. Do not push it to the existing IMBATOK repository. Once an empty repository has been created in the desired GitHub account, add its URL as `origin` and push the source branch. No credentials are included in this ZIP.
