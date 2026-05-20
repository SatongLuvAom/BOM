# BOQ System

Next.js App Router web app for material master, suppliers, prices, BOM, BOQ, customers, templates, reports, and LINE bot lookup.

## Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL, Auth, Storage
- LINE Messaging API
- Anthropic SDK for optional AI price suggestions

## Source Of Truth

Use [supabase/setup_complete.sql](D:/Program/BOQ/supabase/setup_complete.sql) as the main database setup file for a fresh Supabase project.

Other SQL files under [supabase](D:/Program/BOQ/supabase) are module references or historical split files:

- [schema.sql](D:/Program/BOQ/supabase/schema.sql): MAT, supplier, price reference
- [boq_schema.sql](D:/Program/BOQ/supabase/boq_schema.sql): BOQ reference
- [bom_schema.sql](D:/Program/BOQ/supabase/bom_schema.sql): BOM reference
- [customer_schema.sql](D:/Program/BOQ/supabase/customer_schema.sql): customer reference
- [attachments_schema.sql](D:/Program/BOQ/supabase/attachments_schema.sql): attachment reference
- [comments_schema.sql](D:/Program/BOQ/supabase/comments_schema.sql): comment reference
- [templates_schema.sql](D:/Program/BOQ/supabase/templates_schema.sql): template reference
- [views.sql](D:/Program/BOQ/supabase/views.sql): view reference
- [seed.sql](D:/Program/BOQ/supabase/seed.sql): sample data

For a new environment, run only:

1. [setup_complete.sql](D:/Program/BOQ/supabase/setup_complete.sql)
2. [seed.sql](D:/Program/BOQ/supabase/seed.sql), only when sample data is needed

## Environment Variables

Create [D:\Program\BOQ\.env.local](D:/Program/BOQ/.env.local) from [D:\Program\BOQ\.env.local.example](D:/Program/BOQ/.env.local.example).

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxx

LINE_CHANNEL_SECRET=your-line-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=your-line-channel-access-token
LINE_BOT_API_BASE_URL=https://api.line.me

ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx
GEMINI_API_KEY=your-gemini-api-key
```

Where to find each value:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase Dashboard > Project Settings > Data API > Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Dashboard > Project Settings > API Keys > Publishable key
- `LINE_CHANNEL_SECRET`: LINE Developers > Messaging API channel > Basic settings
- `LINE_CHANNEL_ACCESS_TOKEN`: LINE Developers > Messaging API channel > Messaging API > Channel access token
- `LINE_BOT_API_BASE_URL`: keep `https://api.line.me`
- `ANTHROPIC_API_KEY`: optional, required only for AI price suggestion
- `GEMINI_API_KEY`: optional, required only for Receipt Import AI/OCR. Receipt extraction tries Gemini 2.5 Flash first, then Gemini 2.5 Flash Lite, then Gemini 3.5 Flash when earlier models are rate-limited or unavailable.

Do not put Supabase `secret` or `service_role` keys in `NEXT_PUBLIC_*` variables.

## Supabase Setup Checklist

1. Create or open the Supabase project.
2. Open SQL Editor.
3. Run [setup_complete.sql](D:/Program/BOQ/supabase/setup_complete.sql).
4. For an existing database that already has tables, run [rls_policies.sql](D:/Program/BOQ/supabase/rls_policies.sql) to enable/refresh RLS without recreating schema.
5. Run [seed.sql](D:/Program/BOQ/supabase/seed.sql) if sample data is needed.
6. Confirm these tables exist: `mat_master`, `mat_category`, `mat_uom`, `supplier`, `mat_price_base`, `boq_project`, `boq_item`, `customer`, `boq_attachment`, `boq_comment`, `boq_template`, `boq_template_item`, `bom_template`, `bom_item`.
7. Confirm the view exists: `v_mat_latest_price`.
8. Confirm the storage bucket exists: `boq-attachments`.
9. If schema cache issues appear, run:

```sql
NOTIFY pgrst, 'reload schema';
```

## RLS Strategy

Current setup is production-first:

- App tables in [setup_complete.sql](D:/Program/BOQ/supabase/setup_complete.sql) enable RLS.
- [rls_policies.sql](D:/Program/BOQ/supabase/rls_policies.sql) is the standalone migration for existing databases.
- `anon` has no direct table access.
- `authenticated` can read, insert, and update app tables.
- Hard table `DELETE` is not granted; the app should use soft delete fields.
- Storage bucket `boq-attachments` uses authenticated-only policies.
- Next.js middleware requires login for app pages and APIs except the public LINE webhook.

## Auth Setup

The app uses Supabase Auth middleware. At least one user must exist before using the app.

Create a user in:

```text
Supabase Dashboard > Authentication > Users > Add user
```

Then sign in at:

```text
http://localhost:3000/login
```

## Local Development

```powershell
cd D:\Program\BOQ
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful checks:

```powershell
& 'C:\Program Files\nodejs\node.exe' .\node_modules\typescript\bin\tsc --noEmit
npm run build
```

## Vercel Deployment Checklist

1. Create a Vercel project from this repo.
2. Add these environment variables in Vercel Project Settings: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_BOT_API_BASE_URL`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`.
3. Deploy.
4. Open the deployed URL and sign in with a Supabase Auth user.
5. Test `/settings/setup`, `/settings/system`, `/materials`, `/boq`, `/bom`, `/customers`, and `/dashboard`.

## LINE Bot Setup Checklist

1. Open LINE Developers.
2. Select the Messaging API channel.
3. Set webhook URL:

```text
https://your-domain.com/api/line/webhook
```

4. Enable webhook.
5. Add `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN` to local and Vercel environment variables.
6. Test these messages:

```text
help
ค้นหา MDF
วัสดุ MDF 9 มม
ราคา MDF 9 มม
```

The bot only replies to supported commands. Other chat messages are ignored.

## Data Flow

```text
Browser
  |
  |-- Server Components ----------> Supabase DB
  |
  `-- Client Components ----------> API Routes ----------> Supabase DB

LINE
  |
  `-- /api/line/webhook -------> LINE service -------> MAT lookup -------> Supabase DB
```

## Main Folders

- [app](D:/Program/BOQ/app): pages and API routes
- [components](D:/Program/BOQ/components): UI and module components
- [lib](D:/Program/BOQ/lib): Supabase clients, validations, services, LINE helpers
- [types](D:/Program/BOQ/types): TypeScript data contracts
- [supabase](D:/Program/BOQ/supabase): SQL setup, references, seed data

## Operational Notes

- Use `/settings/system` after setup or deploy to check env, Supabase tables, latest price view, storage, LINE, and AI config.
- Use `/settings/setup` as the step-by-step install and deploy checklist.
- If data exists in Supabase but pages show empty lists, check RLS and run `NOTIFY pgrst, 'reload schema';`.
- If Supabase client creation fails, check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- If attachment upload fails, confirm bucket `boq-attachments` exists and the user is authenticated.
- If LINE webhook returns `401`, check `LINE_CHANNEL_SECRET`.
- If LINE reply fails, check `LINE_CHANNEL_ACCESS_TOKEN`.
- If AI price suggestion returns `503`, set `ANTHROPIC_API_KEY`.
