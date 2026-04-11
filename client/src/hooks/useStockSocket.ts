import { useEffect, useRef, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

interface StockUpdateProduct {
  productId: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
  availableSizes?: { size: string; stock: number; reserved?: number }[];
}

interface StockMessage {
  type: "stock_update" | "connected";
  products?: StockUpdateProduct[];
  timestamp?: string;
}

export function useStockSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/stock`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data: StockMessage = JSON.parse(event.data);
        if (data.type === "stock_update") {
          queryClient.invalidateQueries({ queryKey: ["products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/stock/inventory"] });
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = (e) => {
      wsRef.current = null;
      if (e.code !== 1000) {
        reconnectRef.current = setTimeout(connect, 4000);
      }
    };

    ws.onerror = () => { /* onclose will fire */ };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close(1000);
      wsRef.current = null;
    };
  }, [connect]);
}
