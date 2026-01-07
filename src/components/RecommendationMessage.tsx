/**
 * Recommendation Message Component
 * 
 * Presentational component - NO logic, NO state
 * Displays assistant's explanation text + product recommendations
 * 
 * CRITICAL:
 * - Display explanation text verbatim
 * - Products are rendered in exact order from backend
 */

import { AssistantRecommendationMessage } from '@/types/message';
import { ProductList } from './ProductList';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { AudioPlayer } from './AudioPlayer';

interface RecommendationMessageProps {
    message: AssistantRecommendationMessage;
    onAddToCart: (variantId: string) => void;
    onLoadMore?: (intentId: string, offset: number) => void;
}

export function RecommendationMessage({ message, onAddToCart, onLoadMore }: RecommendationMessageProps) {
    const { primary_recommendation, secondary_recommendations = [], next_page_offset, intent_id } = message;

    return (
        <div className="flex flex-col gap-6 mb-8 w-full max-w-3xl">
            {/* Acknowledgement/Intro */}
            <div className="flex justify-start">
                <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-5 py-4 flex items-start gap-2">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap flex-1">{message.content}</p>
                    <AudioPlayer text={message.content} autoPlay={false} />
                </div>
            </div>

            {/* PRIMARY RECOMMENDATION (Hero Card) */}
            {primary_recommendation && (
                <Card className="border-2 border-primary/10 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div className="grid md:grid-cols-2 gap-0">
                        <div className="relative h-64 md:h-auto bg-white p-4 flex items-center justify-center">
                            {/* Product Image */}
                            <div className="relative w-full h-full min-h-[200px]">
                                <Image
                                    src={primary_recommendation.image_url}
                                    alt={primary_recommendation.title}
                                    fill
                                    className="object-contain"
                                />
                            </div>
                            <Badge className="absolute top-4 left-4 bg-primary text-white pointer-events-none">
                                Top Pick
                            </Badge>
                        </div>

                        <div className="p-6 flex flex-col justify-between bg-card">
                            <div>
                                <CardTitle className="text-xl mb-2 line-clamp-2">{primary_recommendation.title}</CardTitle>
                                <div className="text-2xl font-bold text-primary mb-4">{primary_recommendation.price}</div>

                                <div className="space-y-4">
                                    <div className="bg-primary/5 rounded-lg p-3">
                                        <p className="text-sm font-medium text-primary mb-1">Why this fits:</p>
                                        <p className="text-sm text-muted-foreground">{primary_recommendation.description}</p>
                                    </div>

                                    {primary_recommendation.reasoning && (
                                        <div className="text-sm text-muted-foreground">
                                            <p className="font-medium text-foreground mb-1">Details:</p>
                                            <div className="whitespace-pre-wrap">{primary_recommendation.reasoning}</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Button
                                className="w-full mt-6"
                                onClick={() => onAddToCart(primary_recommendation.product_id)}
                            >
                                Add to Cart
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {/* SECONDARY RECOMMENDATIONS */}
            {secondary_recommendations.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        {primary_recommendation ? 'Other Great Options' : 'More Results'}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {secondary_recommendations.map((product) => (
                            <Card key={product.product_id} className="flex flex-col">
                                <CardHeader className="p-4 pb-2">
                                    <div className="relative w-full aspect-square mb-2 bg-white rounded-md overflow-hidden">
                                        <Image
                                            src={product.image_url}
                                            alt={product.title}
                                            fill
                                            className="object-contain p-2"
                                        />
                                    </div>
                                    <CardTitle className="text-base line-clamp-2">{product.title}</CardTitle>
                                    <CardDescription className="font-bold text-primary">{product.price}</CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 pt-0 flex-1 flex flex-col justify-between">
                                    <p className="text-xs text-muted-foreground mb-4 line-clamp-3">
                                        {product.description}
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => onAddToCart(product.product_id)}
                                    >
                                        Add to Cart
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* LOAD MORE */}
            {next_page_offset !== null && next_page_offset !== undefined && onLoadMore && intent_id && (
                <div className="flex justify-center mt-2">
                    <Button
                        data-testid="load-more-button"
                        variant="ghost"
                        onClick={() => onLoadMore(intent_id, next_page_offset)}
                        className="text-muted-foreground hover:text-primary gap-2"
                    >
                        Show more results <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            )}
        </div>
    );
}
