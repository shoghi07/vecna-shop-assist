/**
 * Product Card Component
 * 
 * Presentational component - NO logic, NO state
 * Displays a single product exactly as provided by backend
 * 
 * CRITICAL: 
 * - Display product data verbatim (no formatting, filtering, or modifications)
 * - Use variant_id from backend for cart API (never modify)
 * - Only add to cart when user explicitly clicks CTA
 */

// ProductData type removed - using any for now
import { Button } from '@/components/ui/button';
import Image from 'next/image';

interface ProductCardProps {
    product: any;
    onAddToCart: (variantId: string) => void;
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
    return (
        <div className="flex-shrink-0 w-[280px] border rounded-lg overflow-hidden bg-card">
            {/* Product Image */}
            <div className="relative w-full h-[280px] bg-muted">
                <Image
                    src={product.image_url}
                    alt={product.title}
                    fill
                    className="object-cover"
                    unoptimized
                />
            </div>

            {/* Product Info */}
            <div className="p-4 space-y-3">
                <div>
                    <h3 className="font-semibold text-sm line-clamp-2">{product.title}</h3>
                    <p className="text-lg font-bold mt-1">{product.price}</p>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-3">
                    {product.description}
                </p>

                <div className="space-y-2">
                    <Button
                        onClick={() => onAddToCart(product.variant_id)}
                        className="w-full"
                        size="sm"
                    >
                        Select this item
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        asChild
                    >
                        <a href={product.shopify_url} target="_blank" rel="noopener noreferrer">
                            View Details
                        </a>
                    </Button>
                </div>
            </div>
        </div>
    );
}
