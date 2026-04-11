import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Tag } from "lucide-react";
import type { Collection } from "@shared/schema";

export function CollectionCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const { data: allCollections = [] } = useQuery<Collection[]>({
    queryKey: ["/api/collections"],
  });

  const activeCollections = allCollections.filter(c => c.isActive);

  // Clamp index when collections change
  useEffect(() => {
    if (activeCollections.length > 0 && currentIndex >= activeCollections.length) {
      setCurrentIndex(0);
    }
  }, [activeCollections.length, currentIndex]);

  // Auto-play functionality
  useEffect(() => {
    if (!isAutoPlaying || activeCollections.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeCollections.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlaying, activeCollections.length]);

  const handlePrevious = () => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev - 1 + activeCollections.length) % activeCollections.length);
  };

  const handleNext = () => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev + 1) % activeCollections.length);
  };

  const handleDotClick = (index: number) => {
    setIsAutoPlaying(false);
    setCurrentIndex(index);
  };

  if (activeCollections.length === 0) {
    return null;
  }

  const currentCollection = activeCollections[currentIndex];

  return (
    <div className="relative bg-blue-900 text-white overflow-hidden">
      <div className="relative py-12 px-6">
        {/* Content */}
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Tag className="w-8 h-8" />
            <h2 className="text-4xl font-bold">{currentCollection.name}</h2>
          </div>
          
          {currentCollection.description && (
            <p className="text-xl text-blue-100 mb-6">
              {currentCollection.description}
            </p>
          )}

          {currentCollection.discount && parseFloat(currentCollection.discount) > 0 && (
            <div className="inline-block animate-pulse">
              <div className="bg-yellow-400 text-blue-900 px-8 py-3 rounded-full text-2xl font-bold shadow-lg">
                {parseFloat(currentCollection.discount).toFixed(0)}% OFF
              </div>
            </div>
          )}
        </div>

        {/* Navigation Arrows */}
        {activeCollections.length > 1 && (
          <>
            <button
              onClick={handlePrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-all duration-300"
              aria-label="Previous collection"
              data-testid="button-carousel-previous"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={handleNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-all duration-300"
              aria-label="Next collection"
              data-testid="button-carousel-next"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* Dot Indicators */}
      {activeCollections.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {activeCollections.map((_, index) => (
            <button
              key={index}
              onClick={() => handleDotClick(index)}
              className={`transition-all duration-300 rounded-full ${
                index === currentIndex
                  ? 'w-8 h-3 bg-yellow-400'
                  : 'w-3 h-3 bg-white/40 hover:bg-white/60'
              }`}
              aria-label={`Go to collection ${index + 1}`}
              data-testid={`dot-indicator-${index}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
