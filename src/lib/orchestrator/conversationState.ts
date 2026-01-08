/**
 * Conversation State Management
 * 
 * Tracks multi-turn conversation progress, persona inference, and clarification attempts.
 * This is the foundation for Aarav's adaptive, persona-aware conversation flow.
 */

export type ConversationPhase =
    | 'greeting'           // Initial salutation and acknowledgment
    | 'clarification'      // Understanding user intent through questions
    | 'framing'            // Explaining decision context before products
    | 'recommendation'     // Showing products with tradeoffs
    | 'commitment';        // Cart, add-ons, checkout

export type Persona =
    | 'occasion_driven'      // Event-focused, anxious about missing the moment
    | 'aspiring_hobbyist'    // Learning-oriented, growth mindset
    | 'social_proof'         // Validation-seeking, relies on others' choices
    | 'budget_constrained'   // Price-sensitive, fears overspending
    | 'delegator'            // Decision-averse, wants direct recommendations
    | 'anxiety_prone'        // Regret-averse, decision paralysis
    | null;                  // Unknown or neutral

export interface ConversationState {
    session_id: string;
    turn_count: number;                      // Number of back-and-forths
    conversation_phase: ConversationPhase;   // Current phase in conversation
    inferred_persona: Persona;               // Current persona (can change)
    clarification_attempts: number;          // Counter for question loops
    intent_id: string | null;                // Current detected intent
    confidence: number;                      // Confidence in intent detection
    is_returning_user: boolean;              // First-time vs returning customer
}

/**
 * Initialize conversation state for new session
 */
export function initConversationState(sessionId: string, isReturningUser: boolean = false): ConversationState {
    return {
        session_id: sessionId,
        turn_count: 0,
        conversation_phase: 'greeting',
        inferred_persona: null,
        clarification_attempts: 0,
        intent_id: null,
        confidence: 0,
        is_returning_user: isReturningUser
    };
}

/**
 * Increment turn counter and update phase if needed
 */
export function advanceTurn(state: ConversationState): ConversationState {
    return {
        ...state,
        turn_count: state.turn_count + 1
    };
}

/**
 * Update conversation phase
 */
export function updatePhase(state: ConversationState, phase: ConversationPhase): ConversationState {
    return {
        ...state,
        conversation_phase: phase
    };
}

/**
 * Increment clarification attempt counter
 */
export function incrementClarificationAttempts(state: ConversationState): ConversationState {
    return {
        ...state,
        clarification_attempts: state.clarification_attempts + 1
    };
}

/**
 * Update inferred persona
 */
export function updatePersona(state: ConversationState, persona: Persona): ConversationState {
    return {
        ...state,
        inferred_persona: persona
    };
}

/**
 * Check if max clarification attempts reached (strategy switch trigger)
 */
export function shouldSwitchStrategy(state: ConversationState): boolean {
    return state.clarification_attempts >= 3 && state.confidence < 0.8;
}

/**
 * Get persona-specific product count limit
 */
export function getProductCountForPersona(persona: Persona): number {
    switch (persona) {
        case 'delegator':
            return 1; // Single direct recommendation
        case 'occasion_driven':
        case 'anxiety_prone':
            return 2; // Fewer options to reduce overwhelm
        default:
            return 3; // Standard count for most personas
    }
}

/**
 * Get persona-specific question count limit
 */
export function getQuestionCountForPersona(persona: Persona): number {
    switch (persona) {
        case 'occasion_driven':
        case 'budget_constrained':
        case 'delegator':
            return 1; // Quick, focused questions
        case 'aspiring_hobbyist':
        case 'social_proof':
            return 2; // More exploratory
        case 'anxiety_prone':
            return 2; // Gradual, supportive
        default:
            return 2; // Default
    }
}
