'use client';

import { useEffect, useState } from 'react';
import { Mic, X } from 'lucide-react';
import { VoiceOrb } from './VoiceOrb';

interface EntryGreetingProps {
    onClose?: () => void;
    onMicClick: () => void;
}

export function EntryGreeting({ onClose, onMicClick }: EntryGreetingProps) {
    const [showText, setShowText] = useState(false);
    const [showOrb, setShowOrb] = useState(false);

    useEffect(() => {
        // Text fades in first
        const textTimer = setTimeout(() => setShowText(true), 300);
        // Orb appears after text
        const orbTimer = setTimeout(() => setShowOrb(true), 800);

        return () => {
            clearTimeout(textTimer);
            clearTimeout(orbTimer);
        };
    }, []);

    return (
        <div className="voice-ui-wrapper">
            <div className="voice-content-card">
                {/* Close button */}
                {onClose && (
                    <button
                        onClick={onClose}
                        className="voice-close-btn"
                        aria-label="Close"
                    >
                        <X size={24} strokeWidth={2} />
                    </button>
                )}

                {/* Centered content */}
                <div className="voice-empty-state">
                    {/* Sparkle icon */}
                    <div className={showText ? 'fade-in' : 'opacity-0'} style={{ transition: 'opacity 0.6s' }}>
                        <svg width="47" height="45" viewBox="0 0 47 45" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M23.306 0L26.3765 17.1628L43.5393 14.0923L26.3765 17.1628L29.447 34.3256L26.3765 17.1628L9.21367 14.0923L26.3765 17.1628L23.306 0Z" fill="black" />
                            <path d="M9.21367 20.233L11.2489 31.2551L22.271 29.2198L11.2489 31.2551L13.2841 42.2772L11.2489 31.2551L0.226807 29.2198L11.2489 31.2551L9.21367 20.233Z" fill="black" />
                            <path d="M36.3633 20.233L38.3985 31.2551L46.8516 29.5318L38.3985 31.2551L40.1218 42.2772L38.3985 31.2551L29.9454 29.5318L38.3985 31.2551L36.3633 20.233Z" fill="black" />
                        </svg>
                    </div>

                    {/* Greeting text */}
                    <div className={showText ? 'fade-in-delay' : 'opacity-0'}>
                        <h2>How can I help<br />you today?</h2>
                    </div>

                    {/* Voice Orb */}
                    {showOrb && (
                        <div style={{ marginTop: '48px' }}>
                            <VoiceOrb state="idle" />
                        </div>
                    )}
                </div>

                {/* Bottom mic button */}
                <div style={{ marginTop: 'auto', paddingTop: '32px', paddingBottom: '32px' }}>
                    <button
                        onClick={onMicClick}
                        className="voice-mic-button"
                        aria-label="Start voice input"
                    >
                        <Mic size={24} strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </div>
    );
}
