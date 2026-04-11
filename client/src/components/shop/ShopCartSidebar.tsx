import { Plus, Trash2, FileText, Pencil, History, Package, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { savePageStateBeforeNavigation } from "@/hooks/usePageState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Order } from "@shared/schema";

type CartType = "pre-order" | "stock";

/** Brand primary — toggle “on” state (matches cart accents) */
const PRIMARY = "#FD4338";

interface ShopCartSidebarProps {
  drafts: Order[];
  /** Full draft list from the server (optional). Used to detect “no carts” and open-cart validity when `drafts` is a filtered subset for display. */
  allDrafts?: Order[];
  activeDraftId: string | null;
  openCartId: string | null;
  onSelectDraft: (draftId: string | null) => void;
  onCreateDraft: (cartName?: string, cartType?: CartType) => void;
  onDeleteDraft?: (draftId: string) => void;
  onRenameDraft?: (draftId: string, newName: string) => void;
  isCreating?: boolean;
  isDraftsLoading?: boolean;
  onOpenCartChange: (cartId: string | null) => void;
  /** The current shop type — locks the sidebar to show only matching carts */
  shopType?: CartType;
}

export function ShopCartSidebar({
  drafts,
  allDrafts,
  activeDraftId,
  openCartId,
  onSelectDraft,
  onCreateDraft,
  onDeleteDraft,
  onRenameDraft,
  isCreating = false,
  isDraftsLoading = false,
  onOpenCartChange,
  shopType,
}: ShopCartSidebarProps) {
  const draftsForPresence = allDrafts ?? drafts;
  const [location, navigate] = useLocation();
  const { getCurrencySymbol, userCurrency } = useCurrency();
  const [isHovering, setIsHovering] = useState(false);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCartName, setNewCartName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<null | {
    id: string;
    title: string;
    items: number;
  }>(null);
  const [editTarget, setEditTarget] = useState<null | {
    id: string;
    currentName: string;
  }>(null);
  const [editName, setEditName] = useState("");

  // The active tab is always driven by shopType (defaults to "stock")
  const activeTab: CartType = shopType ?? "stock";

  // Labels
  const activeLabel = activeTab === "pre-order" ? "Pre-order" : "Stock";

  // Helper function to determine cart type from order
  const getCartType = (order: Order): CartType => {
    const orderType = order.orderType?.toLowerCase() || "regular";
    if (orderType === "pre-order" || orderType === "preorder") {
      return "pre-order";
    }
    return "stock";
  };

  // Filter drafts by active tab - only show carts matching the selected tab type
  const filteredDrafts = useMemo(() => {
    const filtered = drafts.filter((draft) => {
      if (draft.status !== 'draft') return false;
      const cartType = getCartType(draft);
      return cartType === activeTab;
    });
    return filtered;
  }, [drafts, activeTab]);

  // Only clear openCartId if the cart no longer exists in drafts
  useEffect(() => {
    if (isCreating || isDraftsLoading) return;
    if (openCartId && !draftsForPresence.some((d) => d.id === openCartId)) {
      onOpenCartChange(null);
    }
  }, [draftsForPresence, openCartId, onOpenCartChange, isCreating, isDraftsLoading]);

  const defaultCartCreatedRef = useRef(false);
  useEffect(() => {
    if (
      !isDraftsLoading &&
      draftsForPresence.length === 0 &&
      !isCreating &&
      !defaultCartCreatedRef.current
    ) {
      defaultCartCreatedRef.current = true;
      onCreateDraft("Basic Cart", activeTab);
    }
  }, [draftsForPresence.length, isCreating, isDraftsLoading, onCreateDraft, activeTab]);

  const handleToggleOpenCart = (e: React.MouseEvent, draftId: string) => {
    e.stopPropagation();
    const newOpenId = openCartId === draftId ? null : draftId;
    onOpenCartChange(newOpenId);
  };

  const handleSelectDraft = (draftId: string) => {
    onSelectDraft(draftId);
    // Save shop scroll position when navigating from shop to cart (preserves context for Back to Shop)
    if (location === "/shop/stock" || location === "/shop/pre-order") {
      savePageStateBeforeNavigation(location);
    }
    navigate(`/cart/${draftId}`);
  };

  // Create cart handler — type is always derived from the current shop type
  const handleCreateCart = () => {
    onCreateDraft(newCartName.trim() || undefined, activeTab);
    setNewCartName("");
    setShowCreateDialog(false);
  };

  return (
    <div
      className={`flex flex-col h-full bg-[#DDE3E2] border-l border-gray-100 transition-all duration-300 ${
        isHovering ? "w-[300px]" : "w-16"
      }`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      data-testid="cart-sidebar"
    >
      {/* Collapsed View */}
      {!isHovering && (
        <div className="flex flex-col h-full bg-[#DDE3E2]">
          <div className="flex items-center justify-center p-4 border-b border-gray-100 h-16 flex-shrink-0 bg-[#DDE3E2]">
            <p
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                fontSize: '12px',
                fontWeight: 'bold',
                letterSpacing: '2px',
              }}
              className="text-gray-600"
            >
              {activeTab === "pre-order" ? "PRE-ORDER" : "STOCK"}
            </p>
          </div>

          <div className="flex-1 min-h-0 flex flex-col items-center py-2 gap-2 overflow-y-auto overflow-x-hidden bg-[#DDE3E2]">
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="w-12 h-12 p-0 text-gray-700 font-medium flex items-center justify-center flex-shrink-0 bg-white rounded-xl border-2 border-gray-400/90 shadow-sm hover:border-[#FD4338] hover:text-[#FD4338] hover:shadow-md transition-all duration-300"
              data-testid="button-create-cart-collapsed"
              title={`New ${activeLabel} Cart`}
            >
              <Plus className="w-5 h-5" />
            </Button>
            {filteredDrafts.map((draft) => {
              const isOpen = openCartId === draft.id;
              const isRejected = draft.status === 'rejected';
              const isSubmitted = draft.status === 'pending';
              const title = draft.nickname || draft.orderName || "Unnamed Cart";
              const shortTitle = title.substring(0, 5).toUpperCase();

              return (
                <button
                  key={draft.id}
                  onClick={() => handleSelectDraft(draft.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!isSubmitted && !isRejected) {
                      handleToggleOpenCart(e as any, draft.id);
                    }
                  }}
                  className={`w-14 h-12 rounded-xl flex items-center justify-center text-[13px] font-medium transition-all flex-shrink-0 relative border-2 shadow-sm ${
                    isRejected
                      ? "bg-red-50 text-red-700 border-red-300 shadow-md"
                      : isSubmitted
                      ? "bg-green-50 text-green-700 border-green-300 shadow-md"
                      : isOpen
                      ? "bg-[#FD4338] text-white border-[#FD4338] shadow-md shadow-[#FD4338]/30 ring-2 ring-[#FD4338]/25"
                      : "bg-white text-gray-700 border-gray-400/90 hover:border-[#FD4338] hover:text-[#FD4338] hover:shadow-md"
                  }`}
                  title={`${title}${isRejected ? ' (Rejected)' : isSubmitted ? ' (Submitted)' : isOpen ? ' (Active)' : ''} - Click to view${!isSubmitted && !isRejected ? ', Right-click to toggle' : ''}`}
                  data-testid={`cart-item-collapsed-${draft.id}`}
                >
                  {shortTitle}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* Expanded View */}
      {isHovering && (
        <>
          <div className="border-b border-gray-100 bg-[#DDE3E2]">
            <div className="flex items-center justify-between p-4 pb-2">
              <h2 className="text-lg font-bold uppercase text-gray-900">
                {activeLabel} Carts
              </h2>
              <Button
                onClick={() => navigate('/carts-summary')}
                variant="ghost"
                size="sm"
                className="h-7 text-xs flex items-center gap-1 text-gray-600 hover:text-[#FD4338] hover:bg-[#FD4338]/10 transition-colors"
                data-testid="button-view-summary"
              >
                <FileText className="w-3 h-3" />
                View Summary
              </Button>
            </div>
            <div className="flex items-center justify-between px-4 pb-3">
              <span className="text-xs text-gray-500">
                {filteredDrafts.length} {activeLabel.toLowerCase()} cart{filteredDrafts.length !== 1 ? 's' : ''}
              </span>
              <Button
                onClick={() => navigate('/order-history')}
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2 text-gray-700 hover:text-[#FD4338] hover:bg-[#FD4338]/10 transition-colors"
                data-testid="button-order-history"
              >
                <History className="w-3 h-3 mr-1" />
                Order History
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-2 bg-[#DDE3E2]">
            <div className="px-2 mb-3">
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="whitespace-nowrap rounded-md ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FD4338]/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 px-4 py-2 w-full h-8 flex items-center justify-center gap-2 font-medium text-[14px] text-white transition-colors bg-[#FD4338] hover:bg-[#E62F2A] shadow-md shadow-[#FD4338]/25"
                data-testid="button-create-cart-expanded"
              >
                <Plus className="w-3 h-3" />
                New {activeLabel} Cart
              </Button>
            </div>

            {/* Type indicator badge (replaces the old tab switcher) */}
            <div className="px-2 mb-3">
              <div className="flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold bg-[#FD4338]/10 text-[#FD4338] border-2 border-[#FD4338]/35">
                {activeTab === "pre-order" ? (
                  <Calendar className="w-3.5 h-3.5" />
                ) : (
                  <Package className="w-3.5 h-3.5" />
                )}
                {activeLabel}
              </div>
            </div>

            <div className="space-y-2">
              {filteredDrafts.map((draft) => {
                const isOpen = openCartId === draft.id;
                const title = draft.nickname || draft.orderName || "Unnamed Cart";
                const uniqueProductCount = new Set(draft.items?.map(item => `${item.productId}::${(item as any).color || ''}`)).size || 0;
                const totalPrice =
                  draft.items?.reduce((sum, i) => sum + i.totalPrice, 0) || 0;

                return (
                  <div key={draft.id} style={{ marginBottom: 8 }}>
                    <div
                      className={`group cursor-pointer relative rounded-2xl border-2 transition-all duration-300 shadow-sm ${
                        isOpen
                          ? "border-[#FD4338] bg-white ring-2 ring-[#FD4338]/20 shadow-md"
                          : "border-gray-400/90 bg-white hover:border-[#FD4338]/70 hover:shadow-md"
                      }`}
                      style={{
                        width: "100%",
                        padding: "12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      onClick={() => handleSelectDraft(draft.id)}
                    >
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            style={{ fontWeight: 500 }}
                            className={`text-[13px] font-semibold ${isOpen ? "text-[#FD4338]" : "text-gray-900"}`}
                          >
                            {title}
                          </span>
                          {isOpen && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold text-white rounded-lg bg-[#FD4338] shadow-sm">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <span className={`text-xs ${isOpen ? "text-[#FD4338]" : "text-gray-500"}`}>
                          {uniqueProductCount} items
                        </span>
                      </div>

                      <div
                        style={{ display: "flex", alignItems: "center", gap: 10 }}
                      >
                        {onRenameDraft && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-gray-400 hover:text-[#FD4338] hover:bg-[#FD4338]/10 transition-all opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditTarget({ id: draft.id, currentName: title });
                              setEditName(title);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {onDeleteDraft && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ id: draft.id, title, items: uniqueProductCount });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}

                        <span className={`text-sm font-semibold ${isOpen ? "text-[#FD4338]" : "text-gray-600"}`}>
                          {getCurrencySymbol(userCurrency)}{totalPrice.toFixed(2)}
                        </span>

                        <div
                          style={{
                            width: 24,
                            height: 14,
                            backgroundColor: isOpen ? PRIMARY : "#e5e7eb",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: isOpen ? "flex-end" : "flex-start",
                            cursor: "pointer",
                            borderRadius: 4,
                            transition: "all 0.3s",
                            padding: "2px",
                          }}
                          onClick={(e) => handleToggleOpenCart(e, draft.id)}
                        >
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              backgroundColor: isOpen ? "white" : "#d1d5db",
                              borderRadius: 3,
                              transition: "0.3s",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
      {/* Create Cart Dialog — type is automatically set from the current shop mode */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          setNewCartName("");
        }
      }}>
        <DialogContent className="sm:max-w-[420px] border-2 border-gray-200 rounded-2xl shadow-xl bg-white">
          <DialogHeader className="space-y-3 pb-2">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              New {activeLabel} Cart
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 leading-relaxed">
              Give your {activeLabel.toLowerCase()} cart a nickname to help organize your orders.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-4">
            {/* Show cart type as a read-only badge */}
            <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-[#FD4338]/30 bg-[#FD4338]/10">
              <div className="p-2 rounded-lg bg-white/80">
                {activeTab === "pre-order" ? (
                  <Calendar className="w-5 h-5 text-[#FD4338]" />
                ) : (
                  <Package className="w-5 h-5 text-[#FD4338]" />
                )}
              </div>
              <div>
                <div className="font-semibold text-sm text-[#FD4338]">
                  {activeLabel} Cart
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {activeTab === "pre-order" ? "Future orders" : "Available items"}
                </div>
              </div>
            </div>

            {/* Cart Nickname Input */}
            <div className="space-y-2">
              <Label htmlFor="new-cart-name" className="text-sm font-semibold text-gray-900">
                Cart Nickname
                <span className="text-gray-400 font-normal ml-1">(optional)</span>
              </Label>
              <Input
                id="new-cart-name"
                placeholder="e.g., Nike Orders, Spring Collection..."
                value={newCartName}
                onChange={(e) => setNewCartName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateCart();
                  }
                }}
                className="h-11 rounded-xl border-gray-300 focus:border-[#FD4338] focus:ring-2 focus:ring-[#FD4338]/25 transition-all"
                autoFocus
              />
              <p className="text-xs text-gray-500">
                Give your cart a memorable name to easily identify it later
              </p>
            </div>
          </div>

          <DialogFooter className="gap-3 pt-4 border-t border-gray-100">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCreateDialog(false);
                setNewCartName("");
              }} 
              className="flex-1 sm:flex-initial border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-xl h-11"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateCart}
              disabled={isCreating}
              className="flex-1 sm:flex-initial bg-[#FD4338] hover:bg-[#E62F2A] text-white font-semibold rounded-xl shadow-lg shadow-[#FD4338]/30 disabled:opacity-50 disabled:cursor-not-allowed h-11 transition-all"
            >
              {isCreating ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Create Cart
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Cart Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[400px] border-2 border-gray-100 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">Delete Cart?</DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-red-600">"{deleteTarget?.title}"</span> containing{" "}
              <span className="font-semibold text-gray-900">{deleteTarget?.items}</span> items?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="border-gray-200 hover:bg-gray-100">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (deleteTarget) {
                  onDeleteDraft?.(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit Cart Name Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="sm:max-w-[425px] border-2 border-gray-100 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">Rename Cart</DialogTitle>
            <DialogDescription className="text-gray-600">
              Enter a new name for your cart.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label htmlFor="edit-cart-name" className="text-gray-700 font-semibold">Cart Name</Label>
            <Input
              id="edit-cart-name"
              placeholder="e.g., Nike Orders..."
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && editTarget && editName.trim()) {
                  onRenameDraft?.(editTarget.id, editName.trim());
                  setEditTarget(null);
                  setEditName("");
                }
              }}
              className="rounded-xl border-gray-200 focus:border-[#FD4338] focus:ring-[#FD4338]/25"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)} className="border-gray-200 hover:bg-gray-100">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editTarget && editName.trim()) {
                  onRenameDraft?.(editTarget.id, editName.trim());
                  setEditTarget(null);
                  setEditName("");
                }
              }}
              disabled={!editName.trim()}
              className="bg-[#FD4338] hover:bg-[#E62F2A] text-white font-semibold rounded-xl shadow-lg shadow-[#FD4338]/30"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
