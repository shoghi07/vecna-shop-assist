"use client";

import { useEffect, useState, useMemo, useRef } from 'react';

interface AgentTranscriptProps {
    text: string;
    isTalking: boolean;
}

export function AgentTranscript({ text, isTalking }: AgentTranscriptProps) {
    const [displayedSentences, setDisplayedSentences] = useState<{ text: string, isComplete: boolean }[]>([]);

    // Split text into sentences for processing
    const allSentences = useMemo(() => {
        if (!text) return [];
        // Match sentences ending in ., !, or ? or end of string
        const match = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
        return match ? match.map(s => s.trim()) : [text];
    }, [text]);

    // Refs for animation state
    const stateRef = useRef({
        sentenceIndex: 0,
        charIndex: 0,
        currentSentence: '',
        mounted: false
    });

    // Reset when text changes or starts talking
    useEffect(() => {
        if (text && isTalking) {
            // New utterance - reset everything
            stateRef.current = {
                sentenceIndex: 0,
                charIndex: 0,
                currentSentence: allSentences[0] || '',
                mounted: true
            };
            setDisplayedSentences([{ text: '', isComplete: false }]);
        } else if (text && !isTalking) {
            // If not talking but text exists, show complete text immediately
            setDisplayedSentences(allSentences.map(s => ({ text: s, isComplete: true })));
        }
    }, [text, isTalking, allSentences]);

    useEffect(() => {
        if (!isTalking || !text) return;

        let timeoutId: NodeJS.Timeout;

        const animate = () => {
            const state = stateRef.current;

            if (state.sentenceIndex >= allSentences.length) {
                return; // Done with all sentences
            }

            const currentSentence = allSentences[state.sentenceIndex];

            // If we've finished the current sentence
            if (state.charIndex >= currentSentence.length) {
                // Mark current sentence as complete
                setDisplayedSentences(prev => {
                    const newArr = [...prev];
                    if (newArr[state.sentenceIndex]) {
                        newArr[state.sentenceIndex].isComplete = true;
                    }
                    return newArr;
                });

                // Move to next sentence
                state.sentenceIndex++;
                state.charIndex = 0;

                if (state.sentenceIndex < allSentences.length) {
                    state.currentSentence = allSentences[state.sentenceIndex];
                    // Add placeholder for next sentence
                    setDisplayedSentences(prev => [...prev, { text: '', isComplete: false }]);
                    // Pause between sentences (400ms)
                    timeoutId = setTimeout(animate, 400);
                }
                return;
            }

            // Reveal next character
            state.charIndex++;

            setDisplayedSentences(prev => {
                const newArr = [...prev];
                if (newArr[state.sentenceIndex]) {
                    newArr[state.sentenceIndex] = {
                        ...newArr[state.sentenceIndex],
                        text: currentSentence.substring(0, state.charIndex)
                    };
                }
                return newArr;
            });

            // Character-by-character timing
            // Faster characters (30-50ms) create smoother flow than word-by-word
            // Adjust based on character type for natural rhythm
            const char = currentSentence[state.charIndex - 1];
            let delay = 35; // Base delay

            if (char === ' ') delay = 50; // Slight pause at spaces
            else if (['.', '!', '?'].includes(char)) delay = 200; // Longer pause at sentence endings
            else if ([',', ';', ':'].includes(char)) delay = 100; // Medium pause at punctuation

            timeoutId = setTimeout(animate, delay);
        };

        // Start animation loop
        animate();

        return () => clearTimeout(timeoutId);
    }, [isTalking, text, allSentences]);

    if (!text) return null;

    const activeIndex = stateRef.current.sentenceIndex;
    const effectiveIndex = Math.min(activeIndex, allSentences.length - 1);

    // Combine all displayed sentences into a single text string
    const displayedText = displayedSentences
        .filter((_, index) => index <= effectiveIndex)
        .map(s => s.text)
        .join(' ');

    return (
        <div className="flex flex-col items-center justify-center mt-6 max-w-[90%] mx-auto min-h-[60px] transition-all duration-300">
            <p
                className="text-center transition-all duration-500 ease-out"
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
                {displayedText}
            </p>
        </div>
    );
}
