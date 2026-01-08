import { supabase } from '@/lib/supabase';

/**
 * Generate a personalized closing message after a successful checkout.
 * This analyzes the conversation history to find key persona signals (hobbies, specific mentions like YouTubers, events).
 */
export async function generateClosingConnection(
    orderId: string,
    history: { role: string; content: string }[],
    persona: string | null
): Promise<string> {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

    // 1. Filter history for user messages likely to contain personal details
    const relevantHistory = history
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join('\n');

    const prompt = `
    You are Aarav, a personal shopping assistant. A user has just placed an order (ID: ${orderId}).
    Your goal is to write a warm, short, 1-sentence closing message that references a specific detail from their conversation context if possible.

    User Persona: ${persona || 'Unknown'}
    Conversation Context:
    "${relevantHistory}"

    Instructions:
    - Look for mentions of: specific influencers (e.g., Dave2D, MKBHD), specific events (e.g., weddings, trips, birthdays), or specific relations (e.g., gift for wife, son).
    - If found, Reference it warmly. 
      Example: "Thanks for the purchase! And huge thanks to Dave2D for helping us find the perfect match!"
      Example: "Have an amazing time capturing memories at your sister's wedding!"
    - If NO specific context is found, use a generic but warm professional closing based on the persona.
      Example: "I'm sure you're going to create amazing work with this gear!"

    Output ONLY the 1-sentence closing string. Do not output JSON.
    `;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 100 }
            })
        });

        if (!response.ok) return "Thank you for shopping with Ladani Store!";

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        return text || "Thank you for shopping with Ladani Store! We can't wait to see what you create.";

    } catch (error) {
        console.error('Failed to generate closing connection:', error);
        return "Thank you for your purchase! We hope you enjoy your new gear.";
    }
}
