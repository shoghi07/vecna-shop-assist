import { supabase } from '@/lib/supabase';
import type { Intent } from '@/app/api/chat/route'; // reuse type if needed

let cachedIntents: Intent[] | null = null;

export async function loadIntents(): Promise<Intent[]> {
    if (cachedIntents) return cachedIntents;
    const { data, error } = await supabase
        .from('intents')
        .select('intent_id, name, description');
    if (error) throw new Error('Failed to load intents');
    cachedIntents = data as Intent[];
    return cachedIntents;
}

export function getIntentIds(): string[] {
    if (!cachedIntents) return [];
    return cachedIntents.map((i) => i.intent_id);
}
