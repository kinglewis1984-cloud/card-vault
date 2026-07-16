-- Cards: one row per collectible, private to the signed-in owner.
create table if not exists public.cards (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text not null check (category in ('pokemon', 'football')),
  image_url text,
  purchase_price numeric,
  purchase_date date,
  notes text,
  created_at timestamptz default now()
);

alter table public.cards enable row level security;

drop policy if exists "Users can view their own cards" on public.cards;
create policy "Users can view their own cards"
  on public.cards for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own cards" on public.cards;
create policy "Users can insert their own cards"
  on public.cards for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own cards" on public.cards;
create policy "Users can update their own cards"
  on public.cards for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own cards" on public.cards;
create policy "Users can delete their own cards"
  on public.cards for delete
  using (auth.uid() = user_id);

-- Storage bucket for card photos (public read, authenticated write)
insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', true)
on conflict (id) do nothing;

drop policy if exists "Card images are publicly viewable" on storage.objects;
create policy "Card images are publicly viewable"
  on storage.objects for select
  using (bucket_id = 'card-images');

drop policy if exists "Authenticated users can upload card images" on storage.objects;
create policy "Authenticated users can upload card images"
  on storage.objects for insert
  with check (bucket_id = 'card-images' and auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete card images" on storage.objects;
create policy "Authenticated users can delete card images"
  on storage.objects for delete
  using (bucket_id = 'card-images' and auth.role() = 'authenticated');
