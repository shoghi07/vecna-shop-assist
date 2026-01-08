/**
 * Dynamic Capability Matcher
 * 
 * When a classified intent doesn't match pre-defined intents,
 * use LLM to infer relevant capability keys and query products directly.
 */

import { supabase } from '@/lib/supabase';

// All available capability keys from the database
// Cache for capability keys
let cachedCapabilityKeys: string[] | null = null;

/**
 * Fetch capability keys from the database (with simple caching)
 */
export async function getCapabilityKeys(): Promise<string[]> {
    if (cachedCapabilityKeys && cachedCapabilityKeys.length > 0) {
        return cachedCapabilityKeys;
    }

    try {
        const { data, error } = await supabase
            .from('capability_dimensions')
            .select('capability_key'); // Column name is 'capability_key' in the database

        if (error) throw error;

        if (data) {
            cachedCapabilityKeys = data.map((d: any) => d.capability_key).filter((k: string) => !!k);
        }

        return cachedCapabilityKeys || [];
    } catch (err) {
        console.error("Failed to fetch capability keys:", err);
        // Fallback to essential keys if DB fails
        return ['low_light_performance', 'video_quality', 'autofocus_reliability', 'battery_life', 'portability'];
    }
}

export interface CapabilityWeight {
    capability_key: string;
    weight: number; // 0.0 to 1.0
}

export interface DynamicProduct {
    product_id: string;
    title: string;
    price: string;
    image_url: string;
    variant_id: string;
    computed_score: number;
}

/**
 * Use LLM to infer relevant capability keys based on buyer's direct inputs
 * Focus ONLY on what the buyer said, not on product descriptions or intent interpretations
 */
export async function inferCapabilitiesForIntent(
    intentDescription: string,
    userMessage: string
): Promise<CapabilityWeight[]> {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const availableKeys = await getCapabilityKeys();

    const prompt = `You are analyzing a buyer's direct requirements. Extract camera capabilities ONLY from what the buyer explicitly said.

CRITICAL: Do NOT search product descriptions. Do NOT infer from intent labels. Focus ONLY on the buyer's actual words.

Buyer's Message: "${userMessage}"
${intentDescription ? `Context: "${intentDescription}"` : ''}

Available capability keys:
${availableKeys.map(k => `- ${k}`).join('\n')}

TASK:
1. Read the buyer's message carefully
2. Identify which capabilities the buyer is directly asking for or mentioning
3. Extract explicit requirements (e.g., "low light" → low_light_performance, "portable" → portability, "fast autofocus" → autofocus_reliability)
4. If buyer mentions specific use cases, map them to capabilities (e.g., "wedding" → low_light + autofocus, "travel" → portability + battery_life)
5. Do NOT guess or infer beyond what the buyer said
6. Pick 3-5 most relevant capabilities that match the buyer's explicit requirements

For each selected capability, assign a weight (0.5 to 1.0) based on how directly the buyer mentioned it:
- 1.0 = Buyer explicitly mentioned this requirement
- 0.8 = Strongly implied from buyer's use case
- 0.6 = Moderately relevant based on buyer's context
- 0.5 = Weakly relevant

Respond with ONLY a JSON array:
[
  {"capability_key": "low_light_performance", "weight": 1.0},
  {"capability_key": "autofocus_reliability", "weight": 0.8}
]`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
                })
            }
        );

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

        // Extract JSON array
        const jsonMatch = text.match(/\[[\s\S]*?\]/);
        if (!jsonMatch) {
            console.warn('❌ Failed to parse capability inference, using defaults');
            return getDefaultCapabilities(intentDescription);
        }

        const capabilities = JSON.parse(jsonMatch[0]) as CapabilityWeight[];
        console.log(`🎯 Capabilities extracted from buyer's message "${userMessage}":`, capabilities);
        return capabilities;

    } catch (error) {
        console.error('Capability inference failed:', error);
        return getDefaultCapabilities(intentDescription);
    }
}

/**
 * Default capabilities based on common keywords
 */
