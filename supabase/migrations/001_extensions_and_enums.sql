-- FAZ 0 v1.4.1 FINAL LOCKED — Migration 001: extensions and central enums
-- Tables, RPC, RLS, triggers: none (later migrations)

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TYPE public.event_status AS ENUM (
  'draft',
  'published',
  'postponed',
  'cancelled',
  'completed'
);

CREATE TYPE public.order_status AS ENUM (
  'draft',
  'pending_payment',
  'paid',
  'failed',
  'expired',
  'cancelled_by_organizer'
);

CREATE TYPE public.payment_status AS ENUM (
  'pending',
  'authorized',
  'captured',
  'failed',
  'refunded',
  'partially_refunded',
  'voided'
);

CREATE TYPE public.qr_status AS ENUM (
  'active',
  'used',
  'revoked'
);

CREATE TYPE public.resource_type AS ENUM (
  'table',
  'seat'
);

CREATE TYPE public.financial_status AS ENUM (
  'pending_payment',
  'online_paid',
  'partially_collected_at_venue',
  'venue_balance_settled'
);

CREATE TYPE public.line_role AS ENUM (
  'obligation',
  'allocation_online',
  'allocation_venue',
  'commission',
  'tax',
  'refund',
  'fee',
  'adjustment'
);

CREATE TYPE public.ticket_status AS ENUM (
  'pending_payment',
  'active',
  'transferred',
  'used',
  'cancelled'
);

CREATE TYPE public.reservation_status AS ENUM (
  'pending_payment',
  'confirmed',
  'transferred',
  'used',
  'cancelled'
);
