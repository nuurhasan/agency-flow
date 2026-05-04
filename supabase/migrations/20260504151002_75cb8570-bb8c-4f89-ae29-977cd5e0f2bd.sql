-- Public bucket for user avatars
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read
create policy "Avatars are publicly readable"
on storage.objects for select
using (bucket_id = 'avatars');

-- Users manage only their own folder: avatars/{user_id}/...
create policy "Users upload own avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users update own avatar"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users delete own avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);