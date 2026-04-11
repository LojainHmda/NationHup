import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, ShoppingCart, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{
    function: string;
    result: any;
  }>;
}

export function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hi! I\'m your WholeSale Pro shopping assistant. I can help you find products, check your cart, or navigate the store. What are you looking for today?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          }))
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const data = await response.json();

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
        toolCalls: data.toolCalls || []
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Handle navigation if requested
      if (data.toolCalls) {
        const navCall = data.toolCalls.find((tc: any) => tc.function === 'navigate_to');
        if (navCall && navCall.result.navigateTo) {
          setTimeout(() => {
            const page = navCall.result.navigateTo;
            const routes: Record<string, string> = {
              'cart': '/order-builder',
              'products': '/',
              'orders': '/order-history',
              'order-builder': '/order-builder'
            };
            if (routes[page]) {
              setLocation(routes[page]);
              setIsOpen(false);
            }
          }, 1000);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderProductCard = (product: any) => (
    <Card key={product.id} className="p-3 mb-2 hover:shadow-md transition-shadow">
      <div className="flex gap-3">
        <img
          src={product.image1}
          alt={product.name}
          className="w-20 h-20 object-cover rounded-md"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = 'https://via.placeholder.com/80x80?text=No+Image';
          }}
        />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm truncate">{product.name}</h4>
          <p className="text-xs text-muted-foreground">{product.brand}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs">
              ${product.wholesalePrice}
            </Badge>
            {product.isPreOrder && (
              <Badge className="text-xs bg-black text-white">
                Pre-Order
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {product.colourway || 'Default'} • {product.availableSizes.length} size{product.availableSizes.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </Card>
  );

  const renderCartItemCard = (cartProduct: any) => (
    <Card key={cartProduct.id} className="p-3 mb-2 hover:shadow-md transition-shadow border-green-200 bg-green-50 dark:bg-green-900/10">
      <div className="flex gap-3">
        <img
          src={cartProduct.image1}
          alt={cartProduct.name}
          className="w-20 h-20 object-cover rounded-md"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = 'https://via.placeholder.com/80x80?text=No+Image';
          }}
        />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm truncate">{cartProduct.name}</h4>
          <p className="text-xs text-muted-foreground">{cartProduct.brand}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs bg-green-600 text-white">
              ${cartProduct.wholesalePrice}
            </Badge>
            {cartProduct.isPreOrder && (
              <Badge className="text-xs bg-black text-white">
                Pre-Order
              </Badge>
            )}
          </div>
          {cartProduct.selections && (
            <div className="mt-2 space-y-1">
              {cartProduct.selections.map((selection: any, idx: number) => (
                <div key={idx} className="text-xs bg-white dark:bg-gray-800 rounded px-2 py-1 flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {selection.color} • Size {selection.size}
                  </span>
                  <span className="font-semibold">Qty: {selection.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );

  const renderCartSummary = (summary: any) => (
    <div className="space-y-2">
      <Card className="p-3 mb-2 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200">
        <div className="flex items-center gap-2 mb-2">
          <ShoppingCart className="w-4 h-4 text-yellow-600" />
          <h4 className="font-semibold text-sm">Cart Summary</h4>
        </div>
        {summary.isEmpty ? (
          <p className="text-sm text-muted-foreground">Your cart is empty</p>
        ) : (
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Total Items:</span>
              <span className="font-semibold">{summary.totalItems}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Total Price:</span>
              <span className="font-semibold text-green-600 dark:text-green-400">
                ${summary.totalPrice}
              </span>
            </div>
          </div>
        )}
      </Card>
      
      {/* Render cart items as cards */}
      {summary.cartProducts && summary.cartProducts.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2 text-muted-foreground">Items in Cart:</p>
          {summary.cartProducts.map((cartProduct: any) => renderCartItemCard(cartProduct))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 z-40"
          data-testid="button-open-chat"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] shadow-2xl rounded-lg overflow-hidden z-50 flex flex-col bg-background border">
          {/* Header */}
          <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              <div>
                <h3 className="font-semibold">Shopping Assistant</h3>
                <p className="text-xs opacity-90">WholeSale Pro</p>
              </div>
            </div>
            <Button
              onClick={() => setIsOpen(false)}
              variant="ghost"
              size="icon"
              className="text-white hover:bg-blue-700"
              data-testid="button-close-chat"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-3 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-background border'
                  }`}
                  data-testid={`message-${message.role}-${index}`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                  {/* Render product cards */}
                  {message.toolCalls && message.toolCalls.some(tc => tc.function === 'search_products') && (
                    <div className="mt-3">
                      {message.toolCalls
                        .filter(tc => tc.function === 'search_products')
                        .map((tc, tcIndex) => (
                          <div key={tcIndex}>
                            {tc.result.products.map((product: any) => renderProductCard(product))}
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Render cart summary */}
                  {message.toolCalls && message.toolCalls.some(tc => tc.function === 'get_cart_summary') && (
                    <div className="mt-3">
                      {message.toolCalls
                        .filter(tc => tc.function === 'get_cart_summary')
                        .map((tc, tcIndex) => (
                          <div key={tcIndex}>
                            {renderCartSummary(tc.result)}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-background border rounded-lg p-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t bg-background">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about products, cart, or anything..."
                disabled={isLoading}
                className="flex-1"
                data-testid="input-chat-message"
              />
              <Button
                type="submit"
                disabled={!input.trim() || isLoading}
                size="icon"
                data-testid="button-send-message"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
