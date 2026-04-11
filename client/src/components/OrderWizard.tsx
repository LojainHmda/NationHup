import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  ChevronLeft, 
  ChevronRight, 
  ShoppingCart, 
  Package, 
  CreditCard, 
  CheckCircle, 
  Users, 
  Calculator,
  Truck,
  FileText,
  X,
  Plus,
  ArrowRight,
  Zap,
  Target,
  Sparkles,
  TrendingUp
} from "lucide-react";
import type { Product, CartItem, Category, Brand, Collection } from "@shared/schema";

interface OrderWizardProps {
  onClose: () => void;
  onComplete: (orderData: any) => void;
}

interface OrderStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface VariantSelection {
  productId: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  wholesalePrice: number;
}

interface WholesaleOrderData {
  selectedCategoryIds: string[];
  selectedBrandIds: string[];
  variantSelections: VariantSelection[];
  batchName?: string;
}

export function OrderWizard({ onClose, onComplete }: OrderWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [orderData, setOrderData] = useState<WholesaleOrderData>({
    selectedCategoryIds: [],
    selectedBrandIds: [],
    variantSelections: [],
    batchName: `Wholesale Order ${new Date().toLocaleDateString()}`
  });

  // Enhanced selection state for size grid highlighting
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ productId: string; color: string; size: string } | null>(null);
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set());

  // Data queries for wholesale journey
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  const { data: collections = [] } = useQuery<Collection[]>({
    queryKey: ["/api/collections"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Filtered data based on selections
  const filteredBrands = useMemo(() => {
    if (orderData.selectedCategoryIds.length === 0) return [];
    // Find collections that belong to the selected categories
    const categoryCollections = collections.filter(c => 
      orderData.selectedCategoryIds.includes(c.categoryId)
    );
    // Find brands that belong to those collections
    const filteredBrandsList = brands.filter(b => 
      b.collectionId && categoryCollections.some(c => c.id === b.collectionId)
    );
    return filteredBrandsList;
  }, [brands, collections, orderData.selectedCategoryIds]);

  const filteredProducts = useMemo(() => {
    if (orderData.selectedCategoryIds.length === 0 || orderData.selectedBrandIds.length === 0) return [];
    const selectedCategoryNames = categories
      .filter(c => orderData.selectedCategoryIds.includes(c.id))
      .map(c => c.name);
    const selectedBrandNames = brands
      .filter(b => orderData.selectedBrandIds.includes(b.id))
      .map(b => b.name);
    
    return products.filter(p => 
      selectedCategoryNames.includes(p.category) &&
      selectedBrandNames.includes(p.brand)
    );
  }, [products, categories, brands, orderData.selectedCategoryIds, orderData.selectedBrandIds]);

  // Helper functions
  const addVariantSelection = (selection: VariantSelection) => {
    setOrderData(prev => ({
      ...prev,
      variantSelections: [...prev.variantSelections, selection]
    }));
  };

  const removeVariantSelection = (index: number) => {
    setOrderData(prev => ({
      ...prev,
      variantSelections: prev.variantSelections.filter((_, i) => i !== index)
    }));
  };


  const steps: OrderStep[] = [
    {
      id: "selection",
      title: "Categories & Brands",
      description: "Choose categories and brands for your order",
      icon: <Target className="w-5 h-5" />,
      completed: orderData.selectedCategoryIds.length > 0 && orderData.selectedBrandIds.length > 0,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200"
    },
    {
      id: "variants",
      title: "Product Selection",
      description: "Select sizes, colors, and quantities",
      icon: <Package className="w-5 h-5" />,
      completed: orderData.variantSelections.length > 0,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200"
    },
    {
      id: "confirm",
      title: "Order Summary",
      description: "Review and confirm your wholesale order",
      icon: <Zap className="w-5 h-5" />,
      completed: false,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200"
    }
  ];

  // Calculate totals
  const calculateOrderTotal = () => {
    return orderData.variantSelections.reduce((total, variant) => {
      return total + (variant.wholesalePrice * variant.quantity);
    }, 0);
  };

  const calculateTotalPairs = () => {
    return orderData.variantSelections.reduce((total, variant) => {
      return total + variant.quantity;
    }, 0);
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  // Navigation gating
  const canGoNext = () => {
    switch(currentStep) {
      case 0: return orderData.selectedCategoryIds.length > 0 && orderData.selectedBrandIds.length > 0;
      case 1: return orderData.variantSelections.length > 0;
      default: return true;
    }
  };

  // Multi-selection handlers
  const toggleCategory = (categoryId: string) => {
    setOrderData(prev => {
      const isSelected = prev.selectedCategoryIds.includes(categoryId);
      const selectedCategoryIds = isSelected
        ? prev.selectedCategoryIds.filter(id => id !== categoryId)
        : [...prev.selectedCategoryIds, categoryId];
      
      return {
        ...prev,
        selectedCategoryIds,
        selectedBrandIds: [], // Reset brands when categories change
        variantSelections: []
      };
    });
  };

  const toggleBrand = (brandId: string) => {
    setOrderData(prev => {
      const isSelected = prev.selectedBrandIds.includes(brandId);
      const selectedBrandIds = isSelected
        ? prev.selectedBrandIds.filter(id => id !== brandId)
        : [...prev.selectedBrandIds, brandId];
      
      return {
        ...prev,
        selectedBrandIds,
        variantSelections: [] // Reset variants when brands change
      };
    });
  };

  // Step 1: Category Selection - Visual Card Style
  const CategorySelectionStep = () => {
    // Calculate category counts from products
    const categoryCounts = useMemo(() => {
      const counts: Record<string, number> = {};
      products.forEach(product => {
        counts[product.category] = (counts[product.category] || 0) + 1;
      });
      return counts;
    }, [products]);

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Package className="w-5 h-5 text-primary" />
            <span>Select Product Categories</span>
          </CardTitle>
          <p className="text-muted-foreground">Choose footwear categories for your wholesale order. Multiple selections allowed!</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => {
              const isSelected = orderData.selectedCategoryIds.includes(category.id);
              const productCount = categoryCounts[category.name] || 0;
              
              return (
                <div
                  key={category.id}
                  onClick={() => toggleCategory(category.id)}
                  className={`
                    relative cursor-pointer p-4 rounded-xl border-2 transition-all duration-300 hover:scale-105
                    ${isSelected 
                      ? 'border-primary bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950 dark:to-purple-950 shadow-lg transform scale-105' 
                      : 'border-border bg-card hover:border-primary/50 hover:shadow-md'
                    }
                  `}
                  data-testid={`category-card-${category.slug}`}
                >
                  <div className="flex flex-col items-center space-y-3">
                    <div className={`
                      w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300
                      ${isSelected 
                        ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }
                    `}>
                      <Package className="w-8 h-8" />
                    </div>
                    
                    <div className="text-center">
                      <h3 className={`font-semibold text-sm ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                        {category.name}
                      </h3>
                      {category.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {category.description}
                        </p>
                      )}
                    </div>
                    
                    <div className={`
                      px-2 py-1 rounded-full text-xs font-medium
                      ${isSelected 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground'
                      }
                    `}>
                      {productCount} {productCount === 1 ? 'product' : 'products'}
                    </div>
                    
                    {isSelected && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white text-xs font-bold">✓</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {orderData.selectedCategoryIds.length > 0 && (
            <div className="mt-8 space-y-6">
              {/* Selected Categories Summary */}
              <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950 dark:to-purple-950 rounded-xl border border-indigo-200 dark:border-indigo-800">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
                  <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                    Step 1 Complete - Categories Selected
                  </span>
                </div>
                <p className="text-sm text-indigo-600 dark:text-indigo-400">
                  {orderData.selectedCategoryIds.map(id => categories.find(c => c.id === id)?.name).join(', ')}
                </p>
              </div>

              {/* Immediate Brand Selection */}
              <div className="border-t-2 border-indigo-200 dark:border-indigo-700 pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full font-bold text-sm">
                    2
                  </div>
                  <h3 className="text-lg font-bold text-foreground">Now Select Your Brands</h3>
                  <div className="flex-1 h-0.5 bg-gradient-to-r from-indigo-200 to-purple-200 dark:from-indigo-800 dark:to-purple-800"></div>
                </div>
                
                <p className="text-sm text-muted-foreground mb-6">
                  Choose from {filteredBrands.length} available brands in your selected categories
                </p>

                {filteredBrands.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground bg-gray-50 dark:bg-gray-900 rounded-xl">
                    <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p className="font-medium">No brands available for these categories</p>
                    <p className="text-sm mt-1">Try selecting different categories above</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {filteredBrands.map((brand) => {
                      const isSelected = orderData.selectedBrandIds.includes(brand.id);
                      // Count products by selected categories only, not current brand selection
                      const selectedCategoryNames = categories
                        .filter(c => orderData.selectedCategoryIds.includes(c.id))
                        .map(c => c.name);
                      const brandProductCount = products.filter(p => 
                        selectedCategoryNames.includes(p.category) && p.brand === brand.name
                      ).length;
                      
                      return (
                        <div
                          key={brand.id}
                          onClick={() => toggleBrand(brand.id)}
                          className={`
                            relative cursor-pointer p-4 rounded-xl border-2 transition-all duration-300 hover:scale-105
                            ${isSelected 
                              ? 'border-primary bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950 dark:to-purple-950 shadow-lg transform scale-105' 
                              : 'border-border bg-card hover:border-primary/50 hover:shadow-md'
                            }
                          `}
                          data-testid={`brand-card-${brand.slug}`}
                        >
                          <div className="flex flex-col items-center space-y-3">
                            <div className={`
                              w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300
                              ${isSelected 
                                ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg' 
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                              }
                            `}>
                              {brand.logoUrl ? (
                                <img src={brand.logoUrl} alt={brand.name} className="w-8 h-8 object-contain" />
                              ) : (
                                <span className="text-lg font-bold">{brand.name.charAt(0)}</span>
                              )}
                            </div>
                            
                            <div className="text-center">
                              <h4 className={`font-semibold text-sm ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                                {brand.name}
                              </h4>
                            </div>
                            
                            <div className={`
                              px-2 py-1 rounded-full text-xs font-medium
                              ${isSelected 
                                ? 'bg-primary text-primary-foreground' 
                                : 'bg-muted text-muted-foreground'
                              }
                            `}>
                              {brandProductCount} {brandProductCount === 1 ? 'product' : 'products'}
                            </div>
                            
                            {isSelected && (
                              <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                                <span className="text-white text-xs font-bold">✓</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {orderData.selectedBrandIds.length > 0 && (
                  <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 rounded-xl border border-purple-200 dark:border-purple-800">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                      <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                        Step 2 Complete - Brands Selected
                      </span>
                    </div>
                    <p className="text-sm text-purple-600 dark:text-purple-400">
                      {orderData.selectedBrandIds.map(id => brands.find(b => b.id === id)?.name).join(', ')}
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300">
                      <TrendingUp className="w-4 h-4" />
                      <span className="font-medium">
                        Ready for product selection → {filteredProducts.length} products available
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Combined Selection Step (Categories + Brands) is now in CategorySelectionStep

  // Enhanced mouse selection handlers
  const handleMouseDown = useCallback((productId: string, color: string, size: string) => {
    setIsSelecting(true);
    setSelectionStart({ productId, color, size });
    const cellId = `${productId}-${color}-${size}`;
    setHighlightedCells(new Set([cellId]));
  }, []);

  const handleMouseEnter = useCallback((productId: string, color: string, size: string) => {
    if (!isSelecting || !selectionStart) return;
    
    // Only allow selection within same product and color
    if (productId !== selectionStart.productId || color !== selectionStart.color) return;
    
    const cellId = `${productId}-${color}-${size}`;
    const startCellId = `${selectionStart.productId}-${selectionStart.color}-${selectionStart.size}`;
    
    // Get all sizes for this product/color combo
    const product = filteredProducts.find(p => p.id === productId);
    if (!product) return;
    
    const sizes = product.availableSizes.map(s => s.size);
    const startIndex = sizes.indexOf(selectionStart.size);
    const currentIndex = sizes.indexOf(size);
    
    if (startIndex === -1 || currentIndex === -1) return;
    
    const minIndex = Math.min(startIndex, currentIndex);
    const maxIndex = Math.max(startIndex, currentIndex);
    
    const newHighlighted = new Set<string>();
    for (let i = minIndex; i <= maxIndex; i++) {
      newHighlighted.add(`${productId}-${color}-${sizes[i]}`);
    }
    
    setHighlightedCells(newHighlighted);
  }, [isSelecting, selectionStart, filteredProducts]);

  const handleMouseUp = useCallback(() => {
    if (!isSelecting || highlightedCells.size === 0) {
      setIsSelecting(false);
      setSelectionStart(null);
      setHighlightedCells(new Set());
      return;
    }

    // Add selections to variant selections with quantity 1 each
    const newSelections: VariantSelection[] = [];
    
    highlightedCells.forEach(cellId => {
      const [productId, color, size] = cellId.split('-');
      const product = filteredProducts.find(p => p.id === productId);
      if (product) {
        // Check if this variant already exists
        const existingIndex = orderData.variantSelections.findIndex(
          v => v.productId === productId && v.color === color && v.size === size
        );
        
        if (existingIndex === -1) {
          newSelections.push({
            productId,
            productName: product.name,
            size,
            color,
            quantity: 1,
            wholesalePrice: Number(product.wholesalePrice)
          });
        }
      }
    });

    if (newSelections.length > 0) {
      setOrderData(prev => ({
        ...prev,
        variantSelections: [...prev.variantSelections, ...newSelections]
      }));
    }

    setIsSelecting(false);
    setSelectionStart(null);
    setHighlightedCells(new Set());
  }, [isSelecting, highlightedCells, filteredProducts, orderData.variantSelections]);

  // Global mouse up listener to ensure selection is finalized even when mouse leaves grid
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelecting) {
        handleMouseUp();
      }
    };

    if (isSelecting) {
      document.addEventListener('mouseup', handleGlobalMouseUp);
      return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isSelecting, handleMouseUp]);

  // Step 3: Enhanced Variant Selection with Mouse Highlighting
  const VariantSelectionStep = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Calculator className="w-5 h-5 text-primary" />
          <span>Size & Color Selection</span>
        </CardTitle>
        <p className="text-muted-foreground">
          Drag to select multiple sizes, or click individual cells. Use mouse to highlight ranges!
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="border overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-start space-x-6 mb-6">
                  <img 
                    src={product.image1} 
                    alt={product.name}
                    className="w-20 h-20 object-cover rounded-xl shadow-lg"
                  />
                  <div className="flex-1">
                    <h4 className="font-bold text-lg mb-1">{product.name}</h4>
                    <p className="text-sm text-indigo-600 font-medium mb-2">{product.brand}</p>
                    <p className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                      ${product.wholesalePrice} per pair
                    </p>
                  </div>
                </div>

                {/* Interactive Size/Color Grid */}
                <div className="space-y-6">
                  {[product.colourway || 'Default'].map((color) => (
                    <div key={color} className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-5 h-5 rounded-full border-2 border-white shadow-lg"
                          style={{ backgroundColor: color.toLowerCase() === 'white' ? '#f8f8f8' : color.toLowerCase() }}
                        />
                        <h5 className="font-semibold text-lg">{color}</h5>
                      </div>
                      
                      <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-12 gap-2">
                        {product.availableSizes.map((sizeObj) => {
                          const cellId = `${product.id}-${color}-${sizeObj.size}`;
                          const isHighlighted = highlightedCells.has(cellId);
                          const isSelected = orderData.variantSelections.some(
                            v => v.productId === product.id && v.color === color && v.size === sizeObj.size
                          );
                          const isInStock = sizeObj.stock > 0;
                          
                          return (
                            <div
                              key={sizeObj.size}
                              className={`
                                relative select-none cursor-pointer h-12 rounded-xl border-2 flex items-center justify-center font-medium text-sm transition-all duration-300 transform hover:scale-105
                                ${!isInStock 
                                  ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 cursor-not-allowed' 
                                  : isSelected
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-indigo-400 shadow-lg transform scale-105'
                                    : isHighlighted
                                      ? 'bg-gradient-to-r from-indigo-200 to-purple-200 dark:from-indigo-800 dark:to-purple-800 border-indigo-400 shadow-md transform scale-102'
                                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50 dark:hover:bg-indigo-950'
                                }
                              `}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                if (isInStock) {
                                  // Click to toggle individual cell
                                  if (!isSelecting) {
                                    const isCurrentlySelected = orderData.variantSelections.some(
                                      v => v.productId === product.id && v.color === color && v.size === sizeObj.size
                                    );
                                    
                                    if (isCurrentlySelected) {
                                      // Remove selection
                                      setOrderData(prev => ({
                                        ...prev,
                                        variantSelections: prev.variantSelections.filter(
                                          v => !(v.productId === product.id && v.color === color && v.size === sizeObj.size)
                                        )
                                      }));
                                    } else {
                                      // Add selection
                                      const newSelection: VariantSelection = {
                                        productId: product.id,
                                        productName: product.name,
                                        size: sizeObj.size,
                                        color,
                                        quantity: 1,
                                        wholesalePrice: Number(product.wholesalePrice)
                                      };
                                      setOrderData(prev => ({
                                        ...prev,
                                        variantSelections: [...prev.variantSelections, newSelection]
                                      }));
                                    }
                                  } else {
                                    handleMouseDown(product.id, color, sizeObj.size);
                                  }
                                }
                              }}
                              onMouseEnter={() => isInStock && handleMouseEnter(product.id, color, sizeObj.size)}
                              data-testid={`size-cell-${cellId}`}
                            >
                              <span className="font-bold">{sizeObj.size}</span>
                              {!isInStock && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-full h-0.5 bg-red-400 transform rotate-45"></div>
                                </div>
                              )}
                              {isSelected && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                                  <span className="text-indigo-600 text-xs">✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {orderData.variantSelections.length > 0 && (
          <div className="mt-8 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950 dark:to-purple-950 rounded-2xl p-6 border border-indigo-200 dark:border-indigo-800">
            <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              Selected Variants ({calculateTotalPairs()} pairs)
            </h4>
            <div className="grid gap-3">
              {orderData.variantSelections.map((variant, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex-1">
                    <span className="font-semibold text-lg">{variant.productName}</span>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                        {variant.color}
                      </span>
                      <span className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                        Size {variant.size}
                      </span>
                      <Input
                        type="number"
                        min="1"
                        value={variant.quantity}
                        onChange={(e) => {
                          const newQuantity = parseInt(e.target.value) || 1;
                          setOrderData(prev => ({
                            ...prev,
                            variantSelections: prev.variantSelections.map((v, i) => 
                              i === index ? { ...v, quantity: newQuantity } : v
                            )
                          }));
                        }}
                        className="w-20 text-center"
                      />
                      <span className="font-bold text-indigo-600">
                        ${(variant.wholesalePrice * variant.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => removeVariantSelection(index)}
                    className="ml-4 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                    data-testid={`button-remove-variant-${index}`}
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl shadow-lg">
              <p className="font-bold text-xl text-center">
                Order Total: ${calculateOrderTotal().toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Step 3: Shipping & Payment
  // Step 4: Confirm Order
  const ConfirmStep = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <CheckCircle className="w-5 h-5 text-primary" />
          <span>Confirm Wholesale Order</span>
        </CardTitle>
        <p className="text-muted-foreground">Review your selections and complete your order</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold mb-3">Order Details</h4>
            <div className="space-y-2 text-sm">
              <p><strong>Categories:</strong> {orderData.selectedCategoryIds.map(id => categories.find(c => c.id === id)?.name).join(', ')}</p>
              <p><strong>Brands:</strong> {orderData.selectedBrandIds.map(id => brands.find(b => b.id === id)?.name).join(', ')}</p>
              <p><strong>Total Pairs:</strong> {calculateTotalPairs()}</p>
              <p><strong>Batch Name:</strong> {orderData.batchName}</p>
            </div>
          </div>
          
          <div>
            <h4 className="font-semibold mb-3">Pricing Summary</h4>
            <div className="space-y-2 text-sm">
              <p><strong>Subtotal:</strong> ${calculateOrderTotal().toFixed(2)}</p>
              <p><strong>Wholesale Discount:</strong> Applied</p>
              <p className="text-lg font-bold text-primary">
                <strong>Total:</strong> ${calculateOrderTotal().toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="font-semibold mb-3">Selected Variants</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {orderData.variantSelections.map((variant, index) => (
              <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                <div>
                  <span className="font-medium">{variant.productName}</span>
                  <p className="text-xs text-muted-foreground">
                    {variant.color} • Size {variant.size} • Qty: {variant.quantity}
                  </p>
                </div>
                <span className="font-medium">${(variant.wholesalePrice * variant.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center">
          <Button 
            size="lg" 
            onClick={() => onComplete(orderData)}
            data-testid="button-complete-order"
          >
            Complete Wholesale Order
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 0: return <CategorySelectionStep />;
      case 1: return <VariantSelectionStep />;
      case 2: return <ConfirmStep />;
      default: return null;
    }
  };


  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Complete order
      onComplete(orderData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Wholesale Order Wizard</h2>
            <Button variant="ghost" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Step {currentStep + 1} of {steps.length}</span>
              <span className="text-sm font-medium">{Math.round(progress)}% Complete</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Step Indicators */}
          <div className="flex items-center justify-between mb-6">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`
                  flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors
                  ${index <= currentStep ? 'bg-primary text-primary-foreground border-primary' : 'border-muted'}
                  ${step.completed ? 'bg-green-500 border-green-500' : ''}
                `}>
                  {step.completed ? <CheckCircle className="w-5 h-5" /> : step.icon}
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-16 h-0.5 mx-2 ${index < currentStep ? 'bg-primary' : 'bg-muted'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Step Content with modern card design */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="text-center mb-6">
              <div className={`inline-flex items-center space-x-3 px-6 py-3 rounded-full ${steps[currentStep].bgColor} ${steps[currentStep].borderColor} border`}>
                <div className={steps[currentStep].color}>
                  {React.cloneElement(steps[currentStep].icon as React.ReactElement, { className: "w-6 h-6" })}
                </div>
                <h3 className={`text-xl font-bold ${steps[currentStep].color}`}>{steps[currentStep].title}</h3>
              </div>
              <p className="text-gray-500 mt-3 text-lg">{steps[currentStep].description}</p>
            </div>
            <div className="transition-all duration-300 ease-in-out">
              {renderStep()}
            </div>
          </div>

          {/* Make.com Style Navigation */}
          <div className="bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 -mx-8 -mb-8 p-8 mt-8 rounded-b-2xl">
            <div className="flex items-center justify-between">
              <Button 
                variant="outline" 
                size="lg"
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
                className="bg-white shadow-lg hover:shadow-xl transition-all duration-200 border-gray-200 hover:border-gray-300 px-6"
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                Previous Step
              </Button>
              
              <div className="text-center px-4">
                <div className="text-sm text-gray-500 mb-1">Step {currentStep + 1} of {steps.length}</div>
                <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-400 mt-1">{Math.round(progress)}% Complete</div>
              </div>
              
              <Button 
                size="lg"
                onClick={handleNext}
                disabled={!canGoNext()}
                className={`shadow-lg hover:shadow-xl transition-all duration-300 px-8 ${
                  currentStep === steps.length - 1 
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700' 
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                } text-white border-0 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {currentStep === steps.length - 1 ? (
                  <>
                    <Zap className="w-5 h-5 mr-2" />
                    Complete Order
                  </>
                ) : (
                  <>
                    Next Step
                    <ChevronRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}