"use client";

import { useEffect, useState } from 'react';

interface StatusIndicatorProps {
    status: 'listening' | 'thinking' | null;
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
    const [dots, setDots] = useState('');

    // Animated dots effect
    useEffect(() => {
        if (!status) return;

        const interval = setInterval(() => {
            setDots(prev => {
                if (prev === '...') return '';
                return prev + '.';
            });
        }, 500);

        return () => clearInterval(interval);
    }, [status]);

    if (!status) return null;

    const text = status === 'listening' ? 'Listening' : 'Thinking';

    return (
        <div className="flex items-center justify-center mt-4 animate-fade-in">
            <p
                className="text-center animate-pulse"
                style={{
                    color: '#666',
                    fontFamily: 'Figtree, sans-serif',
                    fontSize: '14px',
                    fontWeight: 400,
                    lineHeight: '140%',
                    letterSpacing: '-0.3px',
                }}
            >
                {text}{dots}
            </p>
        </div>
    );
}
