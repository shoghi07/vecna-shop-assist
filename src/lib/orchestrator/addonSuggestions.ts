/**
 * Add-on Suggestions Module
 * 
 * Suggests relevant accessories after user adds a product to cart.
 * Aligned with Aarav's helpful, non-pushy approach.
 */

import { supabase } from '@/lib/supabase';

export interface AddOn {
    product_id: string;
    title: string;
    price: string;
    image_url: string;
    variant_id: string;
    reason: string; // "Completes your setup" / "Protects your investment"
}

/**
 * Get relevant add-ons for a product
 * Currently uses simple logic: find accessories from the same intent
 */
export async function getRelevantAddons(
    productId: string,
    intentId: string,
    limit: number = 2
): Promise<AddOn[]> {
    try {
        // For now, find accessories based on the 'accessory_only' intent
        // In future, could use product compatibility table
        const { data: accessoryScores, error } = await supabase
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
            .neq('product_id', productId) // Don't suggest the same product
            .order('fit_score', { ascending: false })
            .limit(limit);

        if (error || !accessoryScores) {
            console.warn('Failed to fetch add-ons:', error);
            return [];
        }

        return accessoryScores.map((score: any) => ({
            product_id: score.product_id,
            title: score.products?.title || 'Accessory',
            price: score.products?.price || '0',
            image_url: score.products?.image_url || '',
            variant_id: score.products?.variants?.[0]?.variant_id || '',
            reason: 'Completes your setup'
        }));
    } catch (error) {
        console.error('Error fetching add-ons:', error);
        return [];
    }
}

/**
 * Generate add-on suggestion message
 */
export function generateAddonMessage(addons: AddOn[]): string {
    if (addons.length === 0) return '';
    if (addons.length === 1) {
        return `To complete your setup, you might also need a ${addons[0].title}.`;
    }
    return `To complete your setup, you might also need: ${addons.map(a => a.title).join(' or ')}.`;
}

/**
 * Payment mode options
 */
export const PAYMENT_MODES = [
    { id: 'cod', label: 'Cash on Delivery', description: 'Pay when you receive' }
];

/**
 * Generate payment mode question
 */
export function generatePaymentModeQuestion(): string {
    return "Great choice! Before we finalize, how would you like to pay? We currently accept Cash on Delivery.";
}
