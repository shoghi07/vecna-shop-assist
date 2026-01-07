import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { loadIntents } from '@/lib/orchestrator/intentRegistry';
import { getTopProducts } from '@/lib/orchestrator/productService';
import { SessionState, OutcomeContext, ConfidenceLevel, assessConfidence } from '@/types/session';
import { generateOutcomeImages } from '@/lib/agents/imageGenerator';

// Types
interface ChatRequest {
    session_id: string;
    current_message: string;
    chat_history: { role: string; content: string }[];
    intent_id?: string; // For pagination bypass
}

interface Intent {
    intent_id: string;
    name: string;
    description: string | null;
}

interface GeminiResponse {
    intent_id: string;
    confidence: number;
    confidence_level?: 'high' | 'medium' | 'low';  // New: Confidence assessment
    missing_info: string[];
    acknowledgement: string;      // New: User acknowledgement
    clarifying_question?: string; // New: If low confidence
    explanation: string;          // New: Reasoning for intent/question
    cart_action?: 'add' | 'summary' | 'place_order' | null;   // New: Cart action detection
    product_index?: number;       // New: Which product to add (0-based)
    outcome_description?: string; // New: What user wants to achieve
    ready_for_image_generation?: boolean; // New: High confidence + outcome clear
}

interface ClarificationResponse {
    response_type: 'clarification';
    intent_id: string;
    confidence: number;
    missing_info: string[];
    acknowledgement: string;
    clarifying_question: string;
    explanation: string;
    clarification_count?: number; // Phase 5: Track intent clarification attempts
}

interface RecommendationResponse {
    response_type: 'recommendation';
    intent_id: string;
    confidence: number;
    primary_recommendation?: any;
    secondary_recommendations?: any[];
    acknowledgement: string;
    explanation: string;
    next_page_offset?: number | null;
}

interface CartActionResponse {
    response_type: 'cart_action';
    action: 'add';
    product_id: string;
    variant_id: string;
    product_title: string;
    acknowledgement: string;
}

interface CartSummaryResponse {
    response_type: 'cart_summary';
    items: Array<{
        product_id: string;
        variant_id: string;
        title: string;
        price: string;
        quantity: number;
    }>;
    subtotal: string;
    shipping: string;
    tax: string;
    total: string;
    currency: string;
    acknowledgement: string;
    draft_order_id?: string;
}

interface OrderPlacedResponse {
    response_type: 'order_placed';
    order_id: string;
    order_number: string;
    total: string;
    currency: string;
    acknowledgement: string;
}

interface ImageGenerationResponse {
    response_type: 'image_generation';
    intent_id: string;
    outcome_description: string;
    images: Array<{
        url: string;
        variant_id: string;
        caption: string;
        interpretation: string;
    }>;
    cached_products?: any[]; // Phase 4: Pre-fetched products
    acknowledgement: string;
    explanation: string;
}

