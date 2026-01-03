/**
 * Voice Mode Component
 * 
 * Voice-first conversational interface with animated orb.
 * Handles the complete voice interaction flow:
 * 1. User taps orb -> starts recording
 * 2. User taps again -> stops recording, auto-sends
 * 3. Orb shows "thinking" while backend processes
 * 4. Response auto-plays via TTS
 * 5. Orb shows "talking" during playback
 * 6. Returns to idle after completion
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Orb, AgentState } from '@/components/ui/orb';
import { transcribeAudio, isAudioRecordingSupported, initElevenLabs } from '@/lib/elevenlabs';
import { config } from '@/config';
import { toast } from 'sonner';
import { sendMessageToBackend, addToShopifyCart } from '@/lib/api';
import type { ChatHistory } from '@/types/message';

// Default delivery address for orders
const DEFAULT_DELIVERY_ADDRESS = {
    first_name: 'Shoghi',
    last_name: 'B',
    address1: 'Tcules - UX Design Studio 614 S cience City Road Sola',
    city: 'Ahmedabad',
    province: 'Gujarat',
    country: 'IN',
    zip: '380060',
    phone: '9601052801',
    email: 'customer@tcules.com'
};

export function VoiceMode() {
    const [agentState, setAgentState] = useState<AgentState>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [sessionId] = useState(() => `voice-${Date.now()}`);
    const [chatHistory, setChatHistory] = useState<ChatHistory>([]);
    const [isMounted, setIsMounted] = useState(false);
    const [currentResponse, setCurrentResponse] = useState<any>(null); // Store full backend response
    const [cartItems, setCartItems] = useState<Array<{ variantId: string, title: string }>>([]);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Mark as mounted to prevent hydration mismatch
        setIsMounted(true);

        // Initialize ElevenLabs
        if (config.elevenlabs.apiKey) {
            initElevenLabs(config.elevenlabs.apiKey, config.elevenlabs.voiceId);
        }
    }, []);

    const handleAddToCart = async (variantId: string, productTitle: string) => {
        try {
            await addToShopifyCart(variantId);
            setCartItems([...cartItems, { variantId, title: productTitle }]);
            toast.success(`Added ${productTitle} to cart!`);
        } catch (error) {
            console.error('Add to cart error:', error);
            toast.error('Failed to add to cart. Please try again.');
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await handleTranscription(audioBlob);
            };

            mediaRecorder.start();
            setIsRecording(true);
            setAgentState('listening');
        } catch (error) {
            console.error('Microphone access error:', error);
            toast.error('Microphone access required');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const handleTranscription = async (audioBlob: Blob) => {
        setAgentState('thinking');
        setIsProcessing(true);

        try {
            // Transcribe audio
            const transcribedText = await transcribeAudio(audioBlob);

            if (!transcribedText || transcribedText.trim() === '') {
                toast.error("Didn't catch that. Try again?");
                setAgentState(null);
                setIsProcessing(false);
                return;
            }

            // Add user message to history
            const newHistory: ChatHistory = [
                ...chatHistory,
                { role: 'user', content: transcribedText }
            ];
            setChatHistory(newHistory);

            // Send to backend with product context for cart actions
            const lastProducts = currentResponse?.response_type === 'recommendation'
                ? [
                    currentResponse.primary_recommendation,
                    ...(currentResponse.secondary_recommendations || [])
                ].filter(Boolean)
                : [];

            const response = await sendMessageToBackend({
                session_id: sessionId,
                current_message: transcribedText,
                chat_history: newHistory,
                last_products: lastProducts, // Send product context for voice cart commands
                cart_items: cartItems.map(item => ({ // Send cart for summary/order placement
                    variant_id: item.variantId,
                    title: item.title,
                    quantity: 1
                })),
                address: DEFAULT_DELIVERY_ADDRESS // Send default address for order placement
            } as any);

            // Handle cart action response
            if (response.response_type === 'cart_action') {
                // Auto-add to cart
                await handleAddToCart(response.variant_id, response.product_title);

                // Play confirmation TTS
                await playTTS(response.acknowledgement);

                setAgentState(null);
                setIsProcessing(false);
                return;
            }

            // Handle cart summary response
            if (response.response_type === 'cart_summary') {
                // Speak cart summary with totals
                const summaryText = `${response.acknowledgement} Your total is ₹${response.total}, including ₹${response.shipping} shipping and ₹${response.tax} in taxes. Would you like to place your order?`;
                await playTTS(summaryText);

                setAgentState(null);
                setIsProcessing(false);
                return;
            }

            // Handle order placed response
            if (response.response_type === 'order_placed') {
                // Speak order confirmation
                await playTTS(response.acknowledgement);

                // Clear cart after successful order
                setCartItems([]);

                setAgentState(null);
                setIsProcessing(false);
                return;
            }

            // Add assistant message to history
            const assistantMessage = response.response_type === 'clarification'
                ? response.clarifying_question
                : response.acknowledgement || 'Here are my recommendations.';

            setChatHistory([
                ...newHistory,
                { role: 'assistant', content: assistantMessage }
            ]);

            // Store full response for product display
            setCurrentResponse(response);

            // Generate and play TTS
            // For recommendations, speak BOTH acknowledgement AND explanation
            let ttsText = assistantMessage;
            if (response.response_type === 'recommendation' && response.explanation) {
                ttsText = `${assistantMessage} ${response.explanation}`;
            }

            await playTTS(ttsText);

        } catch (error) {
            console.error('Voice conversation error:', error);
            toast.error('Something went wrong. Try again?');
            setAgentState(null);
            setIsProcessing(false);
        }
    };

    const playTTS = async (text: string) => {
        try {
            setAgentState('talking');

            // Call TTS API
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voiceId: config.elevenlabs.voiceId }),
            });

            if (!response.ok) {
                throw new Error('TTS failed');
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audioRef.current = audio;

            audio.onended = () => {
                setAgentState(null);
                setIsProcessing(false);
                URL.revokeObjectURL(audioUrl);
            };

            audio.onerror = () => {
                setAgentState(null);
                setIsProcessing(false);
                toast.error('Audio playback failed');
            };

            await audio.play();

        } catch (error) {
            console.error('TTS error:', error);
            setAgentState(null);
            setIsProcessing(false);
            toast.error('Voice generation failed');
        }
    };

    const handleOrbTap = () => {
        if (isProcessing) {
            // Ignore taps while processing
            return;
        }

        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    // Show loading during SSR to prevent hydration mismatch
    if (!isMounted) {
        return (
            <div className="flex flex-col items-center justify-center h-screen p-8 bg-background">
                <div className="w-96 h-96 flex items-center justify-center">
                    <div className="animate-pulse text-muted-foreground">Loading...</div>
                </div>
            </div>
        );
    }

    // Check availability after mount
    if (!isAudioRecordingSupported() || !config.elevenlabs.apiKey) {
        return (
            <div className="flex flex-col items-center justify-center h-screen p-8 bg-background">
                <p className="text-muted-foreground text-center">
                    Voice mode is not available. Please check your browser settings and API configuration.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-background overflow-hidden">
            {/* Main Content - Orb and Status */}
            <div className="flex-shrink-0 flex flex-col items-center justify-center p-8 pt-12">
                {/* Orb Container */}
                <div
                    className="w-80 h-80 cursor-pointer transition-transform hover:scale-105 active:scale-95"
                    onClick={handleOrbTap}
                >
                    <Orb
                        agentState={agentState}
                        colors={["#3B82F6", "#8B5CF6"]} // Blue to purple gradient
                        volumeMode="auto"
                    />
                </div>

                {/* Status Text */}
                <div className="mt-6 text-center">
                    <p className="text-lg font-medium">
                        {isRecording && "Listening..."}
                        {agentState === 'thinking' && "Thinking..."}
                        {agentState === 'talking' && "Speaking..."}
                        {!isRecording && !isProcessing && "Tap to speak"}
                    </p>
                    {chatHistory.length > 0 && (
                        <p className="text-sm text-muted-foreground mt-2 max-w-md">
                            {chatHistory[chatHistory.length - 1].content.substring(0, 80)}
                            {chatHistory[chatHistory.length - 1].content.length > 80 && '...'}
                        </p>
                    )}
                </div>

                {/* Helper Text */}
                {chatHistory.length === 0 && (
                    <div className="mt-4 text-center text-sm text-muted-foreground max-w-md">
                        <p>Tap the orb and start speaking.</p>
                        <p className="mt-1">Tap again when you're done.</p>
                    </div>
                )}
            </div>

            {/* Product Recommendations Section */}
            {currentResponse && currentResponse.response_type === 'recommendation' && (
                <div className="flex-1 overflow-y-auto px-4 pb-8">
                    <div className="max-w-4xl mx-auto space-y-6">
                        {/* Acknowledgement */}
                        <div className="text-center">
                            <p className="text-muted-foreground italic">
                                "{currentResponse.acknowledgement}"
                            </p>
                        </div>

                        {/* Primary Recommendation */}
                        {currentResponse.primary_recommendation && (
                            <div className="bg-card border-2 border-primary/20 rounded-lg p-4 shadow-lg">
                                <div className="flex items-start gap-4">
                                    <div className="relative w-32 h-32 flex-shrink-0 bg-white rounded-md overflow-hidden">
                                        <img
                                            src={currentResponse.primary_recommendation.image_url}
                                            alt={currentResponse.primary_recommendation.title}
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-start justify-between mb-2">
                                            <h3 className="font-semibold text-lg line-clamp-2">
                                                {currentResponse.primary_recommendation.title}
                                            </h3>
                                            <span className="text-primary font-bold text-xl ml-4">
                                                {currentResponse.primary_recommendation.price}
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-3">
                                            {currentResponse.primary_recommendation.description}
                                        </p>
                                        {currentResponse.primary_recommendation.reasoning && (
                                            <p className="text-xs text-muted-foreground italic mb-3">
                                                {currentResponse.primary_recommendation.reasoning}
                                            </p>
                                        )}
                                        <button
                                            className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-md hover:bg-primary/90 transition-colors"
                                            onClick={() => handleAddToCart(
                                                currentResponse.primary_recommendation.variant_id,
                                                currentResponse.primary_recommendation.title
                                            )}
                                        >
                                            Add to Cart
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Secondary Recommendations */}
                        {currentResponse.secondary_recommendations && currentResponse.secondary_recommendations.length > 0 && (
                            <>
                                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-center">
                                    Other Options
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {currentResponse.secondary_recommendations.map((product: any) => (
                                        <div key={product.product_id} className="bg-card border rounded-lg p-4 hover:border-primary/40 transition-colors">
                                            <div className="flex gap-3">
                                                <div className="relative w-20 h-20 flex-shrink-0 bg-white rounded-md overflow-hidden">
                                                    <img
                                                        src={product.image_url}
                                                        alt={product.title}
                                                        className="w-full h-full object-contain"
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-medium text-sm line-clamp-2 mb-1">
                                                        {product.title}
                                                    </h4>
                                                    <p className="text-primary font-semibold mb-2">
                                                        {product.price}
                                                    </p>
                                                    <button
                                                        className="w-full bg-secondary text-secondary-foreground py-1.5 px-3 rounded text-sm hover:bg-secondary/80 transition-colors"
                                                        onClick={() => handleAddToCart(
                                                            product.variant_id,
                                                            product.title
                                                        )}
                                                    >
                                                        Add to Cart
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Floating Checkout Button - Shows when cart has items */}
            {cartItems.length > 0 && (
                <div className="fixed bottom-8 right-8 z-50">
                    <button
                        onClick={() => window.location.href = `https://${config.shopify.storeDomain}/cart`}
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg transition-all flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        Checkout ({cartItems.length})
                    </button>
                </div>
            )}

            {/* Floating Cart Counter - Top right */}
            {cartItems.length > 0 && (
                <div className="fixed top-4 right-4 z-50 bg-card border-2 border-primary rounded-full p-2 shadow-lg">
                    <div className="relative">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                        <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {cartItems.length}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
