'use client';

import { useEffect, useState } from 'react';

type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VoiceOrbProps {
    state?: OrbState;
    audioLevel?: number; // 0-1 for speaking animation
}

export function VoiceOrb({ state = 'idle', audioLevel = 0 }: VoiceOrbProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <div className={`voice-orb-container ${mounted ? 'mounted' : ''}`}>
            <div className={`voice-orb state-${state}`}>
                {/* Inner glow effect */}
                <div className="orb-glow" />

                {/* Waveform effect for listening/speaking */}
                {(state === 'listening' || state === 'speaking') && (
                    <div className="orb-waveform">
                        {[...Array(3)].map((_, i) => (
                            <div
                                key={i}
                                className="wave-bar"
                                style={{
                                    animationDelay: `${i * 0.15}s`,
                                    height: state === 'speaking' ? `${30 + audioLevel * 40}%` : '40%'
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

            <style jsx>{`
                .voice-orb-container {
                    position: relative;
                    width: 120px;
                    height: 120px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    transform: scale(0.8);
                    transition: opacity 0.6s ease-out, transform 0.6s ease-out;
                }

                .voice-orb-container.mounted {
                    opacity: 1;
                    transform: scale(1);
                }

                .voice-orb {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #A8C5F5 0%, #6B9FE8 100%);
                    box-shadow: 
                        0 8px 32px rgba(107, 159, 232, 0.3),
                        0 2px 8px rgba(0, 0, 0, 0.1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                }

                /* Idle state - gentle pulse */
                .voice-orb.state-idle {
                    animation: gentlePulse 4s ease-in-out infinite;
                }

                /* Listening state - slight expansion */
                .voice-orb.state-listening {
                    animation: listening 2s ease-in-out infinite;
                }

                /* Thinking state - breathing effect */
                .voice-orb.state-thinking {
                    animation: breathing 2s ease-in-out infinite;
                }

                /* Speaking state - stable with waveform */
                .voice-orb.state-speaking {
                    animation: none;
                }

                .orb-glow {
                    position: absolute;
                    inset: 10%;
                    border-radius: 50%;
                    background: radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, transparent 70%);
                    opacity: 0.8;
                }

                .orb-waveform {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    height: 50%;
                }

                .wave-bar {
                    width: 3px;
                    background: rgba(255, 255, 255, 0.9);
                    border-radius: 2px;
                    animation: waveMotion 0.8s ease-in-out infinite;
                }

                @keyframes gentlePulse {
                    0%, 100% {
                        transform: scale(1);
                        opacity: 1;
                    }
                    50% {
                        transform: scale(1.04);
                        opacity: 0.95;
                    }
                }

                @keyframes listening {
                    0%, 100% {
                        transform: scale(1);
                    }
                    50% {
                        transform: scale(1.08);
                    }
                }

                @keyframes breathing {
                    0%, 100% {
                        transform: scale(1);
                        opacity: 1;
                    }
                    50% {
                        transform: scale(0.96);
                        opacity: 0.85;
                    }
                }

                @keyframes waveMotion {
                    0%, 100% {
                        height: 30%;
                    }
                    50% {
                        height: 60%;
                    }
                }
            `}</style>
        </div>
    );
}
