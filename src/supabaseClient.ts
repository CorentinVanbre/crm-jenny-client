import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://votre-projet.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || 'votre-clé-anonyme';

export const supabase = createClient(supabaseUrl, supabaseKey);