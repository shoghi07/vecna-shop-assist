import { supabase } from '@/lib/supabase';
import { dynamicProductSearch, DynamicProduct } from './dynamicCapabilityMatcher';

export interface EnrichedProduct {
    id: string;
    variant_id?: string; // Added for Shopify cart integration
    title: string;
    price: string;
    image_url: string;
    highlights?: string[];
    fit_score?: number;
    score_breakdown?: any;
    source?: 'intent' | 'capability'; // Track where product came from
}

// Fetch top products for a given intent, enriched with scores.
// Falls back to dynamic capability search if intent has no products.
export async function getTopProducts(
    intentId: string,
    offset = 0,
    limit = 3,
    userMessage?: string // Optional: used for dynamic fallback
): Promise<EnrichedProduct[]> {
    console.log(`🔍 Fetching products for intent: "${intentId}", offset: ${offset}, limit: ${limit}`);

    // Step 1: Try intent-based search
    const { data: scores, error } = await supabase
        .from('product_intent_scores')
        .select('product_id, fit_score, score_breakdown')
        .eq('intent_id', intentId)
        .order('fit_score', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        console.error('❌ Error fetching product scores:', error);
        throw new Error('Failed to fetch product scores');
    }

    console.log(`📊 Found ${scores?.length || 0} product scores for intent "${intentId}"`);
    if (scores && scores.length > 0) {
        const productIdCounts = new Map<string, number>();
        (scores as any[]).forEach((s: any) => {
            productIdCounts.set(s.product_id, (productIdCounts.get(s.product_id) || 0) + 1);
        });
        const duplicates = Array.from(productIdCounts.entries()).filter(([_, count]) => count > 1);
        if (duplicates.length > 0) {
            console.log(`⚠️ Found ${duplicates.length} duplicate product_ids in scores:`, duplicates.map(([id, count]) => `${id} (${count}x)`));
        }
        console.log(`📋 Unique products in scores: ${productIdCounts.size}, Total score entries: ${scores.length}`);
    }

    // Step 2: If no products found, try DYNAMIC CAPABILITY FALLBACK
    if (!scores || scores.length === 0) {
        console.log(`🔄 No products for intent "${intentId}", trying dynamic capability search...`);

        // Log available intents for debugging
        const { data: availableIntents } = await supabase
            .from('product_intent_scores')
            .select('intent_id')
            .limit(50);
        const uniqueIntents = [...new Set((availableIntents || []).map((i: any) => i.intent_id))];
        console.log(`📋 Available intents in DB:`, uniqueIntents);

        // Try dynamic search
        const dynamicProducts = await dynamicProductSearch(
            intentId.replace(/_/g, ' '), // Convert intent_id to readable description
            userMessage || intentId,
            limit
        );

        if (dynamicProducts.length > 0) {
            console.log(`✅ Dynamic fallback found ${dynamicProducts.length} products`);
            return dynamicProducts.map((p: DynamicProduct) => ({
                id: p.product_id,
                variant_id: p.variant_id,
                title: p.title,
                price: p.price,
                image_url: p.image_url,
                highlights: [],
                fit_score: p.computed_score,
                source: 'capability' as const
            }));
        }

        console.log(`⚠️ Dynamic fallback also found no products`);
        return [];
    }

    // Step 3: Intent-based products found - fetch details
    // Deduplicate product_ids while preserving order and highest score
    const uniqueScores = new Map<string, { product_id: string; fit_score: number; score_breakdown: any }>();
    for (const score of scores as any[]) {
        const existing = uniqueScores.get(score.product_id);
        // Keep the entry with the highest fit_score if duplicate
        if (!existing || score.fit_score > existing.fit_score) {
            uniqueScores.set(score.product_id, {
                product_id: score.product_id,
                fit_score: score.fit_score,
                score_breakdown: score.score_breakdown
            });
        }
    }
    
    // Convert to array preserving order (highest scores first)
    const uniqueScoreArray = Array.from(uniqueScores.values())
        .sort((a, b) => b.fit_score - a.fit_score)
        .slice(0, limit); // Ensure we don't exceed limit after deduplication
    
    const productIds = uniqueScoreArray.map(s => s.product_id);
    
    console.log(`📦 Deduplicated to ${productIds.length} unique products from ${scores.length} score entries`);

    const { data: products, error: prodErr } = await supabase
        .from('products_raw')
        .select('*')
        .in('id', productIds);
    if (prodErr) throw new Error('Failed to fetch product details');

    // Create a map for O(1) lookup
    const productsMap = new Map((products as any[] || []).map((p: any) => [p.id, p]));

    // Merge in the correct order (by fit_score)
    return uniqueScoreArray
        .map((score) => {
            const prod = productsMap.get(score.product_id);
            
            // Skip if product not found
            if (!prod) {
                console.warn(`⚠️ Product ${score.product_id} not found in products_raw`);
                return null;
            }

            // Robust extraction for Shopify-like schema
            const price = prod.variants?.[0]?.price || "N/A";
            const image_url = prod.images?.[0]?.src || "";
            const variant_id = prod.variants?.[0]?.id?.toString() || prod.variants?.[0]?.variant_id?.toString();
            const highlights: string[] = [];

            return {
                id: prod.id,
                variant_id: variant_id,
                title: prod.title,
                price: price,
                image_url: image_url,
                highlights: highlights,
                fit_score: score.fit_score,
                score_breakdown: score.score_breakdown,
                source: 'intent' as const
            } as EnrichedProduct;
        })
        .filter((p): p is EnrichedProduct => p !== null); // Remove null entries
}
