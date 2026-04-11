import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { Request } from "express";
import { storage } from "./storage";

interface AdminConnection {
  ws: WebSocket;
  userId: string;
}

interface StockConnection {
  ws: WebSocket;
  sessionId: string;
}

const adminConnections: Map<string, AdminConnection> = new Map();
const stockConnections: Map<string, StockConnection> = new Map();

export function initWebSocket(server: Server, sessionParser: any) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (request: Request, socket, head) => {
    if (request.url === "/ws/admin-orders") {
      sessionParser(request, {} as any, async () => {
        const session = (request as any).session;
        const userId = session?.userId;
        
        if (!userId) {
          console.log("[WebSocket] Upgrade rejected: no session userId");
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        try {
          const user = await storage.getUser(userId);
          
          if (!user || user.role !== "admin") {
            console.log(`[WebSocket] Upgrade rejected: user ${userId} is not admin`);
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return;
          }

          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request, user);
          });
        } catch (error) {
          console.error("[WebSocket] Error during upgrade:", error);
          socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
          socket.destroy();
        }
      });
    } else if (request.url === "/ws/stock") {
      sessionParser(request, {} as any, () => {
        const session = (request as any).session;
        const sessionId = session?.id || `anon-${Date.now()}`;
        wss.handleUpgrade(request, socket, head, (ws) => {
          const connId = `stock-${sessionId}-${Date.now()}`;
          stockConnections.set(connId, { ws, sessionId });
          ws.send(JSON.stringify({ type: "connected", channel: "stock" }));
          ws.on("close", () => stockConnections.delete(connId));
          ws.on("error", () => stockConnections.delete(connId));
        });
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket, request: Request, user: any) => {
    const connectionId = `${user.id}-${Date.now()}`;
    
    adminConnections.set(connectionId, { ws, userId: user.id });
    console.log(`[WebSocket] Admin connected: ${user.displayName || user.email} (${connectionId})`);

    ws.send(JSON.stringify({ type: "connected", message: "Connected to admin orders stream" }));

    ws.on("close", () => {
      adminConnections.delete(connectionId);
      console.log(`[WebSocket] Admin disconnected: ${user.username}`);
    });

    ws.on("error", (error) => {
      console.error(`[WebSocket] Error for ${user.username}:`, error);
      adminConnections.delete(connectionId);
    });
  });

  return wss;
}

export function broadcastOrderSubmission(order: {
  id: string;
  orderName: string;
  status: string;
  total: number;
  itemCount: number;
  submittedAt: string;
}) {
  const message = JSON.stringify({
    type: "new_order",
    order,
  });

  let sentCount = 0;
  adminConnections.forEach(({ ws }, connectionId) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    } else {
      adminConnections.delete(connectionId);
    }
  });

  console.log(`[WebSocket] Broadcasted new order to ${sentCount} admin(s): ${order.orderName}`);
}

export function broadcastStockUpdate(productUpdates: {
  productId: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
  availableSizes?: { size: string; stock: number; reserved?: number }[];
}[]) {
  if (productUpdates.length === 0) return;

  const message = JSON.stringify({
    type: "stock_update",
    products: productUpdates,
    timestamp: new Date().toISOString(),
  });

  let sentCount = 0;

  const broadcast = (map: Map<string, { ws: WebSocket }>) => {
    map.forEach(({ ws }, connId) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        sentCount++;
      } else {
        map.delete(connId);
      }
    });
  };

  broadcast(adminConnections);
  broadcast(stockConnections);

  console.log(`[WebSocket] Stock update broadcast to ${sentCount} client(s) for ${productUpdates.length} product(s)`);
}
