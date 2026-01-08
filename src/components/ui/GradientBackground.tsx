"use client"

import { ReactNode } from 'react';

interface GradientBackgroundProps {
  children: ReactNode;
  className?: string;
  subtle?: boolean;
}

export function GradientBackground({
  children,
  className = '',
  subtle = false
}: GradientBackgroundProps) {
  return (
    <div
      className={`
        min-h-screen w-full
        bg-gradient-to-b from-[#D4E7FF] via-[#FFD4F4] to-[#FAF9F6]
        transition-all duration-1000 ease-out
        ${subtle ? 'opacity-95' : 'opacity-100'}
        ${className}
      `}
      style={{
        background: 'linear-gradient(180deg, #D4E7FF 0%, #FFD4F4 50%, #FAF9F6 100%)',
      }}
    >
      {children}
    </div>
  );
}
