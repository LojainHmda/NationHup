import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { registerRoutes, seedDefaultStaffUsers } from "./routes";
import { initWebSocket } from "./websocket";
import path from "path";
import fs from "fs";

const app = express();

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
    // Only use secure cookies if explicitly set AND using HTTPS (not HTTP)
    // Default to false to allow HTTP connections
    secure: process.env.SESSION_SECURE === "true",
    maxAge: sessionTtl,
  },
});
app.use(sessionMiddleware);

app.use('/uploads', express.static('uploads'));
app.use('/product-images', express.static('public/product-images'));

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      console.log(logLine);
    }
  });

  next();
});

function serveStatic(app: express.Express) {
  // When bundled, __dirname points to dist/, so public is at ./public
  // When running from project root, we need dist/public
  let distPath = path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(distPath)) {
    // Fallback: maybe we're running from inside dist/
    distPath = path.resolve(process.cwd(), "public");
  }

  if (!fs.existsSync(distPath)) {
    throw new Error(`Could not find the build directory. Tried: ${path.resolve(process.cwd(), "dist", "public")} and ${path.resolve(process.cwd(), "public")}`);
  }

  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

(async () => {
  const server = await registerRoutes(app);
  await seedDefaultStaffUsers();
  initWebSocket(server, sessionMiddleware);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  serveStatic(app);

  const port = parseInt(process.env.PORT || '5001', 10);
  const listenOptions: any = {
    port,
    host: "0.0.0.0",
  };
  // reusePort is not supported on Windows
  if (process.platform !== 'win32') {
    listenOptions.reusePort = true;
  }
  server.listen(listenOptions, () => {
    console.log(`\n🚀 Production server running on port ${port}\n`);
  });
})();
