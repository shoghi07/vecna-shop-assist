/**
 * Product List Component
 * 
 * Presentational component - NO logic, NO state
 * Displays products in horizontal scroll exactly as ordered by backend
 * 
 * CRITICAL: 
 * - Display ALL products in exact order received
 * - NEVER filter, sort, or modify the product list
 * - Even if products array is empty, render the container
 */

import { ProductData } from '@/lib/api';
import { ProductCard } from './ProductCard';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface ProductListProps {
    products: ProductData[];
    onAddToCart: (variantId: string) => void;
}

export function ProductList({ products, onAddToCart }: ProductListProps) {
    if (products.length === 0) {
        return null; // Backend sent 0 products - display nothing
    }

    return (
        <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-4 p-1">
                {products.map((product) => (
                    <ProductCard
                        key={product.variant_id}
                        product={product}
                        onAddToCart={onAddToCart}
                    />
                ))}
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    );
}
