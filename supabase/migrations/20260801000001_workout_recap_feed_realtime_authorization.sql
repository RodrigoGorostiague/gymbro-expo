-- Applies the RLS helper permission for databases that received the initial feed migration.
grant execute on function private.is_recap_viewer(uuid, uuid) to authenticated;
