/**
 * Voice Mode Component - Voice-First UI
 * 
 * Mobile-first conversational interface with animated ElevenLabs orb.
 * The orb is the emotional and interaction anchor - ALWAYS PRESENT.
 * 
 * UI Principles:
 * - Orb never hidden, removed, or repurposed
 * - Calm, premium, advisor-like visual language
 * - Single continuous conversational surface
 * - Voice is primary, visual is secondary support
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Orb, AgentState } from '@/components/ui/orb';
import { GradientBackground } from '@/components/ui/GradientBackground';
import { AgentTranscript } from '@/components/ui/AgentTranscript';
import { TranscriptionCapsule } from '@/components/ui/TranscriptionCapsule';
import { ProductCarousel } from '@/components/ui/ProductCarousel';
import { QuickReplyChips } from '@/components/ui/QuickReplyChips';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { MiniWaveform } from '@/components/ui/MiniWaveform';
import { transcribeAudio, isAudioRecordingSupported, initElevenLabs } from '@/lib/elevenlabs';
import { config } from '@/config';
import { toast } from 'sonner';
import { sendMessageToBackend, addToShopifyCart } from '@/lib/api';
import CheckoutModal from './CheckoutModal';
import { ShoppingBag } from 'lucide-react';
import type { ChatHistory } from '@/types/message';
import { X, Mic, MicOff, Keyboard, RefreshCcw, RotateCw, ArrowRight } from 'lucide-react';

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
    // State management (preserved from original)
    const [agentState, setAgentState] = useState<AgentState>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [sessionId] = useState(() => `voice-${Date.now()}`);
    const [chatHistory, setChatHistory] = useState<ChatHistory>([]);
    const [isMounted, setIsMounted] = useState(false);
    const [currentResponse, setCurrentResponse] = useState<any>(null); // Store full backend response
    const [cartItems, setCartItems] = useState<Array<{ id: string, title: string, price: string, quantity: number, image_url: string }>>([]);
    const [imageConfirmationPhase, setImageConfirmationPhase] = useState(false);
    const [generatedImages, setGeneratedImages] = useState<any[]>([]);
    const [selectedImageVariant, setSelectedImageVariant] = useState<string | null>(null);
    const [cachedProducts, setCachedProducts] = useState<any[]>([]); // Phase 4: Store pre-fetched products
    const [clarificationCount, setClarificationCount] = useState(0); // Phase 5: Track intent clarification attempts
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false); // Dummy Checkout State
    const [lastOrderId, setLastOrderId] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Calculate total quantity for badge
    const cartQuantity = cartItems.reduce((acc, item) => acc + item.quantity, 0);


    const handleOrderSuccess = async (orderId: string) => {
        setCartItems([]);
        setLastOrderId(orderId);
        setIsCheckoutOpen(false);
        toast.success(`Order placed! ID: ${orderId}`);
        await playTTS(`Your order has been placed successfully! Order ID is ${orderId}. Check your email for the invoice.`);
    };


    useEffect(() => {
        setIsMounted(true);
        if (config.elevenlabs.apiKey) {
            initElevenLabs(config.elevenlabs.apiKey, config.elevenlabs.voiceId);
        }
    }, []);

    const handleAddToCart = async (product: any) => {
        try {
            // Try Shopify add (non-blocking)
            addToShopifyCart(product.variant_id || product.variantId).catch(err =>
                console.warn('Shopify add failed, proceeding with local cart:', err)
            );

            setCartItems(prev => [
                ...prev,
                {
                    id: product.variant_id || product.variantId,
                    title: product.title,
                    price: product.price || "$0.00",
                    quantity: 1,
                    image_url: product.image_url || ""
                }
            ]);
            toast.success(`Added ${product.title} to cart!`);
        } catch (error) {
            console.error('Local cart error:', error);
            toast.error('Failed to add to cart.');
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
            setCurrentTranscript(''); // Clear previous transcript
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
            const transcribedText = await transcribeAudio(audioBlob);

            if (!transcribedText || transcribedText.trim() === '') {
                toast.error("Didn't catch that. Try again?");
                setAgentState(null);
                setIsProcessing(false);
                setCurrentTranscript('');
                return;
            }

            // Show transcription
            setCurrentTranscript(transcribedText);

            // Clear previous agent message when user speaks
            setAgentMessage('');

            // Add user message to history
            const newHistory: ChatHistory = [
                ...chatHistory,
                { role: 'user', content: transcribedText }
            ];
            setChatHistory(newHistory);

            // Send to backend
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
                    variant_id: item.id,
                    title: item.title,
                    quantity: item.quantity
                })),
                address: DEFAULT_DELIVERY_ADDRESS
            } as any);

            // Handle cart action response
            const respAny = response as any;
            if (respAny.cart_action) {
                if (respAny.cart_action === 'add') {
                    const productIndex = respAny.product_index ?? 0;

                    // Determine which product to add from context
                    const productToAdd = response.response_type === 'recommendation'
                        ? (productIndex === 0 ? response.primary_recommendation : response.secondary_recommendations?.[productIndex - 1])
                        : cachedProducts[productIndex];

                    const possibleProducts = [
                        ...cachedProducts,
                        (response as any).primary_recommendation,
                        ...((response as any).secondary_recommendations || [])
                    ].filter(Boolean);

                    const targetProduct = productToAdd || possibleProducts
                        .find((p: any) => p && (p.variant_id === respAny.variant_id || p.id === respAny.variant_id));

                    if (targetProduct) {
                        await handleAddToCart(targetProduct);
                    } else {
                        await handleAddToCart({
                            variantId: respAny.variant_id,
                            title: respAny.product_title || "Unknown Product",
                            price: "$0.00",
                            image_url: ""
                        });
                    }

                    // Speak acknowledgement
                    let ttsMessage = (response as any).acknowledgement;
                    if (respAny.addon_message) ttsMessage += ' ' + respAny.addon_message;
                    await playTTS(ttsMessage);

                } else if (respAny.cart_action === 'place_order' || respAny.cart_action === 'summary') {
                    setIsCheckoutOpen(true);
                }
            }

            // Handle cart summary response
            if (response.response_type === 'cart_summary') {
                const summaryText = `${response.acknowledgement} Your total is ₹${response.total}, including ₹${response.shipping} shipping and ₹${response.tax} in taxes. Would you like to place your order?`;
                setAgentMessage(summaryText);
                await playTTS(summaryText);
                setAgentState(null);
                setIsProcessing(false);
                return;
            }

            // Handle order placed response
            if (response.response_type === 'order_placed') {
                setAgentMessage(response.acknowledgement);
                await playTTS(response.acknowledgement);
                setCartItems([]);
                setAgentState(null);
                setIsProcessing(false);
                return;
            }

            // Handle image generation response
            if (response.response_type === 'image_generation') {
                setGeneratedImages(response.images);
                setImageConfirmationPhase(true);
                if ((response as any).cached_products) {
                    setCachedProducts((response as any).cached_products);
                }
                setAgentMessage(response.acknowledgement);
                await playTTS(response.acknowledgement);
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
            setAgentMessage(assistantMessage);

            // Extract quick replies if clarification
            if (response.response_type === 'clarification') {
                // You can add quick reply options here if backend provides them
                setQuickReplies([]);
            } else {
                setQuickReplies([]);
            }

            // Generate and play TTS
            let ttsText = assistantMessage;
            if (response.response_type === 'recommendation' && response.explanation) {
                ttsText = `${assistantMessage} ${response.explanation}`;
            }

            await playTTS(ttsText);

            return response; // Return full response for external handling

        } catch (error) {
            console.error('Voice conversation error:', error);
            toast.error('Something went wrong. Try again?');
            setAgentState(null);
            setIsProcessing(false);
            setCurrentTranscript('');
            throw error; // Re-throw to caller
        }
    };

    const playTTS = async (text: string) => {
        try {
            setCurrentTranscript(''); // Clear user transcript immediately when agent starts speaking
            setAgentState('talking');

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

    const handleImageSelection = async (
        action: 'accept' | 'refine' | 'reject',
        variantId?: string | null
    ) => {
        console.log('👇 handleImageSelection called:', { action, variantId, sessionId });
        setIsProcessing(true);
        if (action === 'accept' && variantId) {
            try {
                const response = await sendMessageToBackend({
                    session_id: sessionId,
                    current_message: `I selected variant ${variantId}`,
                    chat_history: chatHistory,
                    action: 'accept_image',
                    selected_variant: variantId,
                    intent_id: currentResponse?.intent_id, // Pass existing intent context
                    cached_products: cachedProducts,
                    last_products: [],
                    cart_items: cartItems.map(item => ({
                        variant_id: item.id,
                        title: item.title,
                        quantity: item.quantity
                    })),
                    address: DEFAULT_DELIVERY_ADDRESS
                } as any);
                if (response.response_type === 'recommendation') {
                    setCurrentResponse(response);
                    setImageConfirmationPhase(false);
                    setSelectedImageVariant(null);
                    setCachedProducts([]);
                    setClarificationCount(0);
                    setAgentMessage("Perfect! Here are products that match this outcome.");
                    await playTTS("Perfect! Here are products that match this outcome.");
                    setChatHistory([
                        ...chatHistory,
                        { role: 'assistant', content: response.acknowledgement }
                    ]);
                } else if (response.response_type === 'clarification') {
                    // Handle case where NO products were found -> guidance/question
                    console.log('⚠️ No products found, switching to clarification');
                    setImageConfirmationPhase(false); // Close modal
                    setSelectedImageVariant(null);

                    // Speak guidance: Combine acknowledgement + question
                    const ack = (response as any).acknowledgement || '';
                    const ttsMessage = `${ack} ${response.clarifying_question}`;
                    await playTTS(ttsMessage);
                    // Add to history
                    setChatHistory([
                        ...chatHistory,
                        { role: 'assistant', content: ttsMessage }
                    ]);
                }
            } catch (error) {
                console.error('Image acceptance failed:', error);
                toast.error('Failed to load products. Please try again.');
            }
        }
        if (action === 'refine') {
            setImageConfirmationPhase(false);
            setIsProcessing(true);

            try {
                const response = await sendMessageToBackend({
                    session_id: sessionId,
                    current_message: "I need more specific options",
                    chat_history: chatHistory,
                    action: 'refine_images',
                    clarification_count: clarificationCount,
                    last_products: [],
                    cart_items: cartItems.map(item => ({
                        variant_id: item.id,
                        title: item.title,
                        quantity: item.quantity
                    })),
                    address: DEFAULT_DELIVERY_ADDRESS
                } as any);

                if (response.response_type === 'clarification') {
                    setAgentMessage(response.clarifying_question);
                    await playTTS(response.clarifying_question);
                    setClarificationCount((response as any).clarification_count || clarificationCount + 1);
                }
            } catch (error) {
                console.error('Refine handling failed:', error);
                toast.error('Failed to process refinement. Please try again.');
            }

            setSelectedImageVariant(null);
        }
        if (action === 'reject') {
            setImageConfirmationPhase(false);
            setIsProcessing(true);

            try {
                const response = await sendMessageToBackend({
                    session_id: sessionId,
                    current_message: "These don't match what I'm looking for",
                    chat_history: chatHistory,
                    action: 'reject_images',
                    clarification_count: clarificationCount,
                    last_products: [],
                    cart_items: cartItems.map(item => ({
                        variant_id: item.id,
                        title: item.title,
                        quantity: item.quantity
                    })),
                    address: DEFAULT_DELIVERY_ADDRESS
                } as any);

                if (response.response_type === 'clarification') {
                    setAgentMessage(response.clarifying_question);
                    await playTTS(response.clarifying_question);
                    setClarificationCount((response as any).clarification_count || clarificationCount + 1);
                    // Clear cache for fresh start
                    setCachedProducts([]);
                }
            } catch (error) {
                console.error('Reject handling failed:', error);
                toast.error('Failed to process feedback. Please try again.');
            }

            setSelectedImageVariant(null);
        }
        setAgentState(null);
        setIsProcessing(false);
    };

    const handleOrbTap = () => {
        if (isProcessing) return;
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const handleQuickReply = async (reply: string) => {
        setCurrentTranscript(reply);
        setQuickReplies([]);

        // Clear previous agent message when user selects quick reply
        setAgentMessage('');

        // Simulate voice input with the selected reply
        const newHistory: ChatHistory = [
            ...chatHistory,
            { role: 'user', content: reply }
        ];
        setChatHistory(newHistory);

        setAgentState('thinking');
        setIsProcessing(true);

        // Send to backend (same flow as voice)
        try {
            const response = await sendMessageToBackend({
                session_id: sessionId,
                current_message: reply,
                chat_history: newHistory,
                last_products: [],
                cart_items: cartItems.map(item => ({
                    variant_id: item.variantId,
                    title: item.title,
                    quantity: 1
                })),
                address: DEFAULT_DELIVERY_ADDRESS
            } as any);

            const assistantMessage = response.response_type === 'clarification'
                ? response.clarifying_question
                : response.acknowledgement || 'Here are my recommendations.';

            setChatHistory([
                ...newHistory,
                { role: 'assistant', content: assistantMessage }
            ]);

            setCurrentResponse(response);
            setAgentMessage(assistantMessage);

            let ttsText = assistantMessage;
            if (response.response_type === 'recommendation' && response.explanation) {
                ttsText = `${assistantMessage} ${response.explanation}`;
            }

            await playTTS(ttsText);
        } catch (error) {
            console.error('Quick reply error:', error);
            toast.error('Something went wrong. Try again?');
            setAgentState(null);
            setIsProcessing(false);
        }
    };

    const handleTextSubmit = async () => {
        if (!textInput.trim()) return;

        const userText = textInput.trim();
        setTextInput(''); // Clear input immediately
        setCurrentTranscript(userText);
        setAgentMessage(''); // Clear previous agent message
        setAgentState('thinking');
        setIsProcessing(true);

        // Add user message to history
        const newHistory: ChatHistory = [
            ...chatHistory,
            { role: 'user', content: userText }
        ];
        setChatHistory(newHistory);

        try {
            // Send to backend with correct payload format
            const lastProducts = currentResponse?.response_type === 'recommendation'
                ? [
                    currentResponse.primary_recommendation,
                    ...(currentResponse.secondary_recommendations || [])
                ].filter(Boolean)
                : [];

            const response = await sendMessageToBackend({
                session_id: sessionId,
                current_message: userText,
                chat_history: newHistory,
                last_products: lastProducts,
                cart_items: cartItems.map(item => ({
                    variant_id: item.variantId,
                    title: item.title,
                    quantity: 1
                })),
                address: DEFAULT_DELIVERY_ADDRESS
            } as any);

            // Handle different response types (same as voice input)
            if (response.response_type === 'cart_action') {
                await handleAddToCart(response.variant_id, response.product_title);
                setAgentMessage(response.acknowledgement);
                await playTTS(response.acknowledgement);
                setAgentState(null);
                setIsProcessing(false);
                return;
            }

            if (response.response_type === 'cart_summary') {
                const summaryText = `${response.acknowledgement} Your total is ₹${response.total}, including ₹${response.shipping} shipping and ₹${response.tax} in taxes. Would you like to place your order?`;
                setAgentMessage(summaryText);
                await playTTS(summaryText);
                setAgentState(null);
                setIsProcessing(false);
                return;
            }

            if (response.response_type === 'order_placed') {
                setAgentMessage(response.acknowledgement);
                await playTTS(response.acknowledgement);
                setCartItems([]);
                setAgentState(null);
                setIsProcessing(false);
                return;
            }

            if (response.response_type === 'image_generation') {
                setGeneratedImages(response.images);
                setImageConfirmationPhase(true);
                if ((response as any).cached_products) {
                    setCachedProducts((response as any).cached_products);
                }
                setAgentMessage(response.acknowledgement);
                await playTTS(response.acknowledgement);
                setAgentState(null);
                setIsProcessing(false);
                return;
            }

            const assistantMessage = response.response_type === 'clarification'
                ? response.clarifying_question
                : response.acknowledgement || 'Here are my recommendations.';

            setChatHistory([
                ...newHistory,
                { role: 'assistant', content: assistantMessage }
            ]);

            setCurrentResponse(response);
            setAgentMessage(assistantMessage);

            let ttsText = assistantMessage;
            if (response.response_type === 'recommendation' && response.explanation) {
                ttsText = `${assistantMessage} ${response.explanation}`;
            }

            await playTTS(ttsText);
        } catch (error) {
            console.error('Text input error:', error);
            toast.error('Something went wrong. Try again?');
            setAgentState(null);
            setIsProcessing(false);
            setCurrentTranscript('');
        }
    };

    // Loading state
    if (!isMounted) {
        return (
            <GradientBackground>
                <div className="flex items-center justify-center h-screen">
                    <div className="animate-pulse text-gray-600">Loading...</div>
                </div>
            </GradientBackground>
        );
    }



    // Availability check
    if (!isAudioRecordingSupported() || !config.elevenlabs.apiKey) {
        return (
            <GradientBackground>
                <div className="flex items-center justify-center h-screen p-8">
                    <p className="text-gray-700 text-center max-w-md">
                        Voice mode is not available. Please check your browser settings and API configuration.
                    </p>
                </div>
            </GradientBackground>
        );
    }

    // Determine UI state
    const isEntryState = chatHistory.length === 0 && !isRecording && !isProcessing;
    const hasProducts = currentResponse?.response_type === 'recommendation';

    return (
        <div className="flex flex-col h-screen bg-background overflow-hidden">
            {/* Top Right Controls */}
            <div className="absolute top-4 right-4 z-50 flex gap-2">
                {/* Cart Button */}
                {cartQuantity > 0 && (
                    <button
                        onClick={() => setIsCheckoutOpen(true)}
                        className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 rounded-full transition-all animate-in zoom-in spin-in-12 duration-300 relative group"
                        title="View Cart & Checkout"
                    >
                        <ShoppingBag className="w-5 h-5 text-white" />
                        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-[10px] font-bold text-white shadow-lg pointer-events-none">
                            {cartQuantity}
                        </span>
                        <div className="absolute top-full right-0 mt-2 px-2 py-1 bg-black/80 text-xs text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                            Checkout
                        </div>
                    </button>
                )}

                {/* Existing Controls (if any, typically settings or close) */}
            </div>

            {/* Main Content */}
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

                {/* Top Bar - Minimal */}
                <div className="absolute top-0 right-0 z-50 p-4">
                    <button
                        onClick={() => window.location.reload()}
                        className="w-10 h-10 flex items-center justify-center bg-white/40 backdrop-blur-sm rounded-full hover:bg-white/60 transition-all"
                    >
                        <X className="w-5 h-5 text-gray-700" />
                    </button>
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

                        {/* AARAV: Decision Frame - Persona-specific context before products */}
                        {currentResponse.decision_frame && (
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-4 border border-blue-100">
                                <p className="text-blue-800 font-medium text-center">
                                    💡 {currentResponse.decision_frame}
                                </p>
                            </div>
                        )}

                        {/* Product Recommendations */}
                        {!currentResponse.primary_recommendation ? (
                            <div className="flex flex-col items-center justify-center p-8 text-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
                                <span className="text-4xl mb-4">🔍</span>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No matching products found</h3>
                                <p className="text-gray-500 max-w-sm">
                                    I've confirmed your visual preference, but I couldn't find exact products in our catalog for this specific intent yet.
                                </p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl shadow-sm border border-border p-4 mb-4 transform transition-all hover:scale-[1.01]">
                                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                    Best Match
                                </h4>
                                <div className="flex gap-4">
                                    <div className="relative w-32 h-32 flex-shrink-0 bg-gray-50 rounded-lg overflow-hidden border">
                                        <img
                                            src={currentResponse.primary_recommendation.image_url}
                                            alt={currentResponse.primary_recommendation.title}
                                            className="w-full h-full object-contain p-2"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-semibold text-lg leading-tight">
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
                                            onClick={() => handleAddToCart(currentResponse.primary_recommendation)}
                                        >
                                            Add to Cart
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Status Indicator - Listening/Thinking (Only show if NOT in results mode) */}
                    {currentResponse?.response_type !== 'recommendation' && (
                        <StatusIndicator
                            status={
                                isRecording ? 'listening' :
                                    (agentState === 'thinking' && isProcessing) ? 'thinking' :
                                        null
                            }
                        />
                    )}

                    {/* Entry State - Welcome Message */}
                    {isEntryState && (
                        <div className="mt-8 text-center animate-fade-in-up">
                            <h1 className="text-2xl font-medium text-gray-800 mb-2">
                                How can I help
                                <br />
                                you today?
                            </h1>
                        </div>
                    )}

                    {/* Live Transcription Capsule */}
                    {currentTranscript && (
                        <TranscriptionCapsule
                            text={currentTranscript}
                            isActive={isRecording}
                            onComplete={() => { }}
                        />
                    )}

                    {/* Agent Message (dynamic transcript) */}
                    {agentMessage && !isEntryState && (
                        <AgentTranscript
                            text={agentMessage}
                            isTalking={agentState === 'talking'}
                        />
                    )}

                    {/* Product Carousel */}
                    {hasProducts && (
                        <div className="w-full mt-2">
                            <ProductCarousel
                                products={[
                                    currentResponse.primary_recommendation,
                                    ...(currentResponse.secondary_recommendations || [])
                                ].filter(Boolean).map(p => ({
                                    id: p.product_id,
                                    title: p.title,
                                    price: p.price,
                                    image_url: p.image_url,
                                    variant_id: p.variant_id
                                }))}
                                onAddToCart={handleAddToCart}
                            />
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
                                                        onClick={() => handleAddToCart(product)}
                                                    >
                                                        Add to Cart
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {/* Bottom Row: 1 Image (Centered) */}
                                {generatedImages[2] && (
                                    <div className="w-full flex justify-center h-[140px]">
                                        <div
                                            className={`
                                                w-[calc(50%-6px)] relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200
                                                ${selectedImageVariant === generatedImages[2].variant_id ? 'ring-4 ring-white shadow-xl scale-105 z-10' : 'hover:opacity-90'}
                                            `}
                                            onClick={() => setSelectedImageVariant(generatedImages[2].variant_id)}
                                        >
                                            <img src={generatedImages[2].url} className="w-full h-full object-cover bg-gray-200" alt="Generated variation" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Control Buttons */}
                            <div className="flex flex-row gap-3 mt-8 w-full max-w-[340px] px-2">
                                <button
                                    onClick={() => handleImageSelection('accept', selectedImageVariant)}
                                    className="flex-1 py-3 bg-white/70 backdrop-blur-sm hover:bg-white/90 text-gray-800 rounded-2xl font-medium shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95 text-sm"
                                >
                                    <RotateCw className="w-4 h-4" />
                                    This is the one!
                                </button>
                                <button
                                    onClick={() => handleImageSelection('reject')}
                                    className="flex-1 py-3 bg-white/40 backdrop-blur-sm hover:bg-white/60 text-gray-700 rounded-2xl font-medium shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95 text-sm"
                                >
                                    <RefreshCcw className="w-4 h-4" />
                                    Retry
                                </button>
                            </div>
                        </div>
                    )}

            {/* Checkout Modal */}
            <CheckoutModal
                isOpen={isCheckoutOpen}
                onClose={() => setIsCheckoutOpen(false)}
                cartItems={cartItems}
                onOrderSuccess={handleOrderSuccess}
            />
        </div>
    );
}
