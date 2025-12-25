-- Enable Realtime for receipts table
alter publication supabase_realtime add table receipts;

-- Ensure RLS is properly configured for realtime
-- Users should only see their own receipts via realtime
alter table receipts enable row level security;

-- Grant necessary permissions for realtime
grant select on receipts to authenticated;
grant select on receipts to anon;
