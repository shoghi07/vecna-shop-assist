// Session state for tracking user conversation context
export interface SessionState {
    session_id: string;
    clarification_count: number; // Max 3
    current_intent_id: string;
    confidence_history: number[];
    outcome_context: OutcomeContext;
    pre_fetched_products?: any[]; // Stored after parallel execution
}

export interface OutcomeContext {
    use_case?: string; // "wedding photography", "daily commute"
    desired_outcome?: string; // "capture stunning low-light shots"
    constraints: {
        budget?: { min?: number; max?: number; symbol: string };
        size?: string;
        features?: string[];
        compatibility?: string[];
    };
    visual_preferences?: {
        style?: string;
        color?: string;
        form_factor?: string;
    };
}

export interface ConfidenceLevel {
    score: number;
    level: 'high' | 'medium' | 'low';
    clarification_turns_needed: number;
}

// Helper function to assess confidence level
export function assessConfidence(score: number): ConfidenceLevel {
    if (score >= 0.85) {
        return {
            score,
            level: 'high',
            clarification_turns_needed: 0
        };
    }

    if (score >= 0.60) {
        return {
            score,
            level: 'medium',
            clarification_turns_needed: 1
        };
    }

    return {
        score,
        level: 'low',
        clarification_turns_needed: 2
    };
}
