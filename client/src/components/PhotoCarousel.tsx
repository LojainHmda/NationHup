import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PhotoCarouselProps {
  imageUrl: string;
  productName: string;
  autoRotate?: boolean;
  className?: string;
}

export function PhotoCarousel({ imageUrl, productName, autoRotate = true, className = "" }: PhotoCarouselProps) {
  const [rotation, setRotation] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!autoRotate && !isHovered) return;

    const interval = setInterval(() => {
      setRotation((prev) => (prev + 1) % 360);
    }, 50);

    return () => clearInterval(interval);
  }, [autoRotate, isHovered]);

  const handlePrevious = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation((prev) => (prev - 45 + 360) % 360);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation((prev) => (prev + 45) % 360);
  };

  return (
    <div 
      className={`relative group ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative w-full h-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
        <img
          src={imageUrl}
          alt={productName}
          className="w-full h-full object-cover transition-transform duration-500"
          style={{
            transform: `perspective(1000px) rotateY(${rotation}deg)`,
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
      
      {isHovered && (
        <div className="absolute inset-0 flex items-center justify-between px-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handlePrevious}
            className="p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            data-testid="button-photo-prev"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            onClick={handleNext}
            className="p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            data-testid="button-photo-next"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
