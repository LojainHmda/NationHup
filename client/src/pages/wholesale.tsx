import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { TopNavigation } from "@/components/TopNavigation";
import { FilterSidebar } from "@/components/FilterSidebar";
import { SmartFilter } from "@/components/SmartFilter";
import { BrandLogoFilter } from "@/components/BrandLogoFilter";
import { CollectionsFilter } from "@/components/CollectionsFilter";
import { DealsBanner } from "@/components/DealsBanner";
import { BrandExcelSelector } from "@/components/BrandExcelSelector";
import { GridOrderInterface } from "@/components/GridOrderInterface";
import { CartSidebar } from "@/components/CartSidebar";
import { OrderWizard } from "@/components/OrderWizard";
import { CollectionCarousel } from "@/components/CollectionCarousel";
import { ProductGrid } from "@/components/ProductGrid";
import { PreCartMatrix } from "@/components/PreCartMatrix";
import { CartOverlay } from "@/components/CartOverlay";
import { useFilters } from "@/hooks/useFilters";
import { useBucket } from "@/hooks/useBucket";
import { useCart } from "@/hooks/useCart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Grid, Table, Layout, ShoppingCart, PanelLeftClose, PanelLeftOpen, Sparkles, Package, ArrowRight, Trash2, Filter, X, ChevronDown } from "lucide-react";

