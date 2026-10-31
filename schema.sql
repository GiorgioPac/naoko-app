-- 1. Tabella Eventi Milano
create table if not exists public.events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  district text not null default 'Porta Venezia & NoLo',
  location_name text not null,
  metro text,
  event_date text not null,
  category text default 'Cocktail Bar & Aperitivo',
  instagram text,
  cover_url text,
  description text,
  host_name text default 'Verified Host',
  lat double precision default 45.4642,
  lng double precision default 9.1900,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Tabella Profili Utente & Locali (collegata a Supabase Auth)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  display_name text not null,
  role text not null check (role in ('guest', 'host')),
  instagram_handle text,
  avatar_url text default 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Tabella Partecipanti / RSVP
create table if not exists public.event_attendees (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(event_id, user_id)
);

-- 4. Sicurezza Row Level Security (RLS)
alter table public.events enable row level security;
alter table public.profiles enable row level security;
alter table public.event_attendees enable row level security;

-- Permessi Events
create policy "Public Read Events" on public.events for select using (true);
create policy "Public Insert Events" on public.events for insert with check (true);

-- Permessi Profiles
create policy "Public Read Profiles" on public.profiles for select using (true);
create policy "Users Insert Own Profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users Update Own Profile" on public.profiles for update using (auth.uid() = id);

-- Permessi Event Attendees
create policy "Public Read Attendees" on public.event_attendees for select using (true);
create policy "Authenticated Users RSVP" on public.event_attendees for insert with check (auth.uid() = user_id);
create policy "Users Delete Own RSVP" on public.event_attendees for delete using (auth.uid() = user_id);
