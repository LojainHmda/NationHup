import { useState, useEffect } from "react";
import { X, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VariantMatrix } from "@/components/VariantMatrix";
import { mapProductVariants } from "@/lib/productVariants";
import { useCart } from "@/hooks/useCart";
import { useToast } from "@/hooks/use-toast";
import type { Product } from "@shared/schema";

interface SizeColorModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SizeColorModal({ product, isOpen, onClose }: SizeColorModalProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [batchName, setBatchName] = useState("");
  
  const { addToCart, isAddingToCart } = useCart();
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && product) {
      setBatchName(product.name);
      setQuantities({});
    }
  }, [isOpen, product]);

  if (!product) return null;

  const matrix = mapProductVariants(product);
  
  const handleAddToCart = () => {
    const selections = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([key, qty]) => {
        const [, size] = key.split('-');
        const color = product.colourway || 'Default';
        return { color, size, quantity: qty };
      });

    if (selections.length === 0) {
      toast({
        title: "No items selected",
        description: "Please select at least one size and color combination",
        variant: "destructive",
      });
      return;
    }

    // Check limitOrder per size before adding
    const avs = (product as any).availableSizes || [];
    for (const s of selections) {
      const sizeEntry = avs.find((a: { size: string; limitOrder?: number }) => a.size === s.size);
      const limit = sizeEntry?.limitOrder ?? ((product as any).limitOrder >= 1 ? (product as any).limitOrder : null);
      if (limit != null && s.quantity > limit) {
        toast({
          variant: "destructive",
          title: "Order Limit Exceeded",
          description: `You cannot order more than ${limit} units of size ${s.size} for "${product.name}".`,
        });
        return;
      }
    }

    addToCart(product.id, batchName, selections);
    toast({
      title: "Added to cart",
      description: `${selections.length} item(s) added successfully`,
    });
    onClose();
  };

  const totalQuantity = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  const totalPrice = totalQuantity * parseFloat(product.wholesalePrice);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold">
                {product.name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {product.brand} • {product.category}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
              data-testid="button-close-modal"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Product Image and Price */}
        <div className="flex gap-4 pb-4 border-b">
          <img
            src={product.image1}
            alt={product.name}
            className="w-24 h-24 object-fill rounded-lg border"
          />
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-blue-600">
                ${product.wholesalePrice}
              </span>
              {parseFloat(product.retailPrice) > parseFloat(product.wholesalePrice) && (
                <span className="text-sm text-muted-foreground line-through">
                  ${product.retailPrice}
                </span>
              )}
              <span className="text-sm text-muted-foreground">per pair</span>
            </div>
          </div>
        </div>

        {/* Batch Name */}
        <div className="pb-4">
          <label className="text-sm font-medium mb-2 block">
            Batch Name
          </label>
          <Input
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder="Enter batch name"
            className="max-w-md"
            data-testid="input-batch-name"
          />
        </div>

        {/* Variant Matrix */}
        <div className="flex-1 overflow-y-auto">
          <VariantMatrix
            matrix={matrix}
            mode="modal"
            quantities={quantities}
            onQuantityChange={(colorId, size, quantity) => {
              setQuantities(prev => ({
                ...prev,
                [`${colorId}-${size}`]: quantity
              }));
            }}
          />
        </div>

        {/* Footer with totals and actions */}
        <div className="pt-4 border-t">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-muted-foreground">Total Quantity</div>
              <div className="text-2xl font-bold">{totalQuantity} pairs</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Price</div>
              <div className="text-2xl font-bold text-blue-600">
                ${totalPrice.toFixed(2)}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddToCart}
              disabled={isAddingToCart || totalQuantity === 0}
              className="flex-1"
              data-testid="button-add-to-cart-modal"
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Add to Cart
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
