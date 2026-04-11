import { useQuery } from "@tanstack/react-query";
import { Sparkles, Tag } from "lucide-react";
import { Badge } from "./ui/badge";

interface Collection {
  name: string;
  slug: string;
}

interface DealsBannerProps {
  onSelectCollection: (collection: string) => void;
  selectedCollections: string[];
}

export function DealsBanner({ onSelectCollection, selectedCollections }: DealsBannerProps) {
  const { data: collections = [] } = useQuery<Collection[]>({
    queryKey: ["/api/collections"],
  });

  if (collections.length === 0) {
    return null;
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 py-3">
      <div className="absolute inset-0 bg-black opacity-10"></div>
      
      <div className="relative animate-marquee whitespace-nowrap">
        <div className="inline-flex items-center space-x-8 px-4">
          {collections.concat(collections).map((collection, index) => (
            <button
              key={`${collection.slug}-${index}`}
              onClick={() => onSelectCollection(collection.name)}
              className={`inline-flex items-center space-x-2 px-4 py-1.5 rounded-full transition-all transform hover:scale-105 ${
                selectedCollections.includes(collection.name)
                  ? 'bg-white text-purple-700 shadow-lg'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
              data-testid={`deal-${collection.slug}`}
            >
              <Sparkles className="h-4 w-4" />
              <span className="font-semibold text-sm">{collection.name}</span>
              <Tag className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
