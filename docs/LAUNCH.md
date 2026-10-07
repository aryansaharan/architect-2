# Launching Prod AI

The `launch` branch is the public product. It runs on free tiers: Vercel Hobby (hosting and the daily
cleanup job), Supabase Free (auth and Postgres) and an Anthropic API key. Nothing here charges money,
which keeps it within Vercel Hobby's non-commercial terms. Charging (Razorpay) comes later, together
with Vercel Pro.

The launch replaces the submitted site at the same address, on the same Vercel and Supabase projects.

## 1. Anthropic (5 minutes)

1. console.anthropic.com → Settings → Limits: set a monthly spend limit. It's the backstop behind
   every limit in the app.
2. Keep the API key at hand for step 3.

## 2. Supabase: the database changes (5 minutes)

Supabase → the project → SQL Editor. Paste and run each file from `supabase/migrations/`, in this order.
Each one is safe to run more than once.

1. `20260928000000_usage_append_only.sql` (skip if you already ran it)
2. `20260928010000_launch_security.sql`
3. `20260928020000_app_data.sql`
4. `20260929000000_free_tier.sql`
5. `20261007000000_model_budget_limits.sql` and `20261007010000_project_row_caps.sql` (extra limits, optional)
6. `20261008000000_code_apps.sql` (code apps and build records; the app needs it)

Then, still in Supabase:

- **Project Settings → API Keys**: copy the **secret key** (starts with `sb_secret_`) for step 3.
- **Authentication → Sign In / Providers**: Anonymous sign-ins on (guests), Google on.
- **Authentication → URL Configuration**: Site URL is the site's address; Redirect URLs include
  `<address>/**`.

## 3. Vercel: the settings (5 minutes)

Vercel → the project → Settings → Environment Variables (Production). Add or update:

| Name | Value |
|---|---|
| `SUPABASE_SECRET_KEY` | the secret key from step 2 (never with a `NEXT_PUBLIC_` prefix) |
| `ANTHROPIC_API_KEY` | your key |
| `LLM_PROVIDER` | `anthropic` |
| `LLM_MODEL` | `claude-opus-5` |
| `LLM_FAST_MODEL` | `claude-haiku-4-5` |
| `FREE_CREDITS_PER_MONTH` | `300` |
| `LLM_DAILY_USD_GUEST` | `0` |
| `LLM_DAILY_USD_MEMBER` | `1` |
| `LLM_DAILY_USD_SITE` | `10` (raise when there are more people) |
| `CRON_SECRET` | a long random string |
| `RATE_LIMIT_SALT` | a long random string |
| `SIGNING_SECRET` | a long random string |

A long random string: run `openssl rand -hex 32` in a terminal, once per setting.

## 4. Merge and check

1. Merge `launch` into `main`. Vercel deploys it.
2. Check on the live site:
   - A guest gets a starter plan.
   - Signing in with Google shows "300 of 300 credits this month".
   - A plan by Claude takes 40 credits.
   - Publishing works, and a signed-out visitor sees only the public page.
   - The end-to-end tests pass: `BASE_URL=<address> npx playwright test`.

## Later

- **Email** (invitations and AI helpers that send email): a domain, a Resend account with that
  domain verified, then `RESEND_API_KEY` and `EMAIL_FROM`. Until then invitations show a link to copy.
  Set `ABUSE_REPORT_TO` to your address too, so each "Report this page" reaches you by email.
- **Sign-in emails**: Supabase's built-in sender allows only a few an hour. With a domain, set custom
  SMTP (Resend works) in Authentication → Emails.
- **Charging**: Vercel Pro (commercial use), a Razorpay account, then the credit packs.
- **Limits** are in `lib/pricing.ts` (prices, allowance), `lib/llm/guard.ts` (rate limits, daily model
  budgets), `lib/security/caps.ts` and `supabase/migrations/20260929000000_free_tier.sql` (projects,
  records, versions kept, guest cleanup).
