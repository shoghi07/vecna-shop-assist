import { OutcomeContext } from '@/types/session';

export interface GeneratedImage {
    url: string;
    variant_id: 'a' | 'b' | 'c';
    caption: string;
    interpretation: string;
}

/**
 * Generate 3 visual variants of user's desired outcome using Gemini Imagen
 * Variant A: Realistic product shot
 * Variant B: Lifestyle/context view  
 * Variant C: Feature highlight
 */
export async function generateOutcomeImages(
    outcomeContext: OutcomeContext
): Promise<GeneratedImage[]> {

    if (!outcomeContext.desired_outcome) {
        throw new Error('No desired outcome to visualize');
    }

    const basePrompt = buildPromptFromOutcome(outcomeContext);

    const variants = [
        {
            id: 'a' as const,
            style: 'realistic product photography shot on white background',
            description: 'Product focus'
        },
        {
            id: 'b' as const,
            style: 'lifestyle photography showing product being used in real context',
            description: 'In use'
        },
        {
            id: 'c' as const,
            style: 'macro detail photography highlighting key features and technology',
            description: 'Feature detail'
        }
    ];

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('NEXT_PUBLIC_GEMINI_API_KEY not configured - using mock images');
        return generateMockImages(outcomeContext, variants);
    }

    // Try real Imagen API first
    try {
        const images = await Promise.all(
            variants.map(async (variant) => {
                const prompt = `${basePrompt}, ${variant.style}, professional photography, high quality, sharp focus, no text overlays, no brand logos`;

                // Call Gemini Imagen 3 API
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateImages?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            prompt: prompt,
                            number_of_images: 1,
                            aspect_ratio: '1:1',
                            safety_filter_level: 'block_some',
                            person_generation: 'allow_adult'
                        })
                    }
                );

                if (!response.ok) {
                    const errorBody = await response.text();
                    console.error(`Imagen API error ${response.status}:`, errorBody);
                    throw new Error(`Imagen API error: ${response.status}`);
                }

                const data = await response.json();
                // console.log('Imagen API response:', JSON.stringify(data).substring(0, 200));

                // Gemini Imagen 3 returns generated images in this format
                const imageBase64 = data.generatedImages?.[0]?.imageBytes;

                if (!imageBase64) {
                    // console.error('No imageBytes in response. Full response:', JSON.stringify(data));
                    throw new Error('No image generated');
                }

                // Convert to data URL for frontend display
                const imageUrl = `data:image/png;base64,${imageBase64}`;

                return {
                    url: imageUrl,
                    variant_id: variant.id,
                    caption: `${variant.description}: ${outcomeContext.use_case || 'your goal'}`,
                    interpretation: `${variant.style} for ${outcomeContext.desired_outcome}`
                };
            })
        );

        console.log('✅ Generated real Imagen images');
        return images;

    } catch (error) {
        // Imagen API completely failed
        console.warn('Imagen API unavailable, using mock images');
        return generateMockImages(outcomeContext, variants);
    }
}

/**
 * Generate mock placeholder images for testing
 */
function generateMockImages(
    outcomeContext: OutcomeContext,
    variants: Array<{ id: 'a' | 'b' | 'c'; description: string; style: string }>
): GeneratedImage[] {
    console.log('🎨 Generating mock placeholder images');
    return variants.map(variant => {
        //Generate simple colored placeholders
        const bgColors = { a: 'FF6B6B', b: '4ECDC4', c: 'FFE66D' }; // Red, Teal, Yellow
        const text = encodeURIComponent(variant.description);

        return {
            url: `https://via.placeholder.com/400x400/${bgColors[variant.id]}/000000?text=${text}`,
            variant_id: variant.id,
            caption: `${variant.description}: ${outcomeContext.use_case || outcomeContext.desired_outcome || 'your goal'}`,
            interpretation: `${outcomeContext.desired_outcome || 'Outcome visualization'}`
        };
    });
}

/**
 * Build image generation prompt from outcome context
 */
function buildPromptFromOutcome(context: OutcomeContext): string {
    let prompt = context.desired_outcome || '';

    // Add use case for context
    if (context.use_case) {
        prompt = `${context.use_case}: ${prompt}`;
    }

    // Add visual preferences
    if (context.visual_preferences?.style) {
        prompt += `, ${context.visual_preferences.style} aesthetic`;
    }

    if (context.visual_preferences?.color) {
        prompt += `, ${context.visual_preferences.color} color palette`;
    }

    // Add feature constraints as visual elements
    if (context.constraints.features && context.constraints.features.length > 0) {
        const features = context.constraints.features.slice(0, 3).join(', ');
        prompt += `, showing ${features}`;
    }

    return prompt;
}

/**
 * Regenerate images based on user feedback
 */
export async function regenerateWithFeedback(
    outcomeContext: OutcomeContext,
    feedback: string
): Promise<GeneratedImage[]> {

    // Parse feedback to adjust prompt
    const adjustedContext = { ...outcomeContext };

    // Simple feedback parsing
    const lowerFeedback = feedback.toLowerCase();

    if (lowerFeedback.includes('light') || lowerFeedback.includes('bright') || lowerFeedback.includes('dark')) {
        if (!adjustedContext.visual_preferences) {
            adjustedContext.visual_preferences = {};
        }

        if (lowerFeedback.includes('dark') || lowerFeedback.includes('moody')) {
            adjustedContext.visual_preferences.style = 'moody, dark, dramatic lighting';
        } else if (lowerFeedback.includes('bright') || lowerFeedback.includes('light')) {
            adjustedContext.visual_preferences.style = 'bright, well-lit, airy';
        }
    }

    if (lowerFeedback.includes('angle') || lowerFeedback.includes('perspective')) {
        if (adjustedContext.desired_outcome) {
            adjustedContext.desired_outcome += ', different camera angle and perspective';
        }
    }

    if (lowerFeedback.includes('subject') || lowerFeedback.includes('focus')) {
        if (adjustedContext.desired_outcome) {
            adjustedContext.desired_outcome += ', clear focus on main subject';
        }
    }

    // Regenerate with adjusted context
    return generateOutcomeImages(adjustedContext);
}
