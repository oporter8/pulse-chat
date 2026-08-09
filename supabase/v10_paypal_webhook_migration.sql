-- Tiger Chat v10 — PayPal/Venmo webhook reliability
-- Run ONCE after v9_migration.sql on the existing database.
-- This does not remove or alter existing paid/free access grants.

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'paypal',
  provider_order_id text not null unique,
  provider_capture_id text unique,
  funding_source text,
  amount_cents integer not null default 300,
  currency text not null default 'USD',
  status text not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint payment_orders_provider_check check (provider = 'paypal'),
  constraint payment_orders_funding_source_check check (funding_source is null or funding_source in ('paypal', 'venmo')),
  constraint payment_orders_amount_check check (amount_cents = 300),
  constraint payment_orders_currency_check check (currency = 'USD'),
  constraint payment_orders_status_check check (status in ('created', 'completed', 'denied', 'canceled'))
);

create index if not exists payment_orders_user_idx
  on public.payment_orders(user_id, created_at desc);

alter table public.payment_orders enable row level security;
revoke all on public.payment_orders from anon, authenticated;

create table if not exists public.paypal_webhook_events (
  event_id text primary key,
  event_type text not null,
  resource_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);

create index if not exists paypal_webhook_events_received_idx
  on public.paypal_webhook_events(received_at desc);

alter table public.paypal_webhook_events enable row level security;
revoke all on public.paypal_webhook_events from anon, authenticated;

-- Existing v9 access grants remain the source of truth for app access.
-- These tables only make PayPal fulfillment durable and idempotent.
