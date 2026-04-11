import { Plus, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Order } from '@shared/schema';
import { useState } from 'react';

interface ShopCartSelectorProps {
  drafts: Order[];
  activeDraftId: string | null;
  onSelectDraft: (draftId: string) => void;
  onCreateDraft: (cartName?: string) => void;
  isCreating?: boolean;
}

export function ShopCartSelector({
  drafts,
  activeDraftId,
  onSelectDraft,
  onCreateDraft,
  isCreating = false,
}: ShopCartSelectorProps) {
  const activeDraft = drafts.find(d => d.id === activeDraftId);
  const itemCount = activeDraft?.items?.length || 0;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [cartName, setCartName] = useState('');

  const handleCreateCart = () => {
    onCreateDraft(cartName.trim() || undefined);
    setCartName('');
    setIsDialogOpen(false);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <ShoppingCart className="w-5 h-5 text-muted-foreground" />
        <span className="text-sm font-medium">Cart:</span>
      </div>
      
      <Select
        value={activeDraftId || ''}
        onValueChange={onSelectDraft}
        disabled={isCreating}
      >
        <SelectTrigger className="w-64" data-testid="select-cart">
          <SelectValue placeholder="Select or create a cart" />
        </SelectTrigger>
        <SelectContent>
          {drafts.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No carts yet. Create one to start shopping.
            </div>
          ) : (
            drafts.map((draft) => {
              const draftItemCount = draft.items?.length || 0;
              const draftName = draft.nickname || draft.orderName || `Order ${draft.id.slice(0, 8)}`;
              return (
                <SelectItem key={draft.id} value={draft.id} data-testid={`cart-option-${draft.id}`}>
                  <div className="flex items-center justify-between w-full">
                    <span>{draftName}</span>
                    <span className="ml-3 text-xs text-muted-foreground">
                      {draftItemCount} {draftItemCount === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </SelectItem>
              );
            })
          )}
        </SelectContent>
      </Select>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="default"
            disabled={isCreating}
            data-testid="button-create-cart"
            className="bg-primary hover:bg-primary/90"
          >
            <Plus className="w-4 h-4 mr-1" />
            New Cart
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Cart</DialogTitle>
            <DialogDescription>
              Give your cart a name to help you organize your orders.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cart-name">Cart Name</Label>
              <Input
                id="cart-name"
                placeholder="e.g., ADDIDAS, NIKE, Spring Collection..."
                value={cartName}
                onChange={(e) => setCartName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateCart();
                  }
                }}
                autoFocus
                data-testid="input-cart-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCartName('');
                setIsDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleCreateCart}
              disabled={isCreating}
              data-testid="button-confirm-create-cart"
            >
              {isCreating ? 'Creating...' : 'Create Cart'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeDraft && itemCount > 0 && (
        <div className="ml-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
          {itemCount} {itemCount === 1 ? 'product' : 'products'}
        </div>
      )}
    </div>
  );
}