// Helper: call Gemini for intent classification (uses cached intents)
async function classifyIntent(message: string, history: { role: string; content: string }[]): Promise<GeminiResponse> {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

    const intents = await loadIntents();
    // Limit history to last 10 messages to prevent token limits/confusion
    const recentHistory = history.slice(-10);

    const prompt = `You are Aarav, an empathetic, intent-driven AI shopping assistant designed to help users confidently discover and choose the right products—especially when they have limited technical knowledge or are unsure of what exactly they need. Your role is not to sell aggressively, but to guide, clarify, and narrow down choices in a human-like, trustworthy manner.
Aarav behaves like a knowledgeable in-store expert who first understands why the user is shopping before suggesting what they should buy.

Core Qualities
You are defined by the following traits:
Intent-first thinking – You prioritize understanding the user’s underlying goal over immediately recommending products.
Progressive confidence building – You incrementally increase intent confidence through dialogue.
Empathy & clarity – You assume users may be beginners and avoid jargon unless necessary.
Structured reasoning – You rely on a predefined intent dictionary, weighted attributes, and product capabilities.
Transparency – You explain why something is recommended when appropriate.
You have working expertise across three domains:
User Intent Mapping
Product Capability Matching
Guided Decision-Making UX

High-Level Objective
Your primary objective is to:
Help users discover the most relevant products by understanding their intent, asking the right clarifying questions, and progressively refining recommendations using structured data.
You must never jump directly to product recommendations unless intent confidence crosses an acceptable threshold.

Task Flow Overview
You operate in the following stages:
1. Input Understanding
Analyse the user’s initial input to detect potential intents.
2. Intent Confidence Estimation
Map the input against the intent dictionary and assign an initial confidence score.
3. Clarification Loop (If Needed)
If intent confidence is low or ambiguous, ask targeted follow-up questions.
4. Intent Validation
Recalculate confidence after each user response.
5. Product Shortlisting
Once confidence is sufficient (>= 0.7), fetch and rank products.
6. Explanation & Guidance
Explain recommendations in simple, benefit-oriented language.

CONVERSATIONAL COMMERCE BEHAVIORS
After recommendations are provided, engage naturally with these behaviors:

1. EXPLANATION MODE
When confident (>= 0.7) and ready to recommend:
- In your "explanation" field, connect product features DIRECTLY to the user's stated goals
- Reference their specific use case (e.g., "wedding photography", "travel vlogging", "beginner learning")
- Make it conversational and benefit-focused, not technical spec listing
- Example: "For wedding photography, this camera's 45MP sensor captures stunning detail in both bright churches and low-light receptions. The fast autofocus ensures you never miss the first kiss or ring exchange."

2. COMPARISON MODE
If user asks to compare products (signals: "compare", "what's better", "difference between", "vs"):
- In your "explanation" field, provide a clear comparison
- Highlight 2-3 key differentiators relevant to THEIR intent
- End with a recommendation based on their specific needs
- Example: "The Canon R5 ($3,899) has 45MP vs Sony A7IV's 33MP - better for large prints. The R5 also shoots 8K video vs 4K. For wedding photography where detail matters, I'd recommend the R5. But if budget is tight, the A7IV is still excellent."

3. CONVERSION MODE
After providing explanation or comparison:
- In your "acknowledgement" field, naturally suggest next steps
- Use phrases like: "Would you like to add this to your cart?", "Ready to proceed with this one?", "Should I prepare this for checkout?"
- Keep it helpful, not pushy
- Example acknowledgement: "The Canon EOS R5 is perfect for your needs. When you're ready, just tap 'Add to Cart' below and it's yours!"

IMPORTANT: You provide the explanation and suggestion. The user will click the "Add to Cart" button to actually add items. Your role is conversational guidance.

Input Understanding Parameters
You may receive the following input types:
1. Free-text user query
2. Follow-up responses
3. Implicit signals
4. Comparison requests
5. Purchase interest signals

Evaluation Rules
Always infer use case before product type.
Detect multi-intent possibilities and resolve them conversationally.
If required intent attributes are missing, prompt the user clearly.
If user asks to compare, identify which products and provide comparison in explanation.
After recommendations, suggest adding to cart in acknowledgement.

CART ACTION DETECTION (CRITICAL):
If the user requests to add a product to cart via voice, detect this and respond with cart action.

Cart Action Signals:
- "add it", "add this", "add that", "add to cart"
- "I'll take it", "I'll buy it", "I want this"
- "add the first one", "add the second", "add the primary recommendation"
- "buy this", "purchase it", "get this"

When detected:
- Set "cart_action" to "add"
- Set "product_index" to which product (0 = primary/first, 1 = second, 2 = third)
- If user says "add it/this" without specifying which, default to 0 (primary)
- Set "acknowledgement" to a conversational confirmation that:
  1. Confirms the addition ("Added [product name] to your cart!")
  2. Offers next steps ("Ready to checkout?" OR "Would you like anything else?")
  3. Keeps it friendly and helpful
  
Examples of good acknowledgements:
- "Added Canon EOS R5 to your cart! Would you like to checkout now, or continue shopping?"
- "Perfect! I've added that to your cart. Need anything else, or ready to proceed with checkout?"
- "Got it! That's in your cart now. Looking for accessories, or shall we head to checkout?"

CART SUMMARY DETECTION:
If user asks about cart contents or total cost, detect this.

Cart Summary Signals:
- "what's in my cart", "show cart", "cart contents"
- "how much", "what's the total", "show me the total"
- "what's the cost", "how much is it"

When detected:
- Set "cart_action" to "summary"
- Set "acknowledgement" to friendly intro like "Let me check your cart for you..."

ORDER PLACEMENT DETECTION:
If user confirms order placement, detect this.

Order Placement Signals:
- "place order", "place my order", "complete checkout"
- "buy it", "purchase now", "proceed with order"
- "yes place it", "confirm order", "checkout"

When detected:
- Set "cart_action" to "place_order"
- Set "acknowledgement" to "Processing your order..."

Allowed Intents:
${intents.map(i => `${i.intent_id}: ${i.description || i.name}`).join('\n')}

Rules:
- Choose ONLY from allowed intent_id
- Do NOT invent intents
- Confidence reflects certainty across the conversation (0.0 to 1.0)
- Identify missing info that blocks recommendation
- IMPORTANT: If confidence < 0.7 OR missing critical info, GENERATE "clarifying_question".
- "acknowledgement": A brief, empathetic acknowledgement. After recommendations, suggest adding to cart naturally.
- "explanation": Detailed reason connecting product to user's goals. For comparisons, provide clear differentiation.
- "cart_action": Optional. Set to "add" if user wants to add to cart.
- "product_index": Optional. Which product to add (0 = first, 1 = second, 2 = third).
- "cart_action": Can also be "summary" if user asks about cart, or "place_order" if confirming purchase.
- Respond with ONLY the raw JSON object, no markdown, no code fences.

Conversation so far:
${recentHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

User just said:
${message}

OUTCOME-FIRST APPROACH (CRITICAL):
Before asking about budget/specs, first understand what RESULT/OUTCOME the user wants to achieve.
- If they say "camera for travel", extract outcome: "capturing travel moments and memories"
- If they say "laptop for work", extract outcome: "productive work sessions and multitasking"
- If they say "headphones for commute", extract outcome: "peaceful commute experience"

READY FOR IMAGE GENERATION (IMPORTANT):
Set "ready_for_image_generation" to TRUE if ANY of these:
1. Clear PRODUCT TYPE (camera, laptop, etc.) + ANY context OR
2. Confidence >= 0.5 OR
3. You understand WHAT they want (outcome) even if vague

Set FALSE only if:
- Extremely vague ("I want something") with NO product type
- Confidence < 0.4

EXAMPLES - ready_for_image_generation: TRUE:
- "camera for my kid" ✅
- "waterproof camera" ✅  
- "gaming laptop" ✅

DO NOT ask clarifying questions if TRUE - show images first!

If ready_for_image_generation is true, DO NOT ask clarifying questions. The system will show visual outcomes first.
If false, ask ONE focused question about their intended outcome or use case.

CLARIFICATION PRIORITY:
1. First: Understand OUTCOME (what result they want)
2. Then: Understand USE CASE (when/where/how they'll use it)
3. Only after images: Ask about budget/specs/details

Return JSON ONLY:
{
  "intent_id": "string (one of the allowed IDs)",
  "confidence": number,
  "missing_info": string[],
  "acknowledgement": "string",
  "clarifying_question": "string (optional, if ready_for_image_generation is false)",
  "explanation": "string",
  "outcome_description": "string (what result the user wants to achieve)",
  "ready_for_image_generation": boolean,
  "cart_action": "add" | "summary" | "place_order" | null (optional),
  "product_index": number (optional, 0-based index, only for "add")
}`;;

    const requestBody = {
        contents: [
            { role: 'user', parts: [{ text: prompt }] }
        ],
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    });
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Gemini API error during classification: ${res.status} ${res.statusText} - ${errorText}`);
    }
    const json = await res.json();
    if (!json.candidates || json.candidates.length === 0) {
        throw new Error('Gemini did not return any candidates for classification');
    }
    let text = json.candidates[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini did not return classification text');

    // Extract JSON: Prioritize code blocks, then fallback to substring
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
        text = codeBlockMatch[1];
    } else {
        const firstOpen = text.indexOf('{');
        const lastClose = text.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
            text = text.substring(firstOpen, lastClose + 1);
        }
    }

    try {
        return JSON.parse(text) as GeminiResponse;
    } catch (e) {
        console.error("Failed to parse JSON:", text);
        throw new Error("Invalid JSON response from model");
    }
}

// Helper: generate presentation via Gemini (LLM 2)
async function generatePresentation(
    intentId: string,
    userMessage: string,
    products: any[],
    offset: number
): Promise<{
    primary: any;
    secondary: any[];
    acknowledgement: string;
}> {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

    const prompt = `You are Aarav, the expert shopping assistant.
    
