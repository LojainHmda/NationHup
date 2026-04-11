import { useEffect, useRef, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface OrderNotification {
  type: "new_order" | "connected";
  order?: {
    id: string;
    orderName: string;
    status: string;
    total: number;
    itemCount: number;
    submittedAt: string;
  };
  message?: string;
}

export function useAdminOrderSocket(enabled: boolean = true) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const connect = useCallback(() => {
    if (!enabled) return;
    
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/admin-orders`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[AdminOrderSocket] Connected");
      };

      ws.onmessage = (event) => {
        try {
          const data: OrderNotification = JSON.parse(event.data);
          
          if (data.type === "new_order" && data.order) {
            // Invalidate both admin and regular order queries
            queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
            queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
            
            toast({
              title: "New Order Received!",
              description: `${data.order.orderName} - $${data.order.total.toFixed(2)}`,
            });
          }
        } catch (error) {
          console.error("[AdminOrderSocket] Failed to parse message:", error);
        }
      };

      ws.onclose = (event) => {
        console.log("[AdminOrderSocket] Disconnected", event.code);
        wsRef.current = null;
        
        if (enabled && event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("[AdminOrderSocket] Attempting reconnect...");
            connect();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error("[AdminOrderSocket] Error:", error);
      };
    } catch (error) {
      console.error("[AdminOrderSocket] Failed to connect:", error);
    }
  }, [enabled, toast]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, "Component unmounting");
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    reconnect: connect,
  };
}
