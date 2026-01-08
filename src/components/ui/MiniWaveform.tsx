"use client";

import { useEffect, useState } from 'react';

export function MiniWaveform() {
    return (
        <div className="bg-white/40 backdrop-blur-md rounded-full px-8 py-4 flex items-center justify-center gap-1.5 shadow-sm animate-fade-in-down">
            {[...Array(11)].map((_, i) => (
                <div
                    key={i}
                    className="w-1 bg-[#A78BFA] rounded-full animate-wave"
                    style={{
                        height: [16, 24, 12, 32, 20, 28, 16, 24, 32, 12, 20][i] + 'px',
                        opacity: i === 0 || i === 10 ? 0.3 : i === 1 || i === 9 ? 0.6 : 1, // Fade edges
                        animationDelay: `${i * 0.1}s`,
                        animationDuration: '1.2s'
                    }}
                />
            ))}
        </div>
    );
}
