/**
 * Tradeoff Generator
 * 
 * Generates educational tradeoff explanations for products,
 * helping users understand why_fits, tradeoffs, and when_to_choose.
 * Aligned with Aarav's role as educator-first, seller-second.
 */

import type { Persona } from './conversationState';

export interface ProductWithTradeoffs {
    product_id: string;
    title: string;
    price: string;
    image_url: string;
    variant_id: string;
    why_fits: string;         // "Great for low-light events"
    tradeoffs: string;        // "Heavier than compact options, but stabilization is superior"
    when_to_choose: string;   // "Choose this if image quality > portability"
}

/**
 * Decision frames per persona (from Aarav guidelines)
 */
const DECISION_FRAMES: Record<Exclude<Persona, null>, string> = {
    occasion_driven: "This will reliably capture your special moment",
    aspiring_hobbyist: "This setup grows with your skills",
    social_proof: "People like you often choose this",
    budget_constrained: "Best value for your budget without compromises",
    delegator: "This is the simplest good choice",
    anxiety_prone: "This is a safe, reversible decision"
};

/**
 * Get decision frame text for persona
 */
export function getDecisionFrame(persona: Persona | null, intentId: string): string {
    if (!persona) {
        return "Here's what fits your needs";
    }
    return DECISION_FRAMES[persona] || "Here's what fits your needs";
}

/**
 * Generate tradeoff prompts for LLM
 */
export function generateTradeoffPrompt(
    products: any[],
    intentId: string,
    persona: Persona | null,
    userContext: string
): string {
    const personaContext = persona
        ? `The user is a ${persona.replace('_', ' ')} buyer.`
        : 'Unknown buyer type.';

    return `You are Aarav, a trusted sales advisor. Generate educational tradeoff explanations for these products.

User's intent: ${intentId}
${personaContext}
User context: ${userContext}

Products:
${products.map((p, i) => `${i + 1}. ${p.title} - ₹${p.price}`).join('\n')}

For EACH product, provide:
1. why_fits: One sentence explaining why this product fits their specific needs (reference their intent/context)
2. tradeoffs: One honest sentence about what they gain AND what they trade off
3. when_to_choose: One sentence for when this is the best choice

Guidelines:
- Be honest and educational, not salesy
- Mention real tradeoffs (weight, price, features)
- Reference user's context (event type, budget, skill level)
- Normalize uncertainty: "These two are close..." is okay
- Keep each field to 1 sentence max

Return JSON array:
[
  {
    "product_index": 0,
    "why_fits": "...",
    "tradeoffs": "...",
    "when_to_choose": "..."
  }
]`;
}

/**
 * Parse tradeoff response from LLM
 */
export function parseTradeoffResponse(
    llmResponse: string,
    products: any[]
): ProductWithTradeoffs[] {
    try {
        // Extract JSON from response
        const jsonMatch = llmResponse.match(/\[[\s\S]*?\]/);
        if (!jsonMatch) {
            console.warn('No JSON array found in tradeoff response');
            return products.map(p => ({
                ...p,
                why_fits: p.explanation || 'Great fit for your needs',
                tradeoffs: 'Good balance of features and value',
                when_to_choose: 'Choose this for overall quality'
            }));
        }

        const tradeoffs = JSON.parse(jsonMatch[0]);

        return products.map((product, index) => {
            const tradeoff = tradeoffs.find((t: any) => t.product_index === index) || {};
            return {
                ...product,
                why_fits: tradeoff.why_fits || product.explanation || 'Great fit for your needs',
                tradeoffs: tradeoff.tradeoffs || 'Good balance of features and value',
                when_to_choose: tradeoff.when_to_choose || 'Choose this for overall quality'
            };
        });
    } catch (error) {
        console.error('Failed to parse tradeoff response:', error);
        return products.map(p => ({
            ...p,
            why_fits: p.explanation || 'Great fit for your needs',
            tradeoffs: 'Good balance of features and value',
            when_to_choose: 'Choose this for overall quality'
        }));
    }
}

/**
 * Generate sub-optimal choice correction message
 */
export function generateCorrectionMessage(
    selectedProduct: any,
    betterProduct: any,
    reason: string
): string {
    return `This will work, but for your usage, ${betterProduct.title} gives you noticeably better results for a ${reason}.`;
}
