-- Correct inherited table privileges in environments that applied the RPC boundary.
revoke all on table public.profiles from authenticated;
