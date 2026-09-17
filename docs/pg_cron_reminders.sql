-- Supabase pg_cron setup for reservation reminders
-- Run this in Supabase SQL Editor or via `supabase db push`

-- Enable pg_cron extension (requires Supabase Pro or self-hosted)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net for HTTP requests (if calling Vercel endpoints)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule: Run every hour at minute 0 to check for 24h reminders
SELECT cron.schedule(
  'reservation-reminders-24h',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT net.http_get(
    url := 'https://your-domain.vercel.app/api/cron/reminders/24h',
    headers := '{"Authorization": "Bearer ' || current_setting('app.cron_secret', true) || '"}'::jsonb
  );
  $$
);

-- Schedule: Run every hour at minute 0 to check for 2h reminders
SELECT cron.schedule(
  'reservation-reminders-2h',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT net.http_get(
    url := 'https://your-domain.vercel.app/api/cron/reminders/2h',
    headers := '{"Authorization": "Bearer ' || current_setting('app.cron_secret', true) || '"}'::jsonb
  );
  $$
);

-- Alternative: Direct database function approach (no external HTTP call)
-- This would require implementing the reminder logic directly in PL/pgSQL
-- For now we use the HTTP approach calling our Next.js API routes

-- To unschedule:
-- SELECT cron.unschedule('reservation-reminders-24h');
-- SELECT cron.unschedule('reservation-reminders-2h');

-- View scheduled jobs:
-- SELECT * FROM cron.job;