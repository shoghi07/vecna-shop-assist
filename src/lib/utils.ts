import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generate UUID v4
 * Used for session IDs and message IDs
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}
