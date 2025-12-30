import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { loadIntents } from '@/lib/orchestrator/intentRegistry';
import { getTopProducts } from '@/lib/orchestrator/productService';

// Types
interface ChatRequest {
    session_id: string;
    current_message: string;
    chat_history: { role: string; content: string }[];
}

interface Intent {
    intent_id: string;
    name: string;
    description: string | null;
}

interface GeminiResponse {
    intent_id: string;
    confidence: number;
    missing_info: string[];
    acknowledgement: string;      // New: User acknowledgement
    clarifying_question?: string; // New: If low confidence
    explanation: string;          // New: Reasoning for intent/question
}

interface ClarificationResponse {
    response_type: 'clarification';
    intent_id: string;
    confidence: number;
    missing_info: string[];
    acknowledgement: string;
    clarifying_question: string;
    explanation: string;
}

interface RecommendationResponse {
    response_type: 'recommendation';
    intent_id: string;
    confidence: number;
    missing_info: string[];
    products: any[];
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

Input Understanding Parameters
You may receive the following input types:
1. Free-text user query
2. Follow-up responses
3. Implicit signals

Evaluation Rules
Always infer use case before product type.
Detect multi-intent possibilities and resolve them conversationally.
If required intent attributes are missing, prompt the user clearly.

Allowed Intents:
${intents.map(i => `${i.intent_id}: ${i.description || i.name}`).join('\n')}

Rules:
- Choose ONLY from allowed intent_id
- Do NOT invent intents
- Confidence reflects certainty across the conversation (0.0 to 1.0)
- Identify missing info that blocks recommendation
- IMPORTANT: If confidence < 0.7 OR missing critical info, GENERATE "clarifying_question".
- "acknowledgement": A brief, empathetic acknowledgement of the user's input.
- "explanation": Brief reason for your decision (why you are asking a question OR why you chose this intent).
- Respond with ONLY the raw JSON object, no markdown, no code fences.

Conversation so far:
${recentHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

User just said:
${message}

Return JSON ONLY:
{
  "intent_id": "string (one of the allowed IDs)",
  "confidence": number,
  "missing_info": string[],
  "acknowledgement": "string",
  "clarifying_question": "string (optional, required if confidence < 0.7)",
  "explanation": "string"
}`;

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
3.  **Secondary Recommendations**: For the remaining products, write a short "description" (1 sentence) on why they are good alternatives.
    -   Do NOT create "reasoning" for secondary items.

OUTPUT JSON ONLY:
{
  "acknowledgement": "string",
  "primary": {
    "product_id": "string",
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
            next_page_offset: topProducts.length === 3 ? offset + 3 : null,
        };
        return NextResponse.json(response);

    } catch (err: any) {
        console.error('Backend orchestrator error:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
