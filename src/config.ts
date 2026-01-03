/**
 * Application Configuration
 * 
 * IMPORTANT: This file contains only configuration values.
 * No business logic, no routing decisions, no intent detection.
 */

export const config = {
  // Backend orchestrator endpoint
  backend: {
    // Local orchestrator API route
    // Force relative path to avoid port mismatch (env var might be stale/3002)
    apiUrl: '/api/chat',
    // apiUrl: process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3000/api/chat',
  },

  // Supabase configuration
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  // Shopify integration
  shopify: {
    storeDomain: process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN || 'ladani-store-2.myshopify.com',
    cartApiUrl: process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN
      ? `https://${process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN}/cart/add.js`
      : 'https://ladani-store-2.myshopify.com/cart/add.js',
  },

  // Session configuration
  session: {
    // Generate new session ID on app load
    generateNewSessionOnLoad: true,
  },

  // Voice input configuration
  voice: {
    // Gemini API for transcription
    geminiApiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '',
    geminiApiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-exp:generateContent',

    // Auto-send after transcription?
    autoSendAfterTranscription: false, // User can review transcript first

    // Recording settings
    maxRecordingDuration: 60000, // 60 seconds max
  },

  // ElevenLabs configuration (voice I/O)
  elevenlabs: {
    apiKey: process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || '',
    voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel - default female voice
  },
} as const;