export default function WholesalePage() {
  const [, setLocation] = useLocation();
  const [isOrderWizardOpen, setIsOrderWizardOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'excel' | 'bulk'>('grid');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'brands' | 'deals'>('brands');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showPreCart, setShowPreCart] = useState(false);
  const [singleProductMode, setSingleProductMode] = useState<string | null>(null);
  const [isProductSelectionCollapsed, setIsProductSelectionCollapsed] = useState(false);
  const [isCartExpanded, setIsCartExpanded] = useState(false);
  
  const {
    filters,
    updateFilter,
    toggleArrayFilter,
    removeFilter,
    getActiveFilters,
  } = useFilters();
  
  const { bucketItems, addToBucket, updateBucketQuantity, removeFromBucket, clearBucket, getBucketSummary } = useBucket();
  const { addToCart, cartItems } = useCart();

  // Move all bucket items to cart
  const moveToCart = () => {
    bucketItems.forEach(item => {
      // Each bucket item becomes its own batch
      addToCart(
        item.productId,
        `${item.productName} - ${item.color}`,
        [{ color: item.color, size: item.size, quantity: item.quantity }]
      );
    });
    clearBucket();
  };

  // Wrapper functions to convert productId/color/size to id format
  const handleUpdateBucketQuantity = (productId: string, color: string, size: string, quantity: number) => {
    const id = `${productId}-${color}-${size}`;
    updateBucketQuantity(id, quantity);
  };

  const handleRemoveFromBucket = (productId: string, color: string, size: string) => {
    const id = `${productId}-${color}-${size}`;
    removeFromBucket(id);
  };


  // Removed auto-switch to allow manual view mode control

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 dark:bg-slate-900 transition-colors duration-300 overflow-x-hidden">
      <div className="flex-1 flex flex-col w-full max-w-full overflow-x-hidden">
        <TopNavigation />
      
      {/* Collection Carousel */}
      <CollectionCarousel />
      
      {/* Smart Search Bar - Always Visible */}
      <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-lg border-b border-gray-200/50 dark:border-gray-700/50">
        <div className="px-6 py-4">
          <SmartFilter
            filters={filters}
            onFilterChange={updateFilter}
            onToggleArrayFilter={toggleArrayFilter}
            onRemoveFilter={removeFilter}
            activeFilters={getActiveFilters()}
          />
        </div>
      </div>
      
      {/* Make.com Inspired View Mode Toggle */}
      <div className="bg-gradient-to-r from-white/80 to-gray-50/80 dark:from-gray-800/80 dark:to-gray-900/80 backdrop-blur-lg border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-2xl p-2 shadow-lg border border-gray-200/20 dark:border-gray-700/20">
              <Button
                data-testid="button-view-grid"
                variant="default"
                size="sm"
                className="px-6 py-3 rounded-xl font-medium bg-primary text-primary-foreground shadow-lg hover:shadow-xl border-0"
              >
                <Grid className="h-4 w-4 mr-2" />
                Product Catalog
              </Button>
            </div>
            
            <div className="flex items-center space-x-4">
              <Button
                data-testid="button-toggle-filters"
                onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                className="bg-yellow-400 hover:bg-yellow-500 text-blue-900 font-semibold px-6 py-3.5 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 border-0 relative"
              >
                <Filter className="h-5 w-5 mr-2" />
                {isFilterPanelOpen ? 'Hide Filters' : 'Show Filters'}
                {getActiveFilters().length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs font-bold rounded-full bg-blue-900 text-yellow-400">
                    {getActiveFilters().length}
                  </span>
                )}
              </Button>
              <Button
                data-testid="button-view-cart"
                onClick={() => setIsCartExpanded(!isCartExpanded)}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-3.5 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 border-0 relative"
              >
                <ShoppingCart className="h-5 w-5 mr-2" />
                {isCartExpanded ? 'Hide' : 'View'} Cart & Orders
                {cartItems.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs font-bold rounded-full bg-white text-green-600">
                    {cartItems.length}
                  </span>
                )}
              </Button>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                  {viewMode === 'grid' 
                    ? 'Browse products with filters and visual selection' 
                    : 'Advanced bulk ordering with filtering and selection tools'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Tabs for Brands & Collections with Deals Banner */}
      <div className="bg-white/60 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 overflow-x-hidden">
        <div className="px-6 max-w-full overflow-x-hidden">
          <div className="flex items-center space-x-8 border-b border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('brands')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'brands' 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
              data-testid="tab-brands"
            >
              Brands
            </button>
            <button
              onClick={() => setActiveTab('deals')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'deals' 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
              data-testid="tab-deals"
            >
              Collections & Deals
            </button>
          </div>
          {activeTab === 'brands' ? (
            <div className="py-4 overflow-x-hidden">
              <BrandLogoFilter
                filters={filters}
                onToggleArrayFilter={toggleArrayFilter}
                variant="cards"
              />
            </div>
          ) : (
            <div className="space-y-0 overflow-x-hidden">
              <DealsBanner
                selectedCollections={filters.collections || []}
                onSelectCollection={(collection) => toggleArrayFilter('collections', collection)}
              />
              <div className="py-4 px-6">
                <CollectionsFilter
                  filters={filters}
                  onToggleArrayFilter={toggleArrayFilter}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex min-h-[calc(100vh-140px)] relative">
        {viewMode === 'grid' && !showPreCart && (
          <div className="flex-1 p-6 relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Select Products</h2>
            </div>
            <ProductGrid 
              filters={filters}
              onOpenSizeColorModal={(product) => {
                setSingleProductMode(product.id);
                setShowPreCart(true);
              }}
              selectedProducts={selectedProducts}
              onToggleSelection={(productId: string) => {
                setSelectedProducts(prev => 
                  prev.includes(productId) 
                    ? prev.filter(id => id !== productId)
                    : [...prev, productId]
                );
              }}
            />
            
            {/* Floating Action Button for Continue */}
            {selectedProducts.length > 0 && (
              <div className="fixed bottom-8 right-8 z-50 animate-in fade-in slide-in-from-bottom-4">
                <Button
                  onClick={() => setShowPreCart(true)}
                  className="bg-yellow-400 hover:bg-yellow-500 text-blue-900 font-bold px-8 py-6 text-lg rounded-full shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-105"
                  data-testid="button-proceed-to-precart"
                >
                  <ShoppingCart className="mr-3 h-6 w-6" />
                  Add to Cart ({selectedProducts.length} Product{selectedProducts.length !== 1 ? 's' : ''})
                  <ArrowRight className="ml-3 h-6 w-6" />
                </Button>
              </div>
            )}
          </div>
        )}
        
        {/* PreCartMatrix as sliding sheet - always rendered but controlled by isOpen */}
        <PreCartMatrix
          isOpen={showPreCart}
          selectedProductIds={singleProductMode ? [singleProductMode] : selectedProducts}
          onClose={() => {
            setShowPreCart(false);
            setSingleProductMode(null);
          }}
          onAddToCart={(productId, productName, items) => {
            addToCart(productId, productName, items);
            // Only clear selections if we're in multi-select mode (not single product mode)
            if (!singleProductMode) {
              setSelectedProducts([]);
            }
            setSingleProductMode(null);
            // Open cart overlay after adding to cart
            setIsCartExpanded(true);
          }}
        />
        
        {viewMode === 'bulk' && (
          <div className="flex-1">
            <div className="p-6">
              <div className="mb-6">
                <h2 className="text-base font-semibold mb-3">Smart Filter</h2>
                <SmartFilter
                  filters={filters}
                  onFilterChange={updateFilter}
                  onToggleArrayFilter={toggleArrayFilter}
                  onRemoveFilter={removeFilter}
                  activeFilters={getActiveFilters()}
                />
              </div>
              
              <GridOrderInterface 
                filters={filters}
                onToggleArrayFilter={toggleArrayFilter}
              />
            </div>
          </div>
        )}

        {viewMode === 'excel' && (
          <div className="flex-1 flex flex-col">
            {/* Excel Grid with Bucket at bottom */}
            <div className="flex-1 overflow-auto bg-white dark:bg-slate-900">
              <div className="p-2">
                
                <BrandExcelSelector 
                  filters={filters}
                  onFilterChange={updateFilter}
                  onToggleArrayFilter={toggleArrayFilter}
                  onRemoveFilter={removeFilter}
                  activeFilters={getActiveFilters()}
                  onAddToBucket={addToBucket}
                  bucketItems={bucketItems}
                  updateBucketQuantity={handleUpdateBucketQuantity}
                  removeFromBucket={handleRemoveFromBucket}
                  moveToCart={moveToCart}
                />
              </div>
            </div>
          </div>
        )}
      </div>
        
{/* Cart hidden to maximize product display space */}

      {isOrderWizardOpen && (
        <OrderWizard
          onClose={() => setIsOrderWizardOpen(false)}
          onComplete={(orderData) => {
            console.log('Order completed:', orderData);
            setIsOrderWizardOpen(false);
            // Here you would typically submit the order to your API
          }}
        />
      )}

      {/* Side Drawer Filter Panel */}
      {isFilterPanelOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 z-40 transition-opacity"
            onClick={() => setIsFilterPanelOpen(false)}
          />
          
          {/* Drawer */}
          <div 
            className="fixed left-0 top-0 h-full w-96 bg-white dark:bg-slate-800 z-50 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col"
          >
            {/* Header */}
            <div className="bg-blue-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                <h3 className="font-semibold text-lg">Filters</h3>
                {getActiveFilters().length > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-yellow-400 text-blue-900">
                    {getActiveFilters().length}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsFilterPanelOpen(false)}
                className="p-1 hover:bg-blue-800 rounded-lg transition-colors"
                data-testid="button-close-filters"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Filter Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {getActiveFilters().length > 0 && (
                <button
                  onClick={() => {
                    getActiveFilters().forEach(f => removeFilter(f.key, f.value));
                  }}
                  className="w-full mb-4 px-3 py-2 rounded-lg font-medium text-sm bg-red-50 dark:bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/30 transition-colors"
                  data-testid="button-clear-all-filters"
                >
                  Clear All Filters
                </button>
              )}
              <FilterSidebar
                filters={filters}
                onFilterChange={updateFilter}
                onToggleArrayFilter={toggleArrayFilter}
                onRemoveFilter={removeFilter}
                activeFilters={getActiveFilters()}
                isHorizontal={false}
              />
            </div>
          </div>
        </>
      )}

      {/* Cart Overlay */}
      <CartOverlay isExpanded={isCartExpanded} onToggle={() => setIsCartExpanded(!isCartExpanded)} />
      </div>
    </div>
  );
}
