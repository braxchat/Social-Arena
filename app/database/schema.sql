-- Social Arena - Supabase Database Schema
-- 
-- Rooms and room members tables for cross-device multiplayer

-- Rooms table
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id text not null,
  mode text not null,
  max_players int not null,
  name text,
  description text,
  created_at timestamp default now()
);

-- Room members table
create table if not exists room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id text not null,
  role text,
  created_at timestamp default now(),
  unique (room_id, user_id)
);

-- Indexes for performance
create index if not exists idx_rooms_code on rooms(code);
create index if not exists idx_room_members_room_id on room_members(room_id);
create index if not exists idx_room_members_user_id on room_members(user_id);

-- Enable Row Level Security (RLS)
alter table rooms enable row level security;
alter table room_members enable row level security;

-- RLS Policies: Allow all operations for now (will be restricted with auth later)
create policy "Allow all operations on rooms" on rooms
  for all using (true) with check (true);

create policy "Allow all operations on room_members" on room_members
  for all using (true) with check (true);


