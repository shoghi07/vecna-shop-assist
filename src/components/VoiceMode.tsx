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
import CheckoutModal from './CheckoutModal';
import { ShoppingBag } from 'lucide-react';
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
        // Mark as mounted to prevent hydration mismatch
        setIsMounted(true);

        // Initialize ElevenLabs
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
                    variant_id: item.id,
                    title: item.title,
                    quantity: item.quantity
                })),
                address: DEFAULT_DELIVERY_ADDRESS // Send default address for order placement
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

            // PHASE 3: Handle image generation response
            if (response.response_type === 'image_generation') {
                setGeneratedImages(response.images);
                setImageConfirmationPhase(true);

                // Phase 4: Store cached products if provided
                if ((response as any).cached_products) {
                    setCachedProducts((response as any).cached_products);
                    console.log('⚡ Cached products stored:', (response as any).cached_products.length);
                }

                // Speak the acknowledgement
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

            // Generate and play TTS
            // For recommendations, speak BOTH acknowledgement AND explanation
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
            throw error; // Re-throw to caller
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

    // PHASE 3: Handle image selection (accept, refine, reject)
    const handleImageSelection = async (
        action: 'accept' | 'refine' | 'reject',
        variantId?: string | null
    ) => {
        console.log('👇 handleImageSelection called:', { action, variantId, sessionId });
        setIsProcessing(true);
        if (action === 'accept' && variantId) {
            // User accepted - proceed to products
            try {
                const response = await sendMessageToBackend({
                    session_id: sessionId,
                    current_message: `I selected variant ${variantId}`,
                    chat_history: chatHistory,
                    action: 'accept_image',
                    selected_variant: variantId,
                    intent_id: currentResponse?.intent_id, // Pass existing intent context
                    cached_products: cachedProducts, // Phase 4: Send pre-fetched products
                    last_products: [],
                    cart_items: cartItems.map(item => ({
                        variant_id: item.id,
                        title: item.title,
                        quantity: item.quantity
                    })),
                    address: DEFAULT_DELIVERY_ADDRESS
                } as any);
                if (response.response_type === 'recommendation') {
                    // Show products!
                    setCurrentResponse(response);
                    setImageConfirmationPhase(false);
                    setSelectedImageVariant(null);
                    // Phase 4: Clear cached products after use
                    setCachedProducts([]);

                    // Phase 5: Reset clarification count on success
                    setClarificationCount(0);
                    // Speak confirmation
                    await playTTS("Perfect! Here are products that match this outcome.");
                    // Add to history
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
            // Phase 5: User wants more specific intent clarification
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
            // Phase 5: User's intent isn't captured - ask clarifying question
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
        <div className="voice-ui-wrapper">
            <div className="voice-content-card">
                {/* Close button - top right */}
                <button
                    className="voice-close-btn"
                    onClick={() => window.history.back()}
                    aria-label="Close"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>

                {/* Cart button in top right */}
                {cartQuantity > 0 && (
                    <button
                        onClick={() => setIsCheckoutOpen(true)}
                        className="absolute top-4 right-16 z-50 p-3 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 rounded-full transition-all"
                        title="View Cart & Checkout"
                    >
                        <ShoppingBag className="w-5 h-5" />
                        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                            {cartQuantity}
                        </span>
                    </button>
                )}

                {/* Main Content */}
                <div className="flex-1 flex flex-col items-center justify-center px-6">
                    {/* Show sparkle icon only when no conversation started */}
                    {chatHistory.length === 0 && (
                        <div className="mb-6 fade-in" style={{ animationDelay: '0.2s' }}>
                            <svg width="47" height="45" viewBox="0 0 47 45" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.9 }}>
                                <path d="M23.306 0L26.3765 17.1628L43.5393 14.0923L26.3765 17.1628L29.447 34.3256L26.3765 17.1628L9.21367 14.0923L26.3765 17.1628L23.306 0Z" fill="black" />
                                <path d="M9.21367 20.233L11.2489 31.2551L22.271 29.2198L11.2489 31.2551L13.2841 42.2772L11.2489 31.2551L0.226807 29.2198L11.2489 31.2551L9.21367 20.233Z" fill="black" />
                                <path d="M36.3633 20.233L38.3985 31.2551L46.8516 29.5318L38.3985 31.2551L40.1218 42.2772L38.3985 31.2551L29.9454 29.5318L38.3985 31.2551L36.3633 20.233Z" fill="black" />
                            </svg>
                        </div>
                    )}

                    {/* Greeting text - only show when no conversation */}
                    {chatHistory.length === 0 && (
                        <div className="text-center mb-8 fade-in-delay">
                            <h2 className="text-3xl font-semibold mb-2" style={{ color: '#1a1a1a' }}>
                                How can I help<br />you today?
                            </h2>
                        </div>
                    )}

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
                    <div className="mt-8 text-center">
                        {chatHistory.length === 0 ? (
                            <div className="space-y-3">
                                <p className="text-base text-gray-600">
                                    Tap the orb and start speaking
                                </p>
                                <p className="text-sm text-gray-500">
                                    Tap again when you're done
                                </p>
                            </div>
                        ) : (
                            <>
                                <p className="text-lg font-medium mb-3">
                                    {isRecording && "Listening..."}
                                    {agentState === 'thinking' && "Thinking..."}
                                    {agentState === 'talking' && "Speaking..."}
                                    {!isRecording && !isProcessing && "Tap to speak"}
                                </p>
                                {/* Last message preview in capsule style */}
                                <div className="transcript-capsule max-w-md mx-auto">
                                    {chatHistory[chatHistory.length - 1].content.substring(0, 100)}
                                    {chatHistory[chatHistory.length - 1].content.length > 100 && '...'}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Product Recommendations Section */}
                {currentResponse && currentResponse.response_type === 'recommendation' && (
                    <div className="flex-1 overflow-y-auto px-4 pb-8">
                        <div className="max-w-4xl mx-auto space-y-6">
                            {/* Acknowledgement */}
                            <div className="text-center mb-4">
                                <p className="text-gray-700 italic text-sm">
                                    "{currentResponse.acknowledgement}"
                                </p>
                            </div>

                            {/* AARAV: Decision Frame - Persona-specific context before products */}
                            {currentResponse.decision_frame && (
                                <div className="bg-blue-50/60 backdrop-blur-sm rounded-2xl p-4 mb-6 border border-blue-200/50">
                                    <p className="text-blue-900 font-medium text-center text-sm">
                                        💡 {currentResponse.decision_frame}
                                    </p>
                                </div>
                            )}

                            {/* Product Recommendations - Horizontal Carousel */}
                            {!currentResponse.primary_recommendation ? (
                                <div className="voice-empty-state py-12">
                                    <span className="text-4xl mb-4">🔍</span>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">No matching products found</h3>
                                    <p className="text-gray-500 max-w-sm text-sm">
                                        I've confirmed your visual preference, but I couldn't find exact products in our catalog for this specific intent yet.
                                    </p>
                                </div>
                            ) : (
                                <div className="product-carousel mb-6">
                                    {/* Primary Recommendation */}
                                    <div className="product-card" style={{ animationDelay: '0.1s' }}>
                                        <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                                            Best Match
                                        </div>
                                        <img
                                            src={currentResponse.primary_recommendation.image_url}
                                            alt={currentResponse.primary_recommendation.title}
                                            className="w-full h-48 object-contain bg-white rounded-xl mb-3 p-4"
                                        />
                                        <h3 className="product-card-title line-clamp-2">
                                            {currentResponse.primary_recommendation.title}
                                        </h3>
                                        <p className="product-card-price mb-3">
                                            {currentResponse.primary_recommendation.price}
                                        </p>
                                        {currentResponse.primary_recommendation.reasoning && (
                                            <p className="text-xs text-gray-600 italic mb-3 line-clamp-2">
                                                {currentResponse.primary_recommendation.reasoning}
                                            </p>
                                        )}
                                        <button
                                            className="w-full bg-gray-900 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-gray-800 transition-colors"
                                            onClick={() => handleAddToCart(currentResponse.primary_recommendation)}
                                        >
                                            Add to Cart
                                        </button>
                                    </div>

                                    {/* Secondary Recommendations */}
                                    {currentResponse.secondary_recommendations && currentResponse.secondary_recommendations.map((product: any, idx: number) => (
                                        <div key={product.product_id} className="product-card" style={{ animationDelay: `${0.2 + idx * 0.1}s` }}>
                                            <img
                                                src={product.image_url}
                                                alt={product.title}
                                                className="w-full h-48 object-contain bg-white rounded-xl mb-3 p-4"
                                            />
                                            <h3 className="product-card-title line-clamp-2">
                                                {product.title}
                                            </h3>
                                            <p className="product-card-price mb-4">
                                                {product.price}
                                            </p>
                                            <button
                                                className="w-full bg-gray-100 text-gray-900 py-2.5 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                                                onClick={() => handleAddToCart(product)}
                                            >
                                                Add to Cart
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* PHASE 3: Image Confirmation Modal */}
                {imageConfirmationPhase && generatedImages.length > 0 && (
                    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 sm:p-8">
                        <div className="max-w-6xl w-full">
                            {/* Header */}
                            <div className="text-center mb-8">
                                <h2 className="text-3xl font-bold text-white mb-2">
                                    Which visual matches your goal?
                                </h2>
                                <p className="text-gray-400">
                                    Select the one that best represents what you want to achieve
                                </p>
                            </div>
                            {/* Image Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                {generatedImages.map((img) => (
                                    <div
                                        key={img.variant_id}
                                        className={`cursor-pointer rounded-lg overflow-hidden transition-all ${selectedImageVariant === img.variant_id
                                            ? 'ring-4 ring-blue-500 scale-105 shadow-2xl'
                                            : 'hover:scale-102 hover:ring-2 ring-white/20'
                                            }`}
                                        onClick={() => setSelectedImageVariant(img.variant_id)}
                                    >
                                        <img
                                            src={img.url}
                                            alt={img.caption}
                                            className="w-full aspect-square object-cover bg-gray-800"
                                        />
                                        <div className="bg-gray-900 p-4">
                                            <p className="text-white font-medium mb-1">{img.caption}</p>
                                            <p className="text-gray-400 text-sm">{img.interpretation}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <button
                                    onClick={() => handleImageSelection('accept', selectedImageVariant)}
                                    disabled={!selectedImageVariant || isProcessing}
                                    className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition"
                                >
                                    ✓ This one!
                                </button>
                                <button
                                    onClick={() => handleImageSelection('refine')}
                                    disabled={isProcessing}
                                    className="px-8 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition"
                                >
                                    🔄 Adjust these
                                </button>
                                <button
                                    onClick={() => handleImageSelection('reject')}
                                    disabled={isProcessing}
                                    className="px-8 py-3 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 transition"
                                >
                                    ❌ None of these
                                </button>
                            </div>
                        </div>
                    </div>
                )
                }

                {/* Checkout Modal */}
                <CheckoutModal
                    isOpen={isCheckoutOpen}
                    onClose={() => setIsCheckoutOpen(false)}
                    cartItems={cartItems}
                    onOrderSuccess={handleOrderSuccess}
                />
            </div>
        </div>
    );
}
