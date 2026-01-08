"use client"

import { useRef, useEffect, useState } from 'react';
import Image from 'next/image';

interface Product {
    id: string;
    title: string;
    price: string;
    image_url: string;
    variant_id: string;
}

interface ProductCarouselProps {
    products: Product[];
    onAddToCart: (variantId: string, productTitle: string) => void;
    onProductSelect?: (product: Product) => void;
}

export function ProductCarousel({
    products,
    onAddToCart,
    onProductSelect
}: ProductCarouselProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [visibleCards, setVisibleCards] = useState<number[]>([]);

    // Staggered slide-in animation
    useEffect(() => {
        products.forEach((_, index) => {
            setTimeout(() => {
                setVisibleCards(prev => [...prev, index]);
            }, index * 150); // 150ms stagger between cards
        });

        return () => setVisibleCards([]);
    }, [products]);

    if (products.length === 0) return null;

    return (
        <div className="w-full mt-8 px-4">
            <div
                ref={scrollContainerRef}
                className="
          flex gap-4 overflow-x-auto snap-x snap-mandatory
          scrollbar-hide pb-4
          -mx-4 px-4
        "
                style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                }}
            >
                {products.map((product, index) => (
                    <div
                        key={product.id}
                        className={`
              flex-shrink-0 w-[300px] snap-center
              bg-white/80 backdrop-blur-md
              rounded-3xl overflow-hidden
              shadow-xl shadow-purple-500/5
              transition-all duration-500 ease-out
              ${visibleCards.includes(index)
                                ? 'opacity-100 translate-x-0'
                                : 'opacity-0 translate-x-[100px]'
                            }
            `}
                        onClick={() => onProductSelect?.(product)}
                    >
                        {/* Product Image */}
                        <div className="relative w-full h-[240px] bg-gray-100">
                            <Image
                                src={product.image_url}
                                alt={product.title}
                                fill
                                className="object-cover"
                                sizes="280px"
                            />
                        </div>

                        {/* Product Info */}
                        <div className="p-5 space-y-3">
                            <h3 className="text-base font-medium text-gray-900 line-clamp-1">
                                {product.title}
                            </h3>

                            <p className="text-2xl font-semibold text-gray-900">
                                {product.price}
                            </p>

                            {/* Add to Cart Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAddToCart(product.variant_id, product.title);
                                }}
                                className="
                  w-full py-3 px-6
                  bg-gray-900 text-white
                  rounded-full
                  font-medium text-sm
                  transition-all duration-200
                  hover:bg-gray-800
                  active:scale-95
                "
                            >
                                Add to Cart
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Scroll Indicator (subtle) */}
            {products.length > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                    {products.map((_, index) => (
                        <div
                            key={index}
                            className={`
                w-2 h-2 rounded-full
                transition-all duration-300
                ${index < 3 ? 'bg-gray-400/50' : 'bg-gray-300/30'}
              `}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
