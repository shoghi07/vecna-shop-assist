"use client"

import { useState, useEffect } from 'react';

interface QuickReplyChipsProps {
    options: string[];
    onSelect: (option: string) => void;
    visible?: boolean;
}

export function QuickReplyChips({
    options,
    onSelect,
    visible = true
}: QuickReplyChipsProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (visible && options.length > 0) {
            setTimeout(() => setIsVisible(true), 200);
        } else {
            setIsVisible(false);
        }
    }, [visible, options]);

    if (options.length === 0) return null;

    return (
        <div
            className={`
        w-full px-6 pb-6
        transition-all duration-500 ease-out
        ${isVisible
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-8'
                }
      `}
        >
            <div className="flex flex-wrap justify-center gap-3">
                {options.map((option, index) => (
                    <button
                        key={index}
                        onClick={() => onSelect(option)}
                        className="
              px-6 py-3
              bg-white/60 backdrop-blur-sm
              border border-gray-300/50
              rounded-full
              text-sm font-medium text-gray-700
              transition-all duration-200
              hover:bg-white/80 hover:border-gray-400/70
              active:scale-95
              shadow-sm
            "
                        style={{
                            animationDelay: `${index * 100}ms`,
                        }}
                    >
                        {option}
                    </button>
                ))}
            </div>
        </div>
    );
}
