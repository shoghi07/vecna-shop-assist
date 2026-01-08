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
    const [currentResponse, setCurrentResponse] = useState<any>(null);
    const [cartItems, setCartItems] = useState<Array<{ variantId: string, title: string }>>([]);
    const [imageConfirmationPhase, setImageConfirmationPhase] = useState(false);
    const [generatedImages, setGeneratedImages] = useState<any[]>([]);
    const [selectedImageVariant, setSelectedImageVariant] = useState<string | null>(null);
    const [cachedProducts, setCachedProducts] = useState<any[]>([]);
    const [clarificationCount, setClarificationCount] = useState(0);

    // New UI state
    const [currentTranscript, setCurrentTranscript] = useState('');
    const [agentMessage, setAgentMessage] = useState('');
    const [quickReplies, setQuickReplies] = useState<string[]>([]);
    const [isTextMode, setIsTextMode] = useState(false);
    const [textInput, setTextInput] = useState('');

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

    // Reset text mode when we get a response (to show results clearly)
    useEffect(() => {
        if (currentResponse?.response_type === 'recommendation' || currentResponse?.response_type === 'image_generation') {
            setIsTextMode(false);
        }
    }, [currentResponse]);

    // Business logic methods (preserved from original)
    const handleAddToCart = async (variantId: string, productTitle: string) => {
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
                last_products: lastProducts,
                cart_items: cartItems.map(item => ({
                    variant_id: item.variantId,
                    title: item.title,
                    quantity: item.quantity
                })),
                address: DEFAULT_DELIVERY_ADDRESS
            } as any);

            // Handle cart action response
            if (response.response_type === 'cart_action') {
                await handleAddToCart(response.variant_id, response.product_title);
                setAgentMessage(response.acknowledgement);
                await playTTS(response.acknowledgement);
                setAgentState(null);
                setIsProcessing(false);
                return;
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
                    setClarificationCount(response.clarification_count || clarificationCount + 1);
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
        <GradientBackground>
            {/* Mobile Container - Portrait Only */}
            <div className="relative min-h-screen max-w-[390px] mx-auto flex flex-col overflow-hidden">

                {/* Top Bar - Minimal */}
                <div className="absolute top-0 right-0 z-50 p-4">
                    <button
                        onClick={() => window.location.reload()}
                        className="w-10 h-10 flex items-center justify-center bg-white/40 backdrop-blur-sm rounded-full hover:bg-white/60 transition-all"
                    >
                        <X className="w-5 h-5 text-gray-700" />
                    </button>
                </div>

                {/* Main Content Area */}
                <div className={`flex-1 flex flex-col items-center px-6 w-full ${currentResponse?.response_type === 'recommendation' || currentResponse?.response_type === 'image_generation' || imageConfirmationPhase
                    ? 'pt-4 pb-24 overflow-hidden h-full justify-center'
                    : 'pt-16 pb-24 overflow-y-auto scrollbar-hide'
                    }`}>

                    {/* Top Visual: Orb or Mini Waveform */}
                    <div className={`w-full flex justify-center transition-all duration-700 ease-in-out ${currentResponse?.response_type === 'recommendation' || currentResponse?.response_type === 'image_generation' || imageConfirmationPhase ? 'scale-90 -mt-8' : ''
                        }`}>
                        {currentResponse?.response_type === 'recommendation' || currentResponse?.response_type === 'image_generation' || imageConfirmationPhase ? (
                            <div
                                className="animate-fade-in-down cursor-pointer mb-1"
                                onClick={handleOrbTap}
                            >
                                <div className="w-[100px] h-[100px]">
                                    <Orb
                                        agentState={agentState}
                                        colors={["#D4E7FF", "#B8D4FF"]} // Purple tones
                                        volumeMode="auto"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className={`transition-all duration-700 ease-out ${isEntryState ? 'mt-32' : 'mt-12'}`}>
                                <div
                                    className="w-[200px] h-[200px] cursor-pointer transition-transform active:scale-95"
                                    onClick={handleOrbTap}
                                >
                                    <Orb
                                        agentState={agentState}
                                        colors={["#D4E7FF", "#B8D4FF"]} // Purple tones
                                        volumeMode="auto"
                                    />
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

                    {/* Image Confirmation Grid (New Design) */}
                    {imageConfirmationPhase && generatedImages.length > 0 && (
                        <div className="w-full mt-2 animate-fade-in-up flex flex-col items-center">

                            {/* Title */}


                            {/* Image Pyramid Grid */}
                            <div className="flex flex-col items-center gap-3 w-full max-w-[340px]">
                                {/* Top Row: 2 Images */}
                                <div className="flex gap-3 w-full h-[140px]">
                                    {generatedImages.slice(0, 2).map((img, idx) => (
                                        <div
                                            key={img.variant_id}
                                            className={`
                                                flex-1 relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200
                                                ${selectedImageVariant === img.variant_id ? 'ring-4 ring-white shadow-xl scale-105 z-10' : 'hover:opacity-90'}
                                            `}
                                            onClick={() => setSelectedImageVariant(img.variant_id)}
                                        >
                                            <img src={img.url} className="w-full h-full object-cover bg-gray-200" alt="Generated variation" />
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

                    {/* Quick Reply Chips (Only if NOT in results mode) */}
                    {quickReplies.length > 0 && currentResponse?.response_type !== 'recommendation' && (
                        <div className="w-full mt-auto">
                            <QuickReplyChips
                                options={quickReplies}
                                onSelect={handleQuickReply}
                                visible={!isProcessing}
                            />
                        </div>
                    )}

                    {/* Action Buttons for Results (Retry / Load More) */}
                    {currentResponse?.response_type === 'recommendation' && (
                        <div className="flex gap-3 mt-8 animate-fade-in-up">
                            <button
                                onClick={() => handleQuickReply('Retry suggestions')}
                                disabled={isProcessing}
                                className="flex items-center gap-2 px-5 py-3 bg-white/60 backdrop-blur-sm rounded-xl text-gray-800 font-medium hover:bg-white/80 active:scale-95 transition-all"
                            >
                                <RefreshCcw className="w-4 h-4" />
                                <span className="font-figtree text-sm">Retry suggestions</span>
                            </button>
                            <button
                                onClick={() => handleQuickReply('Load more')}
                                disabled={isProcessing}
                                className="flex items-center gap-2 px-5 py-3 bg-white/60 backdrop-blur-sm rounded-xl text-gray-800 font-medium hover:bg-white/80 active:scale-95 transition-all"
                            >
                                <RotateCw className="w-4 h-4" />
                                <span className="font-figtree text-sm">Load more</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Bottom Controls - Keyboard & Close Buttons */}
                <div className="fixed bottom-8 left-0 right-0 flex items-center justify-center gap-4 z-50 pointer-events-none">
                    {/* Container for buttons to enable pointer events only on children */}
                    <div className="flex items-center gap-4 pointer-events-auto">
                        {/* Keyboard Button - Left */}
                        <button
                            onClick={() => setIsTextMode(!isTextMode)}
                            className={`
                                w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center shadow-lg active:scale-90 transition-transform
                                ${isTextMode ? 'bg-white shadow-xl' : ''}
                            `}
                        >
                            <Keyboard className={`w-6 h-6 ${isTextMode ? 'text-gray-900' : 'text-white'}`} />
                        </button>

                        {/* Text Input Overlay (if active) */}
                        {isTextMode && (
                            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[90vw] max-w-md bg-white rounded-2xl p-2 shadow-2xl animate-fade-in-up flex items-center gap-2 pointer-events-auto">
                                <input
                                    autoFocus
                                    type="text"
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter' && !isProcessing) handleTextSubmit();
                                    }}
                                    placeholder="Ask anything..."
                                    className="flex-1 px-4 py-3 bg-transparent outline-none font-figtree text-lg"
                                />
                                <button
                                    onClick={handleTextSubmit}
                                    className="p-3 bg-gray-900 rounded-xl text-white active:scale-90 transition-transform"
                                >
                                    <ArrowRight className="w-5 h-5" />
                                </button>
                            </div>
                        )}

                        {/* Close/Mic Button - Right (Logic depends on state) */}
                        {isRecording ? (
                            <button
                                onClick={handleOrbTap}
                                className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center shadow-lg active:scale-90 transition-transform animate-pulse"
                            >
                                <div className="w-5 h-5 bg-white rounded-sm" />
                            </button>
                        ) : (
                            <button
                                onClick={hasProducts ? () => window.location.reload() : handleOrbTap}
                                className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                            >
                                {hasProducts ? (
                                    <X className="w-6 h-6 text-white" />
                                ) : (
                                    <Mic className="w-6 h-6 text-white" />
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Cart Counter - Top Right */}
                {cartItems.length > 0 && (
                    <div className="absolute top-4 left-4 z-50 bg-white/70 backdrop-blur-sm border border-gray-300/50 rounded-full p-2 shadow-sm">
                        <div className="relative">
                            <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                            <span className="absolute -top-2 -right-2 bg-gray-900 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                {cartItems.length}
                            </span>
                        </div>
                    </div>
                )}




            </div>
        </GradientBackground >
    );
}
