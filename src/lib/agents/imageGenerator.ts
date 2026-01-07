import { OutcomeContext } from '@/types/session';
import { getVertexAccessToken, getVertexCredentials } from '../vertexAuth';

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
    const vertexCreds = getVertexCredentials();
    const hfToken = process.env.HUGGING_FACE_ACCESS_TOKEN;
    const hfModel = process.env.HUGGING_FACE_MODEL || 'black-forest-labs/FLUX.1-schnell';

    console.log('DEBUG: Env check - HF Token:', hfToken ? 'Present' : 'Missing', 'API Key:', apiKey ? 'Present' : 'Missing');

    // Strategy 1: Hugging Face (Priority if configured)
    if (hfToken) {
        try {
            console.log(`🚀 Attempting image generation via Hugging Face (${hfModel})...`);

            const images = await Promise.all(
                variants.map(async (variant) => {
                    const prompt = `${basePrompt}, ${variant.style}, professional photography, high quality, sharp focus, no text overlays, no brand logos`;

                    const response = await fetch(
                        `https://router.huggingface.co/hf-inference/models/${hfModel}`,
                        {
                            headers: {
                                Authorization: `Bearer ${hfToken}`,
                                "Content-Type": "application/json",
                            },
                            method: "POST",
                            body: JSON.stringify({
                                inputs: prompt,
                                parameters: {
                                    width: 512, // Standard square for FLUX/SD
                                    height: 512
                                }
                            }),
                        }
                    );

                    if (!response.ok) {
                        const errorText = await response.text();
                        if (response.status === 503) {
                            throw new Error('Hugging Face model loading/busy (503)');
                        }
                        throw new Error(`Hugging Face error ${response.status}: ${errorText}`);
                    }

                    // Hugging Face inference API returns a Blob (image) usually, or 
                    // sometimes JSON depending on the model pipeline. 
                    // For FLUX/SD image-to-text, it returns the raw image blob.
                    const imageBlob = await response.blob();
                    const arrayBuffer = await imageBlob.arrayBuffer();
                    const base64 = Buffer.from(arrayBuffer).toString('base64');

                    return {
                        url: `data:image/jpeg;base64,${base64}`,
                        variant_id: variant.id,
                        caption: `${variant.description}: ${outcomeContext.use_case || outcomeContext.desired_outcome || 'your goal'}`,
                        interpretation: `${outcomeContext.desired_outcome || 'Outcome visualization'}`
                    };
                })
            );

            console.log('✅ Generated REAL images via Hugging Face');
            return images;

        } catch (error) {
            console.error('Hugging Face generation failed:', error);
            console.warn('Falling back to Vertex / Mocks');
            // Fall through to next strategy
        }
    }

    // Strategy 2: Vertex AI (Priority if configured)
    if (vertexCreds) {
        try {
            console.log('🚀 Attempting image generation via Vertex AI...');
            const accessToken = await getVertexAccessToken();

            const images = await Promise.all(
                variants.map(async (variant) => {
                    const prompt = `${basePrompt}, ${variant.style}, professional photography, high quality, sharp focus, no text overlays, no brand logos`;

                    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${vertexCreds.projectId}/locations/us-central1/publishers/google/models/imagen-3.0-generate-001:predict`;

                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json; charset=utf-8'
                        },
                        body: JSON.stringify({
                            instances: [{ prompt: prompt }],
                            parameters: {
                                sampleCount: 1,
                                aspectRatio: "1:1"
                            }
                        })
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        // Handle Quota Error gracefully
                        if (response.status === 429) {
                            console.warn('⚠️ Vertex AI Quota Exceeded (429). Falling back to mocks.');
                            throw new Error(`QUOTA_EXCEEDED`);
                        }
                        throw new Error(`Vertex AI error ${response.status}: ${errorText}`);
                    }

                    const data = await response.json();

                    // Handle Vertex AI response format
                    // { predictions: [ { bytesBase64Encoded: "..." } ] }
                    const imageBase64 = data.predictions?.[0]?.bytesBase64Encoded; // Imagen 2/3 format on Vertex

                    if (!imageBase64) {
                        console.error('Vertex AI response missing image data:', JSON.stringify(data).substring(0, 200));
                        throw new Error('No image data in Vertex AI response');
                    }

                    return {
                        url: `data:image/png;base64,${imageBase64}`,
                        variant_id: variant.id,
                        caption: `${variant.description}: ${outcomeContext.use_case || outcomeContext.desired_outcome || 'your goal'}`,
                        interpretation: `${outcomeContext.desired_outcome || 'Outcome visualization'}`
                    };
                })
            );

            console.log('✅ Generated REAL images via Vertex AI');
            return images;

        } catch (error) {
            console.error('Vertex AI generation failed:', error);
            console.warn('Falling back to Generative Language API / Mocks');
            // Fall through to next strategy
        }
    }

    if (!apiKey && !vertexCreds && !hfToken) {
        console.warn('No API keys configured - using mock images');
        return generateMockImages(outcomeContext, variants);
    }

    // Strategy 3: Generative Language API (Fallback)
    try {
        const images = await Promise.all(
            variants.map(async (variant) => {
                const prompt = `${basePrompt}, ${variant.style}, professional photography, high quality, sharp focus, no text overlays, no brand logos`;

                // Try Imagen 3 first, then fallback to alternative endpoints
                const endpoints = [
                    // Original Imagen 3 endpoint
                    {
                        url: `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateImages?key=${apiKey}`,
                        body: {
                            prompt: prompt,
                            number_of_images: 1,
                            aspect_ratio: '1:1',
                            safety_filter_level: 'block_some',
                            person_generation: 'allow_adult'
                        }
                    },
                    // Try alternative model name
                    {
                        url: `https://generativelanguage.googleapis.com/v1beta/models/imagegeneration-002:predict?key=${apiKey}`,
                        body: {
                            instances: [{ prompt: prompt }],
                            parameters: {
                                sampleCount: 1,
                                aspectRatio: '1:1'
                            }
                        }
                    }
                ];

                let lastError: Error | null = null;

                for (const endpoint of endpoints) {
                    try {
                        const response = await fetch(endpoint.url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(endpoint.body)
                        });

                        if (!response.ok) {
                            // Silent fail to try next endpoint
                            lastError = new Error(`API error: ${response.status}`);
                            continue;
                        }

                        const data = await response.json();

                        const imageBase64 = data.generatedImages?.[0]?.imageBytes ||
                            data.predictions?.[0]?.bytesBase64Encoded ||
                            data.images?.[0]?.data;

                        if (!imageBase64) {
                            lastError = new Error('No image generated');
                            continue;
                        }

                        // Success!
                        return {
                            url: `data:image/png;base64,${imageBase64}`,
                            variant_id: variant.id,
                            caption: `${variant.description}: ${outcomeContext.use_case || outcomeContext.desired_outcome || 'your goal'}`,
                            interpretation: `${outcomeContext.desired_outcome || 'Outcome visualization'}`
                        };

                    } catch (error) {
                        lastError = error as Error;
                        continue;
                    }
                }

                // All endpoints failed - throw last error
                throw lastError || new Error('All image generation endpoints failed');
            })
        );

        console.log('✅ Generated real Imagen images via GenAI API');
        return images;

    } catch (error) {
        // All APIs failed
        console.warn('All image generation APIs failed, using mock images');
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
