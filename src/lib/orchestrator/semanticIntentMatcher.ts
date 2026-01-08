/**
 * Semantic Intent Matcher
 * 
 * Validates if the LLM's classified intent actually matches user's needs
 * by checking semantic similarity against intent descriptions.
 * If no good match, triggers dynamic capability fallback.
 */

import { supabase } from '@/lib/supabase';

export interface IntentWithDescription {
    intent_id: string;
    name: string;
    description: string | null;
}

export interface SemanticMatchResult {
    matched_intent_id: string | null;
    confidence: number;
    inferred_need: string;
    match_reason: string;
    should_use_fallback: boolean;
}

/**
 * Load all intents with their full descriptions from database
 */
export async function loadIntentsWithDescriptions(): Promise<IntentWithDescription[]> {
    const { data, error } = await supabase
        .from('intents')
        .select('intent_id, name, description')
        .neq('safety_level', 'blocked'); // Exclude blocked intents

    if (error) {
        console.error('Failed to load intents:', error);
        return [];
    }

    return data as IntentWithDescription[];
}

/**
 * Use LLM to validate if classified intent semantically matches user's need
 */
export async function validateIntentMatch(
    classifiedIntentId: string | null,
    userMessage: string,
    conversationContext: string,
    intents: IntentWithDescription[]
): Promise<SemanticMatchResult> {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    // Build intent descriptions for LLM
    const intentDescriptions = intents.map(i =>
        `- ${i.intent_id}: "${i.name}" - ${i.description || 'No description'}`
    ).join('\n');

    const prompt = `You are a semantic matching expert. Given a user's request and available product categories, determine if there's a good semantic match.

User Message: "${userMessage}"
${conversationContext ? `Conversation Context: ${conversationContext}` : ''}

LLM Initially Classified As: "${classifiedIntentId || 'null'}"

Available Product Categories:
${intentDescriptions}

TASK:
1. First, describe in 1 sentence what the user actually NEEDS (their "inferred_need")
2. Then, check if ANY category genuinely fits this need semantically
3. A match must be SEMANTICALLY correct, not just keyword overlap

MATCHING RULES:
- "wedding photography" should match "travel vlogging/personal documentation" if it mentions memories/events
- "wedding photography" should NOT match "classroom meetings" just because both involve recording
- Only return a match if confidence >= 0.7

Respond with ONLY this JSON:
{
  "inferred_need": "Brief description of what user actually needs",
  "best_matching_intent_id": "intent_id or null if no good match",
  "match_confidence": 0.0 to 1.0,
  "match_reason": "Why this is/isn't a good match",
  "should_use_fallback": true/false
}`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 500 }
                })
            }
        );

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

        // Extract JSON
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) {
            console.warn('❌ Failed to parse semantic match, using original classification');
            return {
                matched_intent_id: classifiedIntentId,
                confidence: 0.5,
                inferred_need: userMessage,
                match_reason: 'Parse failed',
                should_use_fallback: classifiedIntentId === null
            };
        }

        const result = JSON.parse(jsonMatch[0]);

        console.log(`🎯 Semantic validation:`, {
            inferred_need: result.inferred_need,
            original: classifiedIntentId,
            validated: result.best_matching_intent_id,
            confidence: result.match_confidence,
            reason: result.match_reason
        });

        return {
            matched_intent_id: result.best_matching_intent_id || null,
            confidence: result.match_confidence || 0,
            inferred_need: result.inferred_need || userMessage,
            match_reason: result.match_reason || '',
            should_use_fallback: result.should_use_fallback ?? (result.match_confidence < 0.7)
        };

    } catch (error) {
        console.error('Semantic validation failed:', error);
        return {
            matched_intent_id: classifiedIntentId,
            confidence: 0.5,
            inferred_need: userMessage,
            match_reason: 'Validation error',
            should_use_fallback: classifiedIntentId === null
        };
    }
}

/**
 * Quick keyword-based pre-check before LLM validation
 * Returns true if the classified intent seems plausible
 */
export function quickSemanticCheck(
    classifiedIntentId: string | null,
    userMessage: string
): boolean {
    if (!classifiedIntentId) return false;

    const lower = userMessage.toLowerCase();

    const semanticMappings: Record<string, string[]> = {
        'travel_vlogging': ['travel', 'vlog', 'trip', 'vacation', 'memory', 'memories', 'wedding', 'birthday', 'event', 'party', 'celebration', 'milestone'],
        'home_security': ['home', 'security', 'monitor', 'surveillance', 'burglar', 'theft', 'protect'],
        'sports_action_outdoor': ['sport', 'action', 'outdoor', 'adventure', 'extreme', 'bike', 'ski', 'surf', 'hike'],
        'desk_streaming': ['stream', 'youtube', 'twitch', 'desk', 'webcam', 'content creator', 'podcast', 'interview'],
        'wildlife_hunting': ['wildlife', 'bird', 'nature', 'animal', 'hunting', 'trail', 'outdoor'],
        'dashcam': ['car', 'drive', 'driving', 'vehicle', 'road', 'dashcam', 'dash cam'],
        'classroom_meetings': ['class', 'classroom', 'lecture', 'meeting', 'conference', 'training', 'presentation'],
        'child_elder_monitoring': ['baby', 'child', 'kid', 'elder', 'parent', 'nanny', 'monitor', 'home care']
    };

    const keywords = semanticMappings[classifiedIntentId] || [];
    const hasMatch = keywords.some(kw => lower.includes(kw));

    // Log mismatch for debugging
    if (!hasMatch) {
        console.log(`⚠️ Quick semantic check failed: "${classifiedIntentId}" doesn't match keywords in "${userMessage}"`);
    }

    return hasMatch;
}