function getDefaultCapabilities(intent: string): CapabilityWeight[] {
    const lower = intent.toLowerCase();

    if (lower.includes('wedding') || lower.includes('event') || lower.includes('party')) {
        return [
            { capability_key: 'low_light', weight: 1.0 },
            { capability_key: 'autofocus_reliability', weight: 0.9 },
            { capability_key: 'video_quality', weight: 0.8 },
            { capability_key: 'audio_quality', weight: 0.7 }
        ];
    }

    if (lower.includes('travel') || lower.includes('vlog')) {
        return [
            { capability_key: 'portability', weight: 1.0 },
            { capability_key: 'video_stability', weight: 0.9 },
            { capability_key: 'battery_life', weight: 0.8 },
            { capability_key: 'ease_of_use', weight: 0.7 }
        ];
    }

    if (lower.includes('sport') || lower.includes('action')) {
        return [
            { capability_key: 'subject_tracking', weight: 1.0 },
            { capability_key: 'burst_performance', weight: 0.9 },
            { capability_key: 'durability', weight: 0.8 },
            { capability_key: 'frame_rate', weight: 0.7 }
        ];
    }

    // Generic fallback
    return [
        { capability_key: 'video_quality', weight: 1.0 },
        { capability_key: 'ease_of_use', weight: 0.8 },
        { capability_key: 'portability', weight: 0.6 }
    ];
}

/**
 * Query products by capability scores
 */
export async function getProductsByCapabilities(
    capabilities: CapabilityWeight[],
    limit: number = 3
): Promise<DynamicProduct[]> {
    console.log(`🔍 Dynamic search: Finding products by ${capabilities.length} capabilities`);

    // Get all capability scores for selected keys
    const capKeys = capabilities.map(c => c.capability_key);

    const { data: scores, error } = await supabase
        .from('product_capabilities')
        .select('product_id, capability_key, value')
        .in('capability_key', capKeys);

    if (error || !scores) {
        console.error('❌ Failed to fetch capability scores:', error);
        return [];
    }

    // Group by product and compute weighted score
    const productScores: Record<string, number> = {};
    const productCapCounts: Record<string, number> = {};

    for (const score of scores) {
        const weight = capabilities.find(c => c.capability_key === score.capability_key)?.weight || 0.5;
        const weightedValue = (score.value || 0) * weight;

        productScores[score.product_id] = (productScores[score.product_id] || 0) + weightedValue;
        productCapCounts[score.product_id] = (productCapCounts[score.product_id] || 0) + 1;
    }

    // Normalize and sort
    const rankedProducts = Object.entries(productScores)
        .map(([product_id, score]) => ({
            product_id,
            computed_score: score / (productCapCounts[product_id] || 1) // Average weighted score
        }))
        .sort((a, b) => b.computed_score - a.computed_score)
        .slice(0, limit);

    console.log(`📊 Top ${rankedProducts.length} products by capability match:`, rankedProducts);

    if (rankedProducts.length === 0) return [];

    // Fetch product details
    const productIds = rankedProducts.map(p => p.product_id);
    const { data: products, error: prodErr } = await supabase
        .from('products_raw')
        .select('*')
        .in('id', productIds);

    if (prodErr || !products) {
        console.error('❌ Failed to fetch product details:', prodErr);
        return [];
    }

    // Merge with scores
    return rankedProducts.map(ranked => {
        const prod = products.find((p: any) => p.id === ranked.product_id);
        if (!prod) return null;

        return {
            product_id: prod.id,
            title: prod.title,
            price: prod.variants?.[0]?.price || 'N/A',
            image_url: prod.images?.[0]?.src || '',
            variant_id: prod.variants?.[0]?.id?.toString() || '',
            computed_score: ranked.computed_score
        } as DynamicProduct;
    }).filter(Boolean) as DynamicProduct[];
}

/**
 * Main fallback function: Try capability-based search when intent fails
 * Focuses on buyer's direct inputs, not product descriptions
 */
export async function dynamicProductSearch(
    intentDescription: string,
    userMessage: string,
    limit: number = 3
): Promise<DynamicProduct[]> {
    console.log(`🔄 Dynamic capability search: Analyzing buyer's requirements from their message`);
    console.log(`   Buyer said: "${userMessage}"`);
    console.log(`   Context: "${intentDescription}"`);

    // Step 1: Infer relevant capabilities from buyer's message (primary) and context (secondary)
    // Prioritize userMessage - it contains the buyer's actual requirements
    const capabilities = await inferCapabilitiesForIntent(intentDescription, userMessage);

    if (capabilities.length === 0) {
        console.warn('⚠️ No capabilities extracted from buyer inputs, cannot search');
        return [];
    }

    console.log(`🎯 Capabilities extracted from buyer's message:`, capabilities.map(c => `${c.capability_key} (${c.weight})`).join(', '));

    // Step 2: Query products by capabilities (matches against product_capabilities table, NOT descriptions)
    const products = await getProductsByCapabilities(capabilities, limit);

    console.log(`✅ Found ${products.length} products matching buyer's capability requirements`);
    return products;
}
