/**
 * Clarification Message Component
 * 
 * Presentational component - NO logic, NO state
 * Displays assistant's clarifying question exactly as received from backend
 * 
 * CRITICAL: Display clarifying_question verbatim - NEVER rephrase
 */

import { AssistantClarificationMessage } from '@/types/message';

interface ClarificationMessageProps {
    message: AssistantClarificationMessage;
}

export function ClarificationMessage({ message }: ClarificationMessageProps) {
    return (
        <div className="flex justify-start mb-4">
            <div className="max-w-[80%] bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
            </div>
        </div>
    );
}
