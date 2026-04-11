import { useState } from "react";
import { Link } from "wouter";
import { User, LogOut, ChevronDown, Menu, Check, History } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProductMode } from "@/hooks/useProductMode";
import { useShopNavigation } from "@/hooks/useShopNavigation";
import { useAuthDrawer } from "@/contexts/AuthDrawerContext";
import { ASSET_URLS } from "@/lib/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function TopNavbar() {
  const { user, isAuthenticated, logout, isLoggingOut } = useAuth();
  const { openLoginDrawer } = useAuthDrawer();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { productMode, permissions } = useProductMode();
  const { navigateToShop } = useShopNavigation();

  return (
    <div className="border-b border-gray-100 bg-[#DDE3E2]" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: '13px' }}>
      <div className="max-w-7xl mx-auto px-4 lg:px-8 bg-[#DDE3E2]">
        <div className="flex items-center justify-between h-14 relative">
          <Link href="/">
            <div className="flex items-center cursor-pointer text-left pl-[30px] pr-[30px]">
              <img 
                src={ASSET_URLS.nationOutfittersAppbar} 
                alt="Nation Outfitters" 
                className="h-[50px] w-auto" 
                style={{ mixBlendMode: "multiply" }}
                draggable={false} 
              />
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2 text-[#000000]" style={{ fontFamily: "'Acumin Variable Concept', sans-serif", fontSize: '17.296px', fontWeight: 600 }}>
            <Link href="/" className="text-[#000000] hover:text-[#FE4438] transition-colors">Home</Link>
            {isAuthenticated && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    className="text-[#000000] hover:text-[#FE4438] transition-colors flex items-center gap-1"
                    data-testid="nav-shop"
                  >
                    Shop <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40 rounded-lg shadow-lg">
                  <DropdownMenuItem 
                    onClick={() => navigateToShop('stock')}
                    className="cursor-pointer py-2"
                  >
                    Order from Stock
                    {productMode === 'stock' && <Check className="w-4 h-4 ml-auto text-[#FE4438]" />}
                  </DropdownMenuItem>
                  {permissions.allowPreOrders && (
                    <DropdownMenuItem 
                      onClick={() => navigateToShop('preorder')}
                      className="cursor-pointer py-2"
                    >
                      Pre-Order
                      {productMode === 'preorder' && <Check className="w-4 h-4 ml-auto text-[#FE4438]" />}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Link href="/contact" className="text-[#000000] hover:text-[#FE4438] transition-colors">Contact</Link>
          </nav>

          <div className="flex items-center gap-4">
            {isAuthenticated && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="flex items-center gap-2 text-sm hover:bg-gray-100 rounded-full"
                    data-testid="dropdown-profile"
                  >
                    <User className="w-4 h-4" />
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-lg shadow-lg">
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center gap-2 cursor-pointer py-2">
                      <User className="w-4 h-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/order-history" className="flex items-center gap-2 cursor-pointer py-2">
                      <History className="w-4 h-4" />
                      Orders
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => logout()}
                    disabled={isLoggingOut}
                    className="flex items-center gap-2 cursor-pointer py-2 text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700"
                    data-testid="button-logout"
                  >
                    <LogOut className="w-4 h-4" />
                    {isLoggingOut ? "Logging out..." : "Logout"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={openLoginDrawer}
                className="flex items-center gap-2 text-sm text-[#000000] hover:bg-transparent hover:text-[#FE4438] rounded-full transition-colors"
                data-testid="button-header-account"
              >
                <User className="w-4 h-4" />
                Account
              </Button>
            )}

            <button
              className="md:hidden p-2 hover:bg-gray-100 rounded-md transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              <Menu className="w-5 h-5 text-gray-900" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
