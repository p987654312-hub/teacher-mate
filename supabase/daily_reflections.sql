-- ============================================================
-- 일일 성찰 기록: daily_reflections
-- ============================================================
-- 실행: Supabase 대시보드 → SQL Editor → New query → Run
-- ============================================================

-- (필요 시) UUID 생성 함수용 확장
create extension if not exists pgcrypto;

create table if not exists public.daily_reflections (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  reflection_date date not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_daily_reflections_user_date
  on public.daily_reflections (user_email, reflection_date desc, created_at desc);

create index if not exists idx_daily_reflections_created_at
  on public.daily_reflections (created_at desc);

-- updated_at 자동 갱신 트리거
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_daily_reflections_updated_at on public.daily_reflections;
create trigger trg_daily_reflections_updated_at
before update on public.daily_reflections
for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.daily_reflections enable row level security;

-- 정책: 로그인한 사용자(email claim)가 본인 것만 CRUD 가능
drop policy if exists "daily_reflections_select_own" on public.daily_reflections;
create policy "daily_reflections_select_own"
on public.daily_reflections
for select
using ((auth.jwt() ->> 'email') = user_email);

drop policy if exists "daily_reflections_insert_own" on public.daily_reflections;
create policy "daily_reflections_insert_own"
on public.daily_reflections
for insert
with check ((auth.jwt() ->> 'email') = user_email);

drop policy if exists "daily_reflections_update_own" on public.daily_reflections;
create policy "daily_reflections_update_own"
on public.daily_reflections
for update
using ((auth.jwt() ->> 'email') = user_email)
with check ((auth.jwt() ->> 'email') = user_email);

drop policy if exists "daily_reflections_delete_own" on public.daily_reflections;
create policy "daily_reflections_delete_own"
on public.daily_reflections
for delete
using ((auth.jwt() ->> 'email') = user_email);

