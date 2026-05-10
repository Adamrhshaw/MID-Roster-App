-- Allow unauthenticated reads of published roster blocks only.
-- Required for the public /view route, which uses the anon Supabase client.
create policy "anon_read_published"
  on roster_blocks
  for select
  to anon
  using (status = 'published');
