import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
// Prevent server crash on unhandled errors - log and continue
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
import session from "express-session";
import connectPg from "connect-pg-simple";
import { registerRoutes, seedDefaultStaffUsers } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initWebSocket } from "./websocket";

const app = express();

// CRITICAL: Health check MUST be registered before any database/session initialization
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

const sessionTtl = 7 * 24 * 60 * 60 * 1000;
const PgStore = connectPg(session);
const sessionStore = new PgStore({
  conString: process.env.DATABASE_URL,
  createTableIfMissing: true,
  ttl: sessionTtl,
});

app.set("trust proxy", 1);
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "wholesale-secret-key-change-in-production",
  store: sessionStore,
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: process.env.SESSION_SECURE === "true",
    maxAge: sessionTtl,
  },
});
app.use(sessionMiddleware);

app.use('/uploads', express.static('uploads'));
app.use('/product-images', express.static('public/product-images'));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log("[init] Registering routes...");
    const server = await registerRoutes(app);
    console.log("[init] Seeding default staff...");
    await seedDefaultStaffUsers();
    console.log("[init] Starting WebSocket...");
    initWebSocket(server, sessionMiddleware);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      throw err;
    });

    if (app.get("env") === "development") {
      console.log("[init] Setting up Vite...");
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const port = parseInt(process.env.PORT || '5001', 10);
    const listenOptions: any = {
      port,
      host: "0.0.0.0",
    };
    if (process.platform !== 'win32') {
      listenOptions.reusePort = true;
    }
    server.listen(listenOptions, () => {
      const replitUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${port}`;

      console.log('\n🚀 Server ready!');
      console.log(`📱 Local:   http://localhost:${port}`);
      console.log(`🌐 Network: ${replitUrl}`);
      console.log(`\n👆 Click the link above to open your app\n`);

      log(`serving on port ${port}`);
    });
  } catch (err) {
    console.error("[init] Server failed to start:", err);
    process.exit(1);
  }
})();
