import { useState, useMemo } from "react";
import { Eye, Edit3, Trash2, Package, ShoppingBag, DollarSign, Users, ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface OrderItem {
  id: string;
  productId: string;
  name: string;
  brand: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  imageUrl: string;
  category: string;
  styleCode: string;
}

interface OrderDesignerProps {
  orderItems: OrderItem[];
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClose: () => void;
  onProceedToCheckout: () => void;
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

export function OrderDesigner({
  orderItems,
  onUpdateQuantity,
  onRemoveItem,
  onClose,
  onProceedToCheckout
}: OrderDesignerProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(0);

  // Order summary calculations
  const orderSummary = useMemo(() => {
    const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalValue = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const uniqueProducts = new Set(orderItems.map(item => item.productId)).size;
    const brandCounts = orderItems.reduce((acc, item) => {
      acc[item.brand] = (acc[item.brand] || 0) + item.quantity;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalItems,
      totalValue,
      uniqueProducts,
      brandCounts
    };
  }, [orderItems]);
  
  // Group items by category and brand
  const groupedItems = useMemo(() => {
    const groups = orderItems.reduce((acc, item) => {
      const key = `${item.category}-${item.brand}`;
      if (!acc[key]) {
        acc[key] = {
          category: item.category,
          brand: item.brand,
          items: []
        };
      }
      acc[key].items.push(item);
      return acc;
    }, {} as Record<string, { category: string; brand: string; items: OrderItem[] }>);
    
    return Object.values(groups);
  }, [orderItems]);

  // Define navigation steps
  const steps: OrderStep[] = [
    {
      id: "review",
      title: "Order Review",
      description: "Review your selected items and quantities",
      icon: <Eye className="w-5 h-5" />,
      completed: orderItems.length > 0,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200"
    },
    {
      id: "edit",
      title: "Edit & Adjust",
      description: "Make changes to quantities and remove items",
      icon: <Edit3 className="w-5 h-5" />,
      completed: false,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200"
    },
    {
      id: "finalize",
      title: "Finalize Order",
      description: "Confirm and proceed to checkout",
      icon: <CheckCircle className="w-5 h-5" />,
      completed: false,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200"
    }
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onProceedToCheckout();
    }
  };

  const handlePrevious = () => {
    setCurrentStep(Math.max(0, currentStep - 1));
  };

  const handleEditQuantity = (item: OrderItem) => {
    setEditingItemId(item.id);
    setEditQuantity(item.quantity);
  };
  
  const handleSaveQuantity = () => {
    if (editingItemId) {
      onUpdateQuantity(editingItemId, editQuantity);
      setEditingItemId(null);
      setEditQuantity(0);
    }
  };
  
  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditQuantity(0);
  };

  // Step Components
  const OrderReviewStep = () => (
    <div className="space-y-6">
      {/* Order Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full mx-auto mb-2">
              <ShoppingBag className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{orderSummary.totalItems}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Items</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full mx-auto mb-2">
              <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">${orderSummary.totalValue.toFixed(2)}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Value</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full mx-auto mb-2">
              <Package className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{orderSummary.uniqueProducts}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Unique Products</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full mx-auto mb-2">
              <Users className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{Object.keys(orderSummary.brandCounts).length}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Brands</div>
          </CardContent>
        </Card>
      </div>

      {/* Grouped Items Preview */}
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {groupedItems.map((group, index) => (
          <Card key={index} className="border-l-4 border-l-indigo-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Badge variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50">
                  {group.category}
                </Badge>
                <span className="text-gray-600">•</span>
                <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">
                  {group.brand}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {group.items.length} item{group.items.length !== 1 ? 's' : ''} • 
                {group.items.reduce((sum, item) => sum + item.quantity, 0)} total quantity • 
                ${group.items.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const EditAdjustStep = () => (
    <div className="space-y-6 max-h-96 overflow-y-auto">
      {groupedItems.map((group, groupIndex) => (
        <Card key={groupIndex} className="border-l-4 border-l-purple-500">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Badge variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50">
                {group.category}
              </Badge>
              <span className="text-gray-600">•</span>
              <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">
                {group.brand}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {group.items.map((item, itemIndex) => (
                <div key={itemIndex} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
                    <img 
                      src={item.image1} 
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.src = `data:image/svg+xml;base64,${btoa(`
                          <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                            <rect width="64" height="64" fill="#f3f4f6"/>
                            <text x="32" y="32" text-anchor="middle" dominant-baseline="central" 
                                  font-family="Arial, sans-serif" font-size="10" fill="#9ca3af">
                              No Image
                            </text>
                          </svg>
                        `)}`;
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">{item.name}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {item.color} • Size {item.size} • ${item.unitPrice.toFixed(2)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <div 
                        className="w-4 h-4 rounded-full border border-gray-300"
                        style={{ backgroundColor: item.color.toLowerCase() }}
                        title={item.color}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingItemId === item.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-20"
                          min="0"
                        />
                        <Button size="sm" onClick={handleSaveQuantity}>Save</Button>
                        <Button size="sm" variant="outline" onClick={handleCancelEdit}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold">{item.quantity}</span>
                        <Button size="sm" variant="outline" onClick={() => handleEditQuantity(item)}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onRemoveItem(item.id)} className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">${item.totalPrice.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const FinalizeStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mx-auto mb-4 flex items-center justify-center">
          <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Ready to Proceed</h3>
        <p className="text-gray-600 dark:text-gray-400">Your order is ready to be added to the cart and proceed to checkout.</p>
      </div>

      {/* Final Summary */}
      <Card className="border-2 border-green-200 dark:border-green-800">
        <CardHeader>
          <CardTitle className="text-green-700 dark:text-green-300">Order Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{orderSummary.totalItems}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Items</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">${orderSummary.totalValue.toFixed(2)}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Value</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Render step content
  const renderStep = () => {
    switch (currentStep) {
      case 0: return <OrderReviewStep />;
      case 1: return <EditAdjustStep />;
      case 2: return <FinalizeStep />;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" data-testid="order-designer-overlay">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] overflow-hidden flex flex-col m-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white p-8 relative">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold flex items-center gap-3 mb-2">
                <Package className="h-8 w-8" />
                Order Designer
              </h2>
              <p className="text-indigo-100 text-lg">Step-by-step order visualization and editing</p>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              className="text-white hover:bg-white/20 text-2xl h-10 w-10"
              data-testid="button-close-designer"
            >
              ✕
            </Button>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-6">
            <div className="w-full bg-white/20 rounded-full h-2">
              <div 
                className="bg-white h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="px-8 py-6 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-center">
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
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="bg-white dark:bg-gray-900 p-8 flex-1 overflow-auto">
            <div className="text-center mb-8">
              <div className={`inline-flex items-center space-x-3 px-6 py-3 rounded-full ${steps[currentStep].bgColor} ${steps[currentStep].borderColor} border`}>
                <div className={steps[currentStep].color}>
                  {steps[currentStep].icon}
                </div>
                <h3 className={`text-xl font-bold ${steps[currentStep].color}`}>{steps[currentStep].title}</h3>
              </div>
              <p className="text-gray-500 mt-3 text-lg">{steps[currentStep].description}</p>
            </div>
            <div className="transition-all duration-300 ease-in-out">
              {renderStep()}
            </div>
          </div>

          {/* Navigation */}
          <div className="bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 p-8 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <Button 
                variant="outline" 
                size="lg"
                onClick={handlePrevious}
                disabled={currentStep === 0}
                className="bg-white shadow-lg hover:shadow-xl transition-all duration-200 border-gray-200 hover:border-gray-300 px-6"
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                Previous Step
              </Button>
              
              <div className="text-center px-4">
                <div className="text-sm text-gray-500 mb-1">Step {currentStep + 1} of {steps.length}</div>
                <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">{steps[currentStep].title}</div>
              </div>
              
              <Button 
                size="lg"
                onClick={handleNext}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 px-6"
              >
                {currentStep === steps.length - 1 ? 'Complete Order' : 'Next Step'}
                <ChevronRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}