/**
 * Audio Transcription Service using Google Gemini API
 * 
 * CRITICAL: This service only converts audio to text.
 * NO business logic, NO intent detection, NO routing decisions.
 * 
 * Responsibilities:
 * - Accept audio blob
 * - Send to Gemini API for transcription
 * - Return plain text
 */

import { config } from '@/config';

/**
 * Convert audio blob to base64 for Gemini API
 */
async function audioBlobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Transcribe audio using Google Gemini API
 * 
 * @param audioBlob - Audio recording blob
 * @returns Transcribed text
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
    if (!config.voice.geminiApiKey) {
        throw new Error('Gemini API key not configured');
    }

    try {
        // Convert audio to base64
        const base64Audio = await audioBlobToBase64(audioBlob);

        // Determine MIME type
        const mimeType = audioBlob.type || 'audio/webm';

        // Gemini API request
        const response = await fetch(
            `${config.voice.geminiApiUrl}?key=${config.voice.geminiApiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: 'Transcribe this audio to text. Return only the transcribed text without any additional commentary or formatting.',
                                },
                                {
                                    inline_data: {
                                        mime_type: mimeType,
                                        data: base64Audio,
                                    },
                                },
                            ],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.1, // Low temperature for accurate transcription
                        maxOutputTokens: 1000,
                    },
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        // Extract transcribed text
        const transcribedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!transcribedText) {
            throw new Error('No transcription returned from Gemini');
        }

        // Return cleaned text (trim whitespace)
        return transcribedText.trim();

    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Transcription failed: ${error.message}`);
        }
        throw new Error('Transcription failed: Unknown error');
    }
}

/**
 * Check if browser supports audio recording
 */
export function isAudioRecordingSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}
