/**
 * No-Product Handler
 * 
 * Handles scenarios gracefully when no products match user intent.
 * Per Aarav guidelines: never leave user without guidance.
 */

import { supabase } from '@/lib/supabase';
import type { Persona } from './conversationState';

export interface NoProductResponse {
    has_alternatives: boolean;
    message: string;
    alternatives?: Array<{
        product_id: string;
        title: string;
        price: string;
        image_url: string;
        variant_id: string;
        relevance: string; // "Similar use case" / "Helpful accessory"
    }>;
    exit_options: string[];
}

/**
 * Detect if user asked for a specific product by name
 */
export function detectSpecificProductRequest(message: string): string | null {
    // Common camera product patterns
    const productPatterns = [
        /canon\s+(eos\s+)?r\d+/i,
        /sony\s+a\d+/i,
        /nikon\s+z\d+/i,
        /fuji(film)?\s+x-?\w+/i,
        /gopro\s+hero\s*\d*/i,
        /dji\s+\w+/i
    ];

    for (const pattern of productPatterns) {
        const match = message.match(pattern);
        if (match) {
            return match[0];
        }
    }
    return null;
}

/**
 * Generate polite decline message based on scenario
 */
export function generatePoliteDecline(
    scenario: 'specific_product' | 'intent_mismatch' | 'out_of_stock',
    productName?: string,
    persona?: Persona | null
): string {
    switch (scenario) {
        case 'specific_product':
            return `I understand you're looking for ${productName || 'that specific product'}. We don't currently have it in our catalog, but I can suggest some excellent alternatives that might work for your needs.`;

        case 'intent_mismatch':
            if (persona === 'anxiety_prone') {
                return "I want to be upfront with you - I don't have products that directly match what you're looking for. But let me show you some accessories that might help.";
            }
            return "I don't currently have products that directly match this need. However, these accessories might be helpful for your situation.";

        case 'out_of_stock':
            return "That product is currently out of stock. Would you like me to suggest similar alternatives, or shall I notify you when it's back?";

        default:
            return "I couldn't find exact matches, but let me show you what we have that might help.";
    }
}

/**
 * Get alternatives based on intent
 */
export async function getAlternatives(
    intentId: string,
    limit: number = 3
): Promise<NoProductResponse['alternatives']> {
    try {
        // Find any products with reasonable fit scores
        const { data, error } = await supabase
            .from('intent_product_scores')
            .select(`
                product_id,
                fit_score,
                products (
                    title,
                    price,
                    image_url,
                    variants (variant_id)
                )
            `)
            .order('fit_score', { ascending: false })
            .limit(limit);

        if (error || !data) {
            console.warn('Failed to fetch alternatives:', error);
            return [];
        }

        return data.map((item: any) => ({
            product_id: item.product_id,
            title: item.products?.title || 'Product',
            price: item.products?.price || '0',
            image_url: item.products?.image_url || '',
            variant_id: item.products?.variants?.[0]?.variant_id || '',
            relevance: 'Popular choice'
        }));
    } catch (error) {
        console.error('Error fetching alternatives:', error);
        return [];
    }
}

/**
 * Get accessories as fallback
 */
export async function getAccessoriesAsFallback(
    limit: number = 2
): Promise<NoProductResponse['alternatives']> {
    try {
        const { data, error } = await supabase
            .from('intent_product_scores')
            .select(`
                product_id,
                products (
                    title,
                    price,
                    image_url,
                    variants (variant_id)
                )
            `)
            .eq('intent_id', 'accessory_only')
            .order('fit_score', { ascending: false })
            .limit(limit);

        if (error || !data) {
            return [];
        }

        return data.map((item: any) => ({
            product_id: item.product_id,
            title: item.products?.title || 'Accessory',
            price: item.products?.price || '0',
            image_url: item.products?.image_url || '',
            variant_id: item.products?.variants?.[0]?.variant_id || '',
            relevance: 'Helpful accessory'
        }));
    } catch (error) {
        console.error('Error fetching accessories:', error);
        return [];
    }
}

/**
 * Generate exit options for user
 */
export function generateExitOptions(): string[] {
    return [
        "Browse our popular products",
        "Talk to a specialist",
        "Start a new search"
    ];
}

/**
 * Handle no-product scenario comprehensively
 */
export async function handleNoProductScenario(
    intentId: string,
    userMessage: string,
    persona: Persona | null
): Promise<NoProductResponse> {
    // Check if user asked for specific product
    const specificProduct = detectSpecificProductRequest(userMessage);

    if (specificProduct) {
        // Specific product not found scenario
        const alternatives = await getAlternatives(intentId, 3) || [];
        return {
            has_alternatives: alternatives.length > 0,
            message: generatePoliteDecline('specific_product', specificProduct, persona),
            alternatives: alternatives.length > 0 ? alternatives : undefined,
            exit_options: generateExitOptions()
        };
    }

    // Intent mismatch scenario - offer accessories
    const accessories = await getAccessoriesAsFallback(2) || [];
    return {
        has_alternatives: accessories.length > 0,
        message: generatePoliteDecline('intent_mismatch', undefined, persona),
        alternatives: accessories.length > 0 ? accessories : undefined,
        exit_options: generateExitOptions()
    };
}
