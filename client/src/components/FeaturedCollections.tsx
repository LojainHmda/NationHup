import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Collection } from "@shared/schema";

export function FeaturedCollections() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const { data: allCollections = [] } = useQuery<Collection[]>({
    queryKey: ["/api/collections"],
  });

  const featuredCollections = allCollections.filter(c => c.featured && c.isActive);

  useEffect(() => {
    if (featuredCollections.length > 0 && currentIndex >= featuredCollections.length) {
      setCurrentIndex(0);
    }
  }, [featuredCollections.length, currentIndex]);

  useEffect(() => {
    if (!isAutoPlaying || featuredCollections.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featuredCollections.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlaying, featuredCollections.length]);

  const handlePrevious = () => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev - 1 + featuredCollections.length) % featuredCollections.length);
  };

  const handleNext = () => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev + 1) % featuredCollections.length);
  };

  const handleDotClick = (index: number) => {
    setIsAutoPlaying(false);
    setCurrentIndex(index);
  };

  if (featuredCollections.length === 0) {
    return null;
  }

  const currentCollection = featuredCollections[currentIndex];

  return (
    <div 
      className="relative bg-[hsl(var(--sidebar-primary))] text-white overflow-hidden"
      style={{
        backgroundImage: currentCollection.imageUrl ? `url(${currentCollection.imageUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      data-testid="featured-collections-carousel"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--sidebar-primary))]/95 to-[hsl(var(--sidebar-primary))]/80" />
      
      <div className="relative py-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Tag className="w-8 h-8" />
            <h2 className="text-4xl font-bold">{currentCollection.name}</h2>
          </div>
          
          <p className="text-xl mb-6 text-white/90">
            {currentCollection.description || "Fresh styles for the new season"}
          </p>

          {currentCollection.discount && parseFloat(currentCollection.discount.toString()) > 0 && (
            <div className="inline-block">
              <div className="bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] px-8 py-3 rounded-full text-2xl font-bold">
                {parseFloat(currentCollection.discount.toString())}% OFF
              </div>
            </div>
          )}

          {featuredCollections.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full w-12 h-12"
                data-testid="button-carousel-previous"
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full w-12 h-12"
                data-testid="button-carousel-next"
              >
                <ChevronRight className="w-6 h-6" />
              </Button>

              <div className="flex items-center justify-center gap-2 mt-6">
                {featuredCollections.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => handleDotClick(index)}
                    className={`w-3 h-3 rounded-full transition-all ${
                      index === currentIndex
                        ? "bg-[hsl(var(--accent))] w-8"
                        : "bg-white/50 hover:bg-white/70"
                    }`}
                    data-testid={`button-carousel-dot-${index}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
