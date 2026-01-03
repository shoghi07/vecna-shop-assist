/**
 * Audio Player Component
 * 
 * Plays text-to-speech audio from assistant responses using ElevenLabs.
 * 
 * CRITICAL: This component only handles audio playback.
 * NO business logic, NO message manipulation.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX, Loader2, Pause, Play } from 'lucide-react';
import { textToSpeech, isAudioPlaybackSupported, initElevenLabs } from '@/lib/elevenlabs';
import { config } from '@/config';
import { toast } from 'sonner';

interface AudioPlayerProps {
    text: string; // Text to convert to speech
    autoPlay?: boolean; // Auto-play when text changes
    className?: string;
}

export function AudioPlayer({ text, autoPlay = false, className = '' }: AudioPlayerProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isSupported, setIsSupported] = useState(false);

    useEffect(() => {
        // Initialize ElevenLabs
        if (config.elevenlabs.apiKey) {
            initElevenLabs(config.elevenlabs.apiKey, config.elevenlabs.voiceId);
        }
        setIsSupported(isAudioPlaybackSupported());
    }, []);

    useEffect(() => {
        // Auto-generate and play when text changes
        if (autoPlay && text && text.trim()) {
            handleGenerateAndPlay();
        }
        // Cleanup old audio URL when text changes
        return () => {
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, [text, autoPlay]);

    const handleGenerateAndPlay = async () => {
        if (!text || text.trim() === '') {
            toast.error('No text to play');
            return;
        }

        setIsGenerating(true);

        try {
            // Generate audio
            const audioBlob = await textToSpeech(text);

            // Create audio URL
            const url = URL.createObjectURL(audioBlob);
            setAudioUrl(url);

            // Create and play audio
            const audio = new Audio(url);
            audioRef.current = audio;

            audio.onended = () => {
                setIsPlaying(false);
            };

            audio.onerror = () => {
                toast.error('Audio playback failed');
                setIsPlaying(false);
            };

            await audio.play();
            setIsPlaying(true);

        } catch (error) {
            console.error('TTS error:', error);
            toast.error('Voice generation failed');
        } finally {
            setIsGenerating(false);
        }
    };

    const togglePlayback = () => {
        if (!audioRef.current) {
            // No audio yet, generate and play
            handleGenerateAndPlay();
            return;
        }

        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play();
            setIsPlaying(true);
        }
    };

    const stopPlayback = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setIsPlaying(false);
        }
    };

    // Don't render if not supported
    if (!isSupported || !config.elevenlabs.apiKey) {
        return null;
    }

    return (
        <Button
            onClick={togglePlayback}
            disabled={isGenerating}
            size="icon"
            variant="ghost"
            className={`h-8 w-8 ${className}`}
            type="button"
            title={isPlaying ? "Pause audio" : "Play audio"}
        >
            {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
                <Pause className="w-4 h-4" />
            ) : (
                <Volume2 className="w-4 h-4" />
            )}
        </Button>
    );
}
