import { createClient } from '@supabase/supabase-js';

// Trim any trailing spaces from env vars
const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
