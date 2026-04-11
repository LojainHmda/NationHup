import { useMemo } from "react";
import { useLocation } from "wouter";
import { SidebarNav } from "@/components/SidebarNav";
import { TopNavbar } from "@/components/TopNavbar";
import { AuthDrawers } from "@/components/AuthDrawers";
import { ShopCartSidebar } from "@/components/shop/ShopCartSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useCartContext } from "@/hooks/useCartContext";
import { useProductMode } from "@/hooks/useProductMode";
import { useStockSocket } from "@/hooks/useStockSocket";
import type { Order } from "@shared/schema";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, isCustomer, isLoading: isAuthLoading, isLoggingOut, isStaff, isAdmin } = useAuth();
  const {
    drafts,
    isDraftsLoading,
    activeDraftId,
    setActiveDraftId,
    openCartId,
    setOpenCartId,
    createDraft,
    deleteDraft,
    renameDraft,
    isCreatingDraft,
  } = useCartContext();
  const { productMode } = useProductMode();
  useStockSocket();
  
  // Derive the shop type for the cart sidebar from the current product mode
  const shopType: "stock" | "pre-order" = productMode === 'preorder' ? 'pre-order' : 'stock';

  const isShopRoute =
    location === "/shop" || location.startsWith("/shop/");
  /** Staff and admin: cart only on /shop routes; other sidebar roles (e.g. warehouse): always */
  const showSidebarShopCart = (!isStaff && !isAdmin) || isShopRoute;

  /** Customers: hide shop cart rail on home, order history, and full cart page (main content is enough). */
  const pathOnly = location.split("?")[0] ?? location;
  const hideCustomerShopCartRail =
    pathOnly === "/" ||
    pathOnly === "/order-history" ||
    pathOnly.startsWith("/cart/");
  const showCustomerShopCartSidebar = !!user && !hideCustomerShopCartRail;

  /** Staff-created carts for another user (e.g. account manager "create customer cart") stay off the shop sidebar */
  const shopSidebarDrafts = useMemo(() => {
    const uid = user?.id;
    const role = user?.role;
    if (!uid || !role) return drafts;
    const staffRoles = ["account_manager", "sales", "finance", "admin"];
    if (!staffRoles.includes(role)) return drafts;
    return drafts.filter((d: Order) => {
      const forOtherUser = !!(d.userId && d.userId !== uid);
      const createdByThisStaff = d.createdByAccountManagerId === uid;
      return !(forOtherUser && createdByThisStaff);
    });
  }, [drafts, user?.id, user?.role]);

  // Show full-screen overlay during logout to prevent flash of intermediate UI
  if (isLoggingOut) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-b from-[#fffbf5] via-white to-[#fffbf5]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#FE4438] border-t-transparent" />
          <p className="text-sm text-gray-500 font-medium">Signing you out...</p>
        </div>
      </div>
    );
  }
  
  // Show loading state while auth is being determined to prevent flash of unauthenticated UI
  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-[#fffbf5] via-white to-[#fffbf5]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#FE4438] border-t-transparent" />
          <p className="text-sm text-gray-500 font-medium">Loading...</p>
        </div>
      </div>
    );
  }
  
  // Show TopNavbar layout for customers and guests (non-admin users)
  if (!user || isCustomer) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <TopNavbar />
        <AuthDrawers />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div id="main-scroll-container" className="flex-1 min-h-0 overflow-auto scrollbar-hide">
            {children}
          </div>
          {showCustomerShopCartSidebar && (
            <div className="flex-shrink-0 sticky top-0 self-start h-full bg-[#DDE3E2]">
              <ShopCartSidebar
                drafts={shopSidebarDrafts}
                allDrafts={drafts}
                activeDraftId={activeDraftId}
                openCartId={openCartId}
                onSelectDraft={setActiveDraftId}
                onCreateDraft={createDraft}
                isCreating={isCreatingDraft}
                isDraftsLoading={isDraftsLoading}
                onDeleteDraft={deleteDraft}
                onRenameDraft={renameDraft}
                onOpenCartChange={setOpenCartId}
                shopType={shopType}
              />
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // Show SidebarNav layout for admin users
  return (
    <div className="flex h-screen bg-background">
      <SidebarNav />
      <div id="main-scroll-container" className="flex-1 min-h-0 overflow-auto scrollbar-hide">
        {children}
      </div>
      {showSidebarShopCart && (
        <div className="flex-shrink-0 sticky top-0 self-start h-screen bg-[#DDE3E2]">
          <ShopCartSidebar
            drafts={shopSidebarDrafts}
            allDrafts={drafts}
            activeDraftId={activeDraftId}
            openCartId={openCartId}
            onSelectDraft={setActiveDraftId}
            onCreateDraft={createDraft}
            isCreating={isCreatingDraft}
            isDraftsLoading={isDraftsLoading}
            onDeleteDraft={deleteDraft}
            onRenameDraft={renameDraft}
            onOpenCartChange={setOpenCartId}
            shopType={shopType}
          />
        </div>
      )}
    </div>
  );
}
