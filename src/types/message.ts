/**
 * Message Type Definitions
 * 
 * Client-side message format (includes metadata for rendering)
 * Backend only receives {role, content} - metadata is stripped before sending
 */

import { MessageRole } from '@/lib/api';

export interface MessageMetadata {
    intentId: string;
    confidence: number;
    missingInfo: string[];
}

// Chat history type for conversation tracking
export type ChatHistory = Array<{ role: 'user' | 'assistant'; content: string }>;

export interface BaseMessage {
    id: string;
    role: MessageRole;
    content: string;
    timestamp: string;
}

export interface UserMessage extends BaseMessage {
    role: 'user';
}

export interface AssistantClarificationMessage extends BaseMessage {
    role: 'assistant';
    responseType: 'clarification';
    metadata: MessageMetadata;
}

export interface AssistantRecommendationMessage extends BaseMessage {
    role: 'assistant';
    responseType: 'recommendation';
    content: string;
    primary_recommendation?: any;
    secondary_recommendations?: any[];
    next_page_offset?: number | null;
    intent_id?: string;
}

export type AssistantMessage =
    | AssistantClarificationMessage
    | AssistantRecommendationMessage;

export type Message = UserMessage | AssistantMessage;
