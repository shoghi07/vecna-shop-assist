/**
 * Chat Screen Component
 * 
 * CRITICAL: This is a STATEFUL container, but contains NO business logic
 * 
 * Responsibilities (ALLOWED):
 * - Maintain chat history in state
 * - Send requests to backend
 * - Render responses based on response_type
 * - Handle user input
 * - Call Shopify cart API
 * 
 * Forbidden (NOT ALLOWED):
 * - Intent detection
 * - Confidence evaluation
 * - Routing decisions
 * - Product filtering/sorting
 * - Generating questions
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Message, UserMessage, AssistantClarificationMessage, AssistantRecommendationMessage } from '@/types/message';
import { sendMessageToBackend, addToShopifyCart, ChatHistoryItem, BackendResponse } from '@/lib/api';
import { generateUUID } from '@/lib/utils';
import { UserMessageBubble } from '@/components/UserMessageBubble';
import { ClarificationMessage } from '@/components/ClarificationMessage';
import { RecommendationMessage } from '@/components/RecommendationMessage';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VoiceInput } from '@/components/VoiceInput';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';

export function ChatScreen() {
    // Session state
    const [sessionId] = useState(() => generateUUID());
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Transform client message to backend format
    // CRITICAL: Strip metadata, send only {role, content}
    const clientMessageToBackendFormat = (msg: Message): ChatHistoryItem => {
        return {
            role: msg.role,
            content: msg.content,
        };
    };

    // Handle backend response
    // ALLOWED: Conditional rendering based on response_type
    // NOT ALLOWED: Evaluating confidence, checking missing_info, etc.
    const handleBackendResponse = (response: BackendResponse): Message => {
        const baseMessage = {
            id: generateUUID(),
            role: 'assistant' as const,
            timestamp: new Date().toISOString(),
            metadata: {
                intentId: response.intent_id,
                confidence: response.confidence,
                missingInfo: response.missing_info,
            },
        };

        if (response.response_type === 'clarification') {
            return {
                ...baseMessage,
                responseType: 'clarification',
                content: response.clarifying_question,
            } as AssistantClarificationMessage;
        } else {
            return {
                ...baseMessage,
                responseType: 'recommendation',
                content: response.acknowledgement,
                primary_recommendation: response.primary_recommendation,
                secondary_recommendations: response.secondary_recommendations,
                next_page_offset: response.next_page_offset,
                intentId: response.intent_id,
            } as AssistantRecommendationMessage;
        }
    };

    // Send message to backend
    const handleSendMessage = async () => {
        // Validation: Don't send empty messages
        if (!inputValue.trim()) {
            return;
        }

        // Create user message
        const userMessage: UserMessage = {
            id: generateUUID(),
            role: 'user',
            content: inputValue.trim(),
            timestamp: new Date().toISOString(),
        };

        // Add to chat history
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setError(null);
        setIsLoading(true);

        try {
            // Prepare backend request
            const chatHistory = messages.map(clientMessageToBackendFormat);

            const response = await sendMessageToBackend({
                session_id: sessionId,
                current_message: userMessage.content,
                chat_history: chatHistory,
            });

            // Handle response (no logic - just transform and append)
            const assistantMessage = handleBackendResponse(response);
            setMessages(prev => [...prev, assistantMessage]);

        } catch (err) {
            // Generic error handling - no fallback logic
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            toast.error('Failed to send message. Please try again.');
            console.error('Backend error:', err);
        } finally {
            setIsLoading(false);
            inputRef.current?.focus();
        }
    };

    // Handle add to cart
    const handleAddToCart = async (variantId: string) => {
        try {
            await addToShopifyCart(variantId);
            toast.success('Added to cart!');
        } catch (err) {
            toast.error('Failed to add to cart');
            console.error('Cart error:', err);
        }
    };

    // Handle Enter key
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    // Handle voice transcription
    // CRITICAL: Voice input is just another way to populate the text field
    // The text is then sent to backend exactly like typed text
    const handleVoiceTranscription = (text: string) => {
        setInputValue(text);
        // Focus input so user can review/edit transcribed text
        inputRef.current?.focus();
    };

    // Handle Load More (Pagination)
    const handleLoadMore = async (intentId: string, offset: number) => {
        setIsLoading(true);
        try {
            // Send request with explicit intent_id and offset (Bypass classification)
            const response = await sendMessageToBackend({
                session_id: sessionId,
                current_message: "Load more products", // Context for LLM presentation
                chat_history: [], // History not needed for pagination bypass
                intent_id: intentId,
                offset: offset
            });

            // Append new recommendations as a separate assistant message
            const assistantMessage = handleBackendResponse(response);
            setMessages(prev => [...prev, assistantMessage]);

        } catch (err) {
            console.error('Load more error:', err);
            toast.error('Failed to load more products');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-background">
            {/* Header */}
            <div className="border-b px-4 py-3">
                <h1 className="text-lg font-semibold">Shopping Assistant</h1>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-hidden">
                <div
                    ref={scrollRef}
                    className="h-full overflow-y-auto px-4 py-6"
                >
                    {messages.length === 0 && (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center text-muted-foreground">
                                <p>👋 Hi! I&apos;m your shopping assistant.</p>
                                <p className="text-sm mt-2">How can I help you find the perfect product?</p>
                            </div>
                        </div>
                    )}

                    {messages.map(message => {
                        if (message.role === 'user') {
                            return <UserMessageBubble key={message.id} message={message} />;
                        }

                        // Assistant messages - render based on responseType
                        if (message.responseType === 'clarification') {
                            return <ClarificationMessage key={message.id} message={message} />;
                        } else {
                            return (
                                <RecommendationMessage
                                    key={message.id}
                                    message={message}
                                    onAddToCart={handleAddToCart}
                                    onLoadMore={handleLoadMore}
                                />
                            );
                        }
                    })}

                    {/* Loading indicator */}
                    {isLoading && (
                        <div className="flex justify-start mb-4">
                            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                                <Loader2 className="w-4 h-4 animate-spin" />
                            </div>
                        </div>
                    )}

                    {/* Error message */}
                    {error && (
                        <div className="flex justify-center mb-4">
                            <div className="bg-destructive/10 text-destructive rounded-lg px-4 py-2 text-sm">
                                {error}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Input Area */}
            <div className="border-t px-4 py-4">
                <div className="flex gap-2">
                    <VoiceInput
                        onTranscriptionComplete={handleVoiceTranscription}
                        disabled={isLoading}
                    />
                    <textarea
                        data-testid="chat-input"
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type or speak your message..."
                        className="flex-1 resize-none rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        rows={1}
                        disabled={isLoading}
                    />
                    <Button
                        data-testid="send-button"
                        onClick={handleSendMessage}
                        disabled={isLoading || !inputValue.trim()}
                        size="icon"
                        className="h-auto aspect-square"
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
