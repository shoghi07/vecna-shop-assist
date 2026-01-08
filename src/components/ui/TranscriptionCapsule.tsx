"use client"

import { useEffect, useState } from 'react';

interface TranscriptionCapsuleProps {
    text: string;
    isActive: boolean;
    onComplete?: () => void;
}

export function TranscriptionCapsule({
    text,
    isActive,
    onComplete
}: TranscriptionCapsuleProps) {
    // Handle completion - trigger callback immediately if provided
    useEffect(() => {
        if (!isActive && text.length > 0 && onComplete) {
            onComplete();
        }
    }, [isActive, text, onComplete]);

    if (!text) return null;

    return (
        <div
            className={`
        max-w-[85%] mx-auto mt-6 px-4 py-2
        transition-all duration-300 ease-out
        animate-fade-in-up
      `}
        >
            <p
                className="text-center"
                style={{
                    color: '#000',
                    fontFamily: 'Figtree, sans-serif',
                    fontSize: '16px',
                    fontWeight: 400,
                    lineHeight: '140%',
                    letterSpacing: '-0.5px',
                    fontFeatureSettings: '"liga" off, "clig" off'
                }}
            >
                {text}
            </p>
        </div>
    );
}
