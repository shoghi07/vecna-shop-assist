/**
 * Voice Input Component
 * 
 * CRITICAL: This component only captures audio and transcribes to text.
 * NO business logic, NO direct backend communication.
 * 
 * Responsibilities (ALLOWED):
 * - Capture audio from microphone
 * - Send audio to transcription service
 * - Return transcribed text via callback
 * 
 * NOT Allowed:
 * - Sending to backend directly
 * - Modifying transcribed text
 * - Adding voice metadata to backend payload
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { transcribeAudio, isAudioRecordingSupported, initElevenLabs } from '@/lib/elevenlabs';
import { config } from '@/config';
import { toast } from 'sonner';

interface VoiceInputProps {
    onTranscriptionComplete: (text: string) => void;
    disabled?: boolean;
}

export function VoiceInput({ onTranscriptionComplete, disabled }: VoiceInputProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // State for browser support check
    const [isSupported, setIsSupported] = useState(false);

    useEffect(() => {
        // Initialize ElevenLabs with API key
        if (config.elevenlabs.apiKey) {
            initElevenLabs(config.elevenlabs.apiKey, config.elevenlabs.voiceId);
        }
        setIsSupported(isAudioRecordingSupported());
    }, []);

    // Don't render if not supported (or during SSR)
    if (!isSupported) {
        return null; // Don't render if not supported
    }

    const startRecording = async () => {
        try {
            // Request microphone permission
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Create MediaRecorder
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            // Collect audio data
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            // Handle recording stop
            mediaRecorder.onstop = async () => {
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());

                // Create audio blob
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

                // Transcribe
                await handleTranscription(audioBlob);
            };

            // Start recording
            mediaRecorder.start();
            setIsRecording(true);

            // Auto-stop after max duration
            recordingTimeoutRef.current = setTimeout(() => {
                if (mediaRecorderRef.current?.state === 'recording') {
                    stopRecording();
                    toast.info('Recording stopped (60s max)');
                }
            }, config.voice.maxRecordingDuration);

        } catch (error) {
            console.error('Microphone access error:', error);
            toast.error('Microphone access required');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);

            // Clear timeout
            if (recordingTimeoutRef.current) {
                clearTimeout(recordingTimeoutRef.current);
                recordingTimeoutRef.current = null;
            }
        }
    };

    const handleTranscription = async (audioBlob: Blob) => {
        setIsTranscribing(true);

        try {
            const transcribedText = await transcribeAudio(audioBlob);

            if (!transcribedText || transcribedText.trim() === '') {
                toast.error("Didn't catch that. Try again?");
                return;
            }

            // Call callback with transcribed text
            onTranscriptionComplete(transcribedText);

        } catch (error) {
            console.error('Transcription error:', error);
            toast.error('Transcription failed. Try again?');
        } finally {
            setIsTranscribing(false);
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    return (
        <Button
            onClick={toggleRecording}
            disabled={disabled || isTranscribing}
            size="icon"
            variant={isRecording ? 'destructive' : 'outline'}
            className="h-auto aspect-square"
            type="button"
        >
            {isTranscribing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : isRecording ? (
                <MicOff className="w-4 h-4 animate-pulse" />
            ) : (
                <Mic className="w-4 h-4" />
            )}
        </Button>
    );
}
