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
    const productIds = (scores as any).map((s: any) => s.product_id);

    const { data: products, error: prodErr } = await supabase
        .from('products_raw')
        .select('*')
        .in('id', productIds);
    if (prodErr) throw new Error('Failed to fetch product details');

    // Merge
    return productIds.map((id: string) => {
        const prod = (products as any).find((p: any) => p.id === id);
        const score = (scores as any).find((s: any) => s.product_id === id);

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
            fit_score: score?.fit_score,
            score_breakdown: score?.score_breakdown,
            source: 'intent' as const
        } as EnrichedProduct;
    });
}
