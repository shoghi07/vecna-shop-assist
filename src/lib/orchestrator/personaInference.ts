/**
 * Persona Inference Engine
 * 
 * Infers user persona based on language patterns, questions, and behavioral signals.
 * Personas can shift mid-conversation as new signals emerge.
 */

import type { Persona } from './conversationState';
import type { ChatHistory } from '@/types/message';

interface PersonaSignals {
    keywords: string[];
    patterns: RegExp[];
    weight: number; // Higher weight = stronger signal
}

/**
 * Persona detection patterns
 */
const PERSONA_PATTERNS: Record<Exclude<Persona, null>, PersonaSignals> = {
    occasion_driven: {
        keywords: ['wedding', 'birthday', 'graduation', 'proposal', 'anniversary', 'event', 'party', 'ceremony', 'celebration'],
        patterns: [
            /need (it|this|that) to work/i,
            /one.?time/i,
            /special (day|moment|occasion)/i,
            /can't mess (this|it) up/i,
            /don't want to (miss|regret)/i
        ],
        weight: 1.5 // High weight - clear signal
    },

    budget_constrained: {
        keywords: ['budget', 'cheap', 'affordable', 'price', 'cost', 'expensive', 'overspend', 'save', 'money'],
        patterns: [
            /under \$?\d+/i,
            /how much/i,
            /can't (afford|spend)/i,
            /too expensive/i,
            /best value/i
        ],
        weight: 1.3
    },

    delegator: {
        keywords: ['recommend', 'suggest', 'tell me', 'just', 'simple', 'easy'],
        patterns: [
            /just (tell|show) me/i,
            /what should I/i,
            /don't know (much|anything)/i,
            /you decide/i,
            /recommend/i
        ],
        weight: 1.2
    },

    aspiring_hobbyist: {
        keywords: ['learn', 'beginner', 'start', 'hobby', 'practice', 'improve', 'skill'],
        patterns: [
            /(want to|trying to) learn/i,
            /(new to|beginner at) photography/i,
            /get (into|started)/i,
            /practice/i
        ],
        weight: 1.0
    },

    social_proof: {
        keywords: ['popular', 'reviews', 'others', 'recommend', 'youtuber', 'influencer', 'everyone'],
        patterns: [
            /(what are|what do) (others|people) (using|buying)/i,
            /I (saw|heard) (about|that)/i,
            /(friend|someone) recommended/i,
            /popular/i
        ],
        weight: 1.0
    },

    anxiety_prone: {
        keywords: ['worried', 'afraid', 'scared', 'regret', 'wrong', 'sure', 'certain', 'mistake'],
        patterns: [
            /what if/i,
            /worried (about|that)/i,
            /scared (of|that)/i,
            /make (the|a) (right|wrong) (choice|decision)/i,
            /are you sure/i
        ],
        weight: 1.1
    }
};

/**
 * Infer persona from user message and chat history
 */
export function inferPersona(
    message: string,
    chatHistory: ChatHistory,
    currentPersona: Persona | null
): Persona | null {
    const scores: Partial<Record<Exclude<Persona, null>, number>> = {};

    // Analyze current message
    const lowerMessage = message.toLowerCase();

    for (const [persona, signals] of Object.entries(PERSONA_PATTERNS)) {
        let score = 0;

        // Check keywords
        for (const keyword of signals.keywords) {
            if (lowerMessage.includes(keyword)) {
                score += 0.5 * signals.weight;
            }
        }

        // Check patterns
        for (const pattern of signals.patterns) {
            if (pattern.test(message)) {
                score += 1.0 * signals.weight;
            }
        }

        if (score > 0) {
            scores[persona as Exclude<Persona, null>] = score;
        }
    }

    // Analyze chat history (weaker signals, look for consistent patterns)
    const recentHistory = chatHistory.slice(-3); // Last 3 messages
    for (const msg of recentHistory) {
        if (msg.role === 'user') {
            const historyLower = msg.content.toLowerCase();

            for (const [persona, signals] of Object.entries(PERSONA_PATTERNS)) {
                for (const keyword of signals.keywords) {
                    if (historyLower.includes(keyword)) {
                        scores[persona as Exclude<Persona, null>] = (scores[persona as Exclude<Persona, null>] || 0) + 0.2;
                    }
                }
            }
        }
    }

    // Find highest scoring persona
    const entries = Object.entries(scores) as [Exclude<Persona, null>, number][];
    if (entries.length === 0) {
        // No strong signals, keep current or return null
        return currentPersona;
    }

    entries.sort((a, b) => b[1] - a[1]);
    const [topPersona, topScore] = entries[0];

    // Require minimum score to infer persona
    if (topScore < 1.0) {
        return currentPersona || null;
    }

    // Allow persona shift if new persona has significantly higher score
    if (currentPersona && currentPersona !== topPersona) {
        const currentScore = scores[currentPersona] || 0;
        // Require 1.5x score to override current persona (hysteresis)
        if (topScore < currentScore * 1.5) {
            return currentPersona;
        }

        console.log(`🔄 Persona shift detected: ${currentPersona} → ${topPersona} (score: ${topScore.toFixed(2)})`);
    } else if (!currentPersona) {
        console.log(`🎯 Persona inferred: ${topPersona} (score: ${topScore.toFixed(2)})`);
    }

    return topPersona;
}

/**
 * Get persona-friendly name for logging/display
 */
export function getPersonaDisplayName(persona: Persona): string {
    const names: Record<Exclude<Persona, null>, string> = {
        occasion_driven: 'Occasion-Driven Buyer',
        aspiring_hobbyist: 'Aspiring Hobbyist',
        social_proof: 'Social Proof-Driven',
        budget_constrained: 'Budget-Constrained',
        delegator: 'Delegator',
        anxiety_prone: 'Anxiety-Prone'
    };

    return persona ? names[persona] : 'Unknown';
}

/**
 * Get persona-specific question style guidance
 */
export function getQuestionStyleForPersona(persona: Persona): string {
    const styles: Record<Exclude<Persona, null>, string> = {
        occasion_driven: 'event-focused, reassuring',
        aspiring_hobbyist: 'learning-oriented, encouraging',
        social_proof: 'reference-anchored, confident',
        budget_constrained: 'constraint-first, respectful',
        delegator: 'binary/forced choice, direct',
        anxiety_prone: 'safety-oriented, calm'
    };

    return persona ? styles[persona] : 'neutral, open-ended';
}

/**
 * Get persona-specific decision framing
 */
export function getDecisionFrameForPersona(persona: Persona, intentId: string): string {
    const frames: Record<Exclude<Persona, null>, string> = {
        occasion_driven: "This will reliably capture your special moment",
        aspiring_hobbyist: "This setup grows with your skills",
        social_proof: "People like you often choose this",
        budget_constrained: "Best value for your budget without compromises",
        delegator: "This is the simplest good choice",
        anxiety_prone: "This is a safe, reversible decision"
    };

    return persona ? frames[persona] : "Here's what fits your needs";
}
