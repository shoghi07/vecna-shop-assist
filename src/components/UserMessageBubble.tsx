/**
 * User Message Bubble Component
 * 
 * Presentational component - NO logic, NO state
 * Displays user's message in a chat bubble
 */

import { UserMessage } from '@/types/message';

interface UserMessageBubbleProps {
    message: UserMessage;
}

export function UserMessageBubble({ message }: UserMessageBubbleProps) {
    return (
        <div className="flex justify-end mb-4">
            <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3">
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
            </div>
        </div>
    );
}