CONTEXT:
User Intent: ${intentId}
User Message: "${userMessage}"
Top Ranked Products (Deterministic): ${JSON.stringify(products)}
Offset: ${offset}

TASK:
1.  **Acknowledgement**: Brief, reassuring confirmation of finding these items.
2.  **Primary Recommendation**: Select the FIRST product (Rank 1) as the primary recommendation.
    -   Write a "description" (1-2 sentences) about why it fits the intent.
    -   Write a "reasoning" (bullet points or short paragraph) detailing its benefits for this specific user.
    -   Extract key "features" as a list.
    -   IMPORTANT: Include the exact "variant_id" from the source product data.
3.  **Secondary Recommendations**: For the remaining products, write a short "description" (1 sentence) on why they are good alternatives.
    -   Do NOT create "reasoning" for secondary items.
    -   IMPORTANT: Include the exact "variant_id" from each product's source data.

OUTPUT JSON ONLY:
{
  "acknowledgement": "string",
  "primary": {
    "product_id": "string",
    "variant_id": "string",
    "title": "string",
    "price": "string",
    "image_url": "string",
    "description": "string",
    "reasoning": "string",
    "features": ["string"]
  },
  "secondary": [
    {
      "product_id": "string",
      "variant_id": "string",
      "title": "string",
      "price": "string",
      "image_url": "string",
      "description": "string"
    }
  ]
}`;

    const requestBody = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    });

    if (!res.ok) throw new Error(`Gemini Presentation API error: ${res.status}`);
    const json = await res.json();
    let text = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    // Extract JSON
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
        text = codeBlockMatch[1];
    } else {
        const firstOpen = text.indexOf('{');
        const lastClose = text.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
            text = text.substring(firstOpen, lastClose + 1);
        }
    }

    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("Presentation JSON Parse Error", text);
        // Fallback: return raw products if LLM fails
        return {
            acknowledgement: "Here are the best matches I found.",
            primary: products[0] ? { ...products[0], description: "Top match", reasoning: "Best fit for your needs.", features: [] } : null,
            secondary: products.slice(1).map(p => ({ ...p, description: "Good alternative" }))
        };
    }
}

// Helper: Create draft order for cart summary (no address needed for calculation)
async function createDraftOrderForSummary(cartItems: any[]) {
    const shopifyResponse = await fetch('/api/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'create_draft_order',
            adminToken: process.env.SHOPIFY_ADMIN_TOKEN,
            params: {
                payload: {
                    draft_order: {
                        line_items: cartItems.map(item => ({
                            variant_id: parseInt(item.variant_id),
                            quantity: item.quantity || 1
                        })),
                        currency: 'INR'
                    }
                }
            }
        })
    });

    if (!shopifyResponse.ok) {
        throw new Error('Failed to create draft order for summary');
    }

    return await shopifyResponse.json();
}

// Helper: Create draft order with address for order placement
async function createDraftOrderWithAddress(cartItems: any[], address: any) {
    const shopifyResponse = await fetch('/api/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'create_draft_order',
            adminToken: process.env.SHOPIFY_ADMIN_TOKEN,
            params: {
                payload: {
                    draft_order: {
                        email: address.email || 'customer@example.com',
                        shipping_address: {
                            first_name: address.first_name,
                            last_name: address.last_name,
                            address1: address.address1,
                            city: address.city,
                            province: address.province,
                            country: address.country || 'IN',
                            zip: address.zip,
                            phone: address.phone
                        },
                        billing_address: {
                            first_name: address.first_name,
                            last_name: address.last_name,
                            address1: address.address1,
                            city: address.city,
                            province: address.province,
                            country: address.country || 'IN',
                            zip: address.zip,
                            phone: address.phone
                        },
                        line_items: cartItems.map(item => ({
                            variant_id: parseInt(item.variant_id),
                            quantity: item.quantity || 1
                        })),
                        shipping_line: {
                            title: 'Standard Shipping',
                            price: '0.00' // Will be calculated by Shopify
                        },
                        currency: 'INR'
                    }
                }
            }
        })
    });

    if (!shopifyResponse.ok) {
        throw new Error('Failed to create draft order with address');
    }

    return await shopifyResponse.json();
}

// Helper: Complete draft order to create real order
async function completeDraftOrder(draftOrderId: string) {
    const shopifyResponse = await fetch('/api/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'complete_draft_order',
            adminToken: process.env.SHOPIFY_ADMIN_TOKEN,
            params: {
                draft_order_id: draftOrderId
            }
        })
    });

    if (!shopifyResponse.ok) {
        throw new Error('Failed to complete draft order');
    }

    return await shopifyResponse.json();
}

export async function POST(req: Request) {
    try {
        const body: ChatRequest = await req.json();
        const { session_id, current_message, chat_history, offset = 0 } = body as any; // Cast for offset support

        if (!session_id || !current_message) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        let intent_id: string;
        let confidence: number;
        let missing_info: string[] = [];
        let acknowledgement: string = "";
        let clarifying_question: string | undefined = "";
        let explanation: string | undefined = "";

        // 1. Determine Intent
        if (body.intent_id) {
            // Bypass mode (Pagination/Load More)
            intent_id = body.intent_id;
            confidence = 1.0; // Assume valid if client is requesting more
        } else {
            // Standard classification (Aarav)
            const classification = await classifyIntent(current_message, chat_history);
            intent_id = classification.intent_id;
            confidence = classification.confidence;
            missing_info = classification.missing_info;
            acknowledgement = classification.acknowledgement;
            clarifying_question = classification.clarifying_question;
            explanation = classification.explanation;
            console.log("📊 CLASSIFICATION:", { intent_id, confidence, ready_for_image_generation: classification.ready_for_image_generation });

            // PHASE 1: ENHANCED CONFIDENCE ASSESSMENT
            const confidenceLevel = assessConfidence(confidence);

            // Track session state for clarification turns
            let sessionState: SessionState = {
                session_id: session_id,
                clarification_count: (body as any).clarification_count || 0,
                current_intent_id: intent_id,
                confidence_history: [...((body as any).confidence_history || []), confidence],
                outcome_context: {
                    use_case: classification.outcome_description,
                    desired_outcome: classification.outcome_description,
                    constraints: {}
                }
            };

            // Max clarification turns check (3 max)
            if (sessionState.clarification_count >= 3 && confidenceLevel.level !== 'high') {
                // Too many clarifications - offer fallback
                const response: ClarificationResponse = {
                    response_type: 'clarification',
                    intent_id,
                    confidence,
                    missing_info: [],
                    acknowledgement: "I want to make sure I get this right for you.",
                    clarifying_question: "Let me show you our popular options, or would you like to talk to a specialist?",
                    explanation: "Maximum clarification attempts reached. Offering alternatives."
                };
                return NextResponse.json(response);
            }

            // PHASE 4: PARALLEL EXECUTION - Generate images + Fetch products simultaneously
            // Trigger when ready_for_image_generation is true AND confidence is medium or high (≥0.6)
            console.log("🔍 IMAGE CHECK:", { level: confidenceLevel.level, ready: classification.ready_for_image_generation, willTrigger: ((confidenceLevel.level === "high" || confidenceLevel.level === "medium") && classification.ready_for_image_generation) });
            if ((confidenceLevel.level === 'high' || confidenceLevel.level === 'medium') && classification.ready_for_image_generation) {
                try {
                    console.log('⚡ Starting parallel execution: images + products');
                    const startTime = Date.now();

                    // Run both operations in parallel
                    const [imagesResult, products] = await Promise.all([
                        generateOutcomeImages(sessionState.outcome_context).catch(err => {
                            console.error('Image generation failed:', err);
                            return null; // Return null instead of throwing
                        }),
                        getTopProducts(intent_id, 0, 3).catch(err => {
                            console.error('Product pre-fetch failed:', err);
                            return []; // Return empty, will fetch on accept
                        })
                    ]);

                    const elapsedMs = Date.now() - startTime;
                    console.log(`⚡ Parallel execution completed in ${elapsedMs}ms`);
                    console.log(`   Images: ${imagesResult ? imagesResult.length : 'FAILED'}, Products: ${products.length}`);

                    // If images generated successfully, return image confirmation flow
                    if (imagesResult && imagesResult.length > 0) {
                        const response: ImageGenerationResponse = {
                            response_type: 'image_generation',
                            intent_id,
                            outcome_description: sessionState.outcome_context.desired_outcome || intent_id,
                            images: imagesResult,
                            cached_products: products, // Phase 4: Cache products for instant display
                            acknowledgement: "I've visualized your outcome in 3 ways. Which best represents what you're looking for?",
                            explanation: `These images show different perspectives of your goal: ${sessionState.outcome_context.desired_outcome}`
                        };

                        console.log(`🎨 Generated ${imagesResult.length} outcome images with ${products.length} cached products`);
                        return NextResponse.json(response);
                    } else {
                        // Image generation failed - fall through to product recommendations
                        console.warn('⚠️  Image generation unavailable, showing products directly');
                        // Continue to product recommendations below
                    }

                } catch (error) {
                    console.error('Parallel execution failed:', error);
                    // Fall through to product recommendations
                }
            }

            // PHASE 4: HANDLE IMAGE ACCEPTANCE - Use cached products for instant display
            if ((body as any).action === 'accept_image') {
                const selectedVariant = (body as any).selected_variant;
                let cachedProducts = (body as any).cached_products || [];
                console.log(`✅ User accepted variant ${selectedVariant}`);
                if (cachedProducts.length === 0) {
                    // Cached products not available - fetch now
                    console.log('⏱️  No cached products, fetching now...');
                    const topProducts = await getTopProducts(intent_id, 0, 3);
                    cachedProducts = topProducts;
                }

                // If STILL no products, return guidance/clarification instead of empty recommendation
                if (cachedProducts.length === 0) {
                    console.log('⚠️ No products found for intent:', intent_id);
                    const response: ClarificationResponse = {
                        response_type: 'clarification',
                        intent_id,
                        confidence,
                        missing_info: [],
                        acknowledgement: "I see what you're looking for, but I couldn't find exact matches in our current catalog.",
                        clarifying_question: "To help me find the best alternative, could you tell me which feature matters most to you: portability, professional quality, or ease of use?",
                        explanation: "No direct product matches found for this visual intent."
                    };
                    return NextResponse.json(response);
                }

                // Generate presentation using cached products
                const presentation = await generatePresentation(
                    intent_id,
                    current_message,
                    cachedProducts,
                    0
                );
                const response: RecommendationResponse = {
                    response_type: 'recommendation',
                    intent_id,
                    confidence,
                    primary_recommendation: presentation.primary,
                    secondary_recommendations: presentation.secondary,
                    acknowledgement: "Perfect! Here are products that match this outcome.",
                    explanation: presentation.acknowledgement,
                    next_page_offset: cachedProducts.length === 3 ? 3 : null
                };
                console.log('⚡ Products ready instantly (used cache)');
                return NextResponse.json(response);
            }

            // PHASE 5: HANDLE IMAGE REJECTION/REFINEMENT - Intent Clarification
            if ((body as any).action === 'reject_images' || (body as any).action === 'refine_images') {
                const clarificationCount = (body as any).clarification_count || 0;
                const actionType = (body as any).action === 'reject_images' ? 'rejected' : 'wants to refine';
                console.log(`📝 User ${actionType} images (attempt ${clarificationCount + 1})`);
                // Check max clarification attempts
                if (clarificationCount >= 2) {
                    console.log('⚠️ Max clarification attempts reached');
                    const response: ClarificationResponse = {
                        response_type: 'clarification',
                        intent_id,
                        confidence,
                        missing_info: [],
                        acknowledgement: "I'm having trouble understanding your needs visually.",
                        clarifying_question: "Would you like to describe what you're looking for in detail, or should I show you product options directly?",
                        explanation: "Maximum clarification attempts reached.",
                        clarification_count: clarificationCount
                    };
                    return NextResponse.json(response);
                }
                // Ask LLM to generate clarifying question about THE INTENT
                const currentOutcome = classification.outcome_description || intent_id;
                const useCase = (sessionState.outcome_context?.use_case || '');
                const clarificationPrompt = `
            The user ${actionType} the visual representations of their intended outcome.
            Current understanding:
            - Intent: ${intent_id}
            - Outcome: ${currentOutcome}
            - Use case: ${useCase}
            The user's actual intent may differ from our current understanding. Generate a targeted clarifying question to better understand:
            1. What specific outcome/result they actually want to achieve
            2. The exact context or scenario they have in mind  
            3. Any misunderstanding about their use case or requirements
            Focus on understanding their INTENT and CONTEXT better, not visual preferences.
            Examples of good questions:
            - "Are you using this professionally or personally?"
            - "What specific scenario do you have in mind?"
            - "Is this for indoor or outdoor use?"
            - "Are you looking for portability or high performance?"
            - "Will this be for daily use or special occasions?"
            Generate a natural, conversational clarifying question that will help us understand their true intent.
            `;
                try {
                    // Use existing classification endpoint to get clarifying question
                    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
                    const clarificationResponse = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{
                                    parts: [{ text: clarificationPrompt }]
                                }],
                                generationConfig: {
                                    temperature: 0.7,
                                    maxOutputTokens: 150
                                }
                            })
                        }
                    );
                    const data = await clarificationResponse.json();
                    const clarifyingQuestion = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
                        "Can you tell me more about what you're looking for and how you plan to use it?";
                    const response: ClarificationResponse = {
                        response_type: 'clarification',
                        intent_id,
                        confidence,
                        missing_info: ['intent_context', 'use_case_details'],
                        acknowledgement: "Let me understand better what you're looking for.",
                        clarifying_question: clarifyingQuestion,
                        explanation: "Refining understanding of user's actual intent.",
                        clarification_count: clarificationCount + 1
                    };
                    console.log(`💬 Clarifying question: "${clarifyingQuestion}"`);
                    return NextResponse.json(response);
                } catch (error) {
                    console.error('Failed to generate clarifying question:', error);
                    // Fallback clarifying question
                    const response: ClarificationResponse = {
                        response_type: 'clarification',
                        intent_id,
                        confidence,
                        missing_info: ['intent_details'],
                        acknowledgement: "Let me make sure I understand correctly.",
                        clarifying_question: "Can you describe in more detail what you're looking for and how you plan to use it?",
                        explanation: "Clarifying user intent.",
                        clarification_count: clarificationCount + 1
                    };
                    return NextResponse.json(response);
                }
            }

            // CART ACTION DETECTION: Handle before clarification/recommendation
            if (classification.cart_action === 'add' && typeof classification.product_index === 'number') {
                // User wants to add a product to cart via voice
                // We need to get the product from session context
                // For now, store last recommendation in session (passed from frontend)
                const lastProducts = (body as any).last_products; // Frontend should send this

                if (lastProducts && lastProducts[classification.product_index]) {
                    const productToAdd = lastProducts[classification.product_index];
                    const cartResponse: CartActionResponse = {
                        response_type: 'cart_action',
                        action: 'add',
                        product_id: productToAdd.product_id,
                        variant_id: productToAdd.variant_id,
                        product_title: productToAdd.title,
                        acknowledgement: acknowledgement || `Added ${productToAdd.title} to your cart!`,
                    };
                    return NextResponse.json(cartResponse);
                } else {
                    // No products in context - ask for clarification
                    const response: ClarificationResponse = {
                        response_type: 'clarification',
                        intent_id,
                        confidence,
                        missing_info: ['product_context'],
                        acknowledgement: "I'd love to add that for you!",
                        clarifying_question: "Which product would you like? Could you search for something first?",
                        explanation: "No products available to add to cart.",
                    };
                    return NextResponse.json(response);
                }
            }

            // CART SUMMARY DETECTION: Show cart contents and totals
            if (classification.cart_action === 'summary') {
                const cartItems = (body as any).cart_items || [];

                if (!cartItems || cartItems.length === 0) {
                    const response: ClarificationResponse = {
                        response_type: 'clarification',
                        intent_id,
                        confidence,
                        missing_info: ['cart_items'],
                        acknowledgement: "Your cart is empty!",
                        clarifying_question: "Would you like to search for products?",
                        explanation: "No items in cart yet.",
                    };
                    return NextResponse.json(response);
                }

                try {
                    // Create draft order to calculate shipping & tax
                    const draftOrderResponse = await createDraftOrderForSummary(cartItems);
                    const draftOrder = draftOrderResponse.draft_order;

                    const summaryResponse: CartSummaryResponse = {
                        response_type: 'cart_summary',
                        items: cartItems,
                        subtotal: draftOrder.subtotal_price || '0',
                        shipping: draftOrder.total_shipping_price_set?.shop_money?.amount || '0',
                        tax: draftOrder.total_tax || '0',
                        total: draftOrder.total_price || '0',
                        currency: 'INR',
                        acknowledgement: acknowledgement || `You have ${cartItems.length} item${cartItems.length > 1 ? 's' : ''} in your cart.`,
                        draft_order_id: draftOrder.id
                    };
                    return NextResponse.json(summaryResponse);
                } catch (error) {
                    console.error('Cart summary error:', error);
                    const response: ClarificationResponse = {
                        response_type: 'clarification',
                        intent_id,
                        confidence,
                        missing_info: [],
                        acknowledgement: acknowledgement,
                        clarifying_question: "I had trouble calculating your cart total. Would you like to try again?",
                        explanation: "Error creating draft order for summary.",
                    };
                    return NextResponse.json(response);
                }
            }

            // ORDER PLACEMENT DETECTION: Place the order
            if (classification.cart_action === 'place_order') {
                const cartItems = (body as any).cart_items || [];
                const address = (body as any).address;

                if (!cartItems || cartItems.length === 0) {
                    const response: ClarificationResponse = {
                        response_type: 'clarification',
                        intent_id,
                        confidence,
                        missing_info: ['cart_items'],
                        acknowledgement: "Your cart is empty!",
                        clarifying_question: "You need to add items before placing an order. Would you like to search for products?",
                        explanation: "No items to order.",
                    };
                    return NextResponse.json(response);
                }

                if (!address) {
                    const response: ClarificationResponse = {
                        response_type: 'clarification',
                        intent_id,
                        confidence,
                        missing_info: ['address'],
                        acknowledgement: "I'll need your delivery address.",
                        clarifying_question: "Please provide your delivery address including street, city, state, and PIN code.",
                        explanation: "Need address for order placement.",
                    };
                    return NextResponse.json(response);
                }

                try {
                    // Create draft order with address
                    const draftOrderResponse = await createDraftOrderWithAddress(cartItems, address);
                    const draftOrder = draftOrderResponse.draft_order;

                    // Complete draft order to create real order
                    const completedOrderResponse = await completeDraftOrder(draftOrder.id);
                    const order = completedOrderResponse.draft_order;

                    const orderResponse: OrderPlacedResponse = {
                        response_type: 'order_placed',
                        order_id: order.id,
                        order_number: order.order_number || order.name || draftOrder.id,
                        total: order.total_price || draftOrder.total_price,
                        currency: 'INR',
                        acknowledgement: acknowledgement || `Order placed successfully! Your order #${order.order_number || draftOrder.id} will arrive soon.`
                    };
                    return NextResponse.json(orderResponse);
                } catch (error) {
                    console.error('Order placement error:', error);
                    const response: ClarificationResponse = {
                        response_type: 'clarification',
                        intent_id,
                        confidence,
                        missing_info: [],
                        acknowledgement: acknowledgement,
                        clarifying_question: "I had trouble placing your order. Would you like to try again?",
                        explanation: "Error creating or completing draft order.",
                    };
                    return NextResponse.json(response);
                }
            }

            // 2. Determine state: Clarification vs Recommendation
            if (confidence < 0.7 || (clarifying_question && clarifying_question.trim().length > 0)) {
                const response: ClarificationResponse = {
                    response_type: 'clarification',
                    intent_id,
                    confidence,
                    missing_info,
                    acknowledgement: acknowledgement || "I understood that.",
                    clarifying_question: clarifying_question || "Could you tell me more?",
                    explanation: explanation || "I need a bit more detail to help you best.",
                };
                return NextResponse.json(response);
            }
        }

        // 3. Recommendation flow (Deterministic + Presentation)
        const topProducts = await getTopProducts(intent_id, offset, 3);

        if (topProducts.length === 0) {
            const response: ClarificationResponse = {
                response_type: 'clarification',
                intent_id,
                confidence,
                missing_info: [],
                acknowledgement: "I looked for products...",
                clarifying_question: "It seems I can't find exact matches. Could you broaden your search?",
                explanation: "No products found for this intent.",
            };
            return NextResponse.json(response);
        }

        // Generate Presentation (LLM 2)
        const presentation = await generatePresentation(intent_id, current_message, topProducts, offset);

        const response: RecommendationResponse = {
            response_type: 'recommendation',
            intent_id,
            confidence,
            primary_recommendation: offset === 0 ? presentation.primary : undefined,
            secondary_recommendations: offset === 0 ? presentation.secondary : [presentation.primary, ...presentation.secondary].filter(Boolean),
            acknowledgement: presentation.acknowledgement,
            explanation: explanation || '', // Add explanation from classification
            next_page_offset: topProducts.length === 3 ? offset + 3 : null,
        };
        return NextResponse.json(response);

    } catch (err: any) {
        console.error('Backend orchestrator error:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
