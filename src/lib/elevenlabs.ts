/**
 * ElevenLabs Integration Module
 * 
 * Provides speech-to-text and text-to-speech capabilities using ElevenLabs API.
 * Calls are proxied through Next.js API routes to avoid CORS issues.
 * 
 * CRITICAL: This module only handles audio I/O.
 * NO business logic, NO intent detection, NO routing decisions.
 */

interface ElevenLabsConfig {
    voiceId?: string; // Default voice for TTS
}

let config: ElevenLabsConfig = {
    voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel - default female voice
};

/**
 * Initialize ElevenLabs configuration
 */
export function initElevenLabs(apiKey: string, voiceId?: string) {
    // API key is now handled server-side, so we only store voice ID
    config = {
        voiceId: voiceId || '21m00Tcm4TlvDq8ikWAM',
    };
}

/**
 * Speech-to-Text using ElevenLabs Scribe API (via Next.js API route)
 * 
 * @param audioBlob - Audio recording blob
 * @returns Transcribed text
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
    try {
        // Create FormData for multipart upload
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        // Call Next.js API route (avoids CORS)
        const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `Transcription failed: ${response.status}`);
        }

        const data = await response.json();
        const transcribedText = data.text;

        if (!transcribedText) {
            throw new Error('No transcription returned');
        }

        return transcribedText.trim();

    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Transcription failed: ${error.message}`);
        }
        throw new Error('Transcription failed: Unknown error');
    }
}

/**
 * Text-to-Speech using ElevenLabs TTS API (via Next.js API route)
 * 
 * @param text - Text to convert to speech
 * @param voiceIdOverride - Optional voice ID to use instead of default
 * @returns Audio blob (MP3 format)
 */
export async function textToSpeech(
    text: string,
    voiceIdOverride?: string
): Promise<Blob> {
    const voiceId = voiceIdOverride || config.voiceId;

    try {
        // Call Next.js API route (avoids CORS)
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text,
                voiceId,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `Text-to-speech failed: ${response.status}`);
        }

        // Return audio blob (MP3)
        const audioBlob = await response.blob();
        return audioBlob;

    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Text-to-speech failed: ${error.message}`);
        }
        throw new Error('Text-to-speech failed: Unknown error');
    }
}

/**
 * Check if browser supports audio recording
 */
export function isAudioRecordingSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/**
 * Check if browser supports audio playback
 */
export function isAudioPlaybackSupported(): boolean {
    return typeof Audio !== 'undefined';
}

