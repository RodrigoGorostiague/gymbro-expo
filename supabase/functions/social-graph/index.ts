import { createClient } from 'npm:@supabase/supabase-js@2';
import { createGraphRequestHandler } from './handler.ts';

Deno.serve(createGraphRequestHandler((authorization) => createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } },
    ),
));
