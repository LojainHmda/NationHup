import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { products, brands, categories, collections, cartItems, orders, stockBatches, stockAdjustments, users, customerProfiles, insertCustomerProfileSchema, preorderCollectionSettings, sizeCharts, siteSettings, warehouseShipments, shipmentItems, preorderAllocations, preorderFulfillment, type Order } from "@shared/schema";
import { insertProductSchema, insertBrandSchema, insertCategorySchema, insertCollectionSchema, insertCartItemSchema, insertOrderSchema, insertStockBatchSchema, insertStockAdjustmentSchema, insertSizeChartSchema } from "@shared/schema";
import { eq, and, like, inArray, sql, asc } from "drizzle-orm";
import { z } from "zod";
import { uploadSingle, uploadBrandLogo, uploadCSV, uploadPreorder, uploadZip, getFileUrl, uploadCustomerDocuments } from "./multer.js";
import { withResolvedBrandLogo } from "./mediaUrl.js";
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import { hashPassword, verifyPassword, requireAuth, requireAdmin, requireCustomer, requireStaff, requireRole, optionalAuth, validateOrderApproval, type AuthenticatedRequest } from "./auth";
import * as client from "openid-client";
import OpenAI from "openai";
import AdmZip from 'adm-zip';
import { broadcastOrderSubmission, broadcastStockUpdate } from "./websocket";
import { jobManager, type UploadJob } from "./jobManager";
import { streamExcelPreview, countExcelRows, streamExcelRowsChunked, streamCsvRowsChunked, streamCsvPreview, readNdjsonStream } from "./excelStreamer";
import { detectPrimaryColor } from "./utils/colorDetection";

// Helper function to extract full-quality images directly from Excel ZIP media folder
interface FullQualityImage {
  mediaIndex: number;
  buffer: Buffer;
  extension: string;
  originalFileName: string;
}

/** Draft cart: session owner, customer owner, staff who created on behalf, or AM assigned to customer */
async function userCanModifyDraftOrder(
  order: Order,
  req: AuthenticatedRequest,
  sessionId: string,
): Promise<boolean> {
  const uid = req.user?.id ?? null;
  if (order.sessionId === sessionId) return true;
  if (uid && order.userId === uid) return true;
  if (!req.user) return false;
  if (order.createdByAccountManagerId && order.createdByAccountManagerId === uid) return true;
  if (req.user.role === "account_manager" && order.userId) {
    const assigned = await storage.getCustomerProfilesByAccountManager(uid);
    return assigned.some((cp) => cp.userId === order.userId);
  }
  if (req.user.role === "admin") return true;
  return false;
}

async function extractFullQualityImagesFromExcel(filePath: string): Promise<FullQualityImage[]> {
  const images: FullQualityImage[] = [];
  
  try {
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    
    // Find all images in xl/media/ folder (this contains original full-quality images)
    for (const entry of zipEntries) {
      if (entry.entryName.startsWith('xl/media/') && !entry.isDirectory) {
        const fileName = path.basename(entry.entryName);
        const ext = path.extname(fileName).toLowerCase().replace('.', '');
        
        // Only process image files
        if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) {
          const buffer = entry.getData();
          
          // Extract the index from filename (e.g., "image1.png" -> 1)
          const match = fileName.match(/(\d+)/);
          const mediaIndex = match ? parseInt(match[1]) : images.length + 1;
          
          images.push({
            mediaIndex,
            buffer,
            extension: ext === 'jpeg' ? 'jpg' : ext,
            originalFileName: fileName
          });
          
          console.log(`Full-quality image extracted: ${fileName} (${buffer.length} bytes)`);
        }
      }
    }
    
    // Sort by media index to maintain order
    images.sort((a, b) => a.mediaIndex - b.mediaIndex);
    
    console.log(`Extracted ${images.length} full-quality images from Excel media folder`);
  } catch (error) {
    console.error('Error extracting images from Excel ZIP:', error);
  }
  
  return images;
}

// Helper function to generate image URL sequence by replacing suffix letter (A→B→C→D pattern)
// Example: https://example.com/100859_BBK_A.jpg → generates B, C, D variants
function generateImageUrlSequence(baseUrl: string): string[] {
  if (!baseUrl || typeof baseUrl !== 'string') {
    return [baseUrl];
  }
  
  // Match pattern: ends with _A or _a (case-insensitive) followed by file extension
  // Pattern: /_[Aa]\.(jpg|jpeg|png|gif|webp)$/
  const suffixPattern = /(_)([Aa])(\.[a-zA-Z]+)$/;
  const match = baseUrl.match(suffixPattern);
  
  if (!match) {
    // No _A pattern found, return just the original URL
    return [baseUrl];
  }
  
  const prefix = baseUrl.slice(0, match.index);
  const underscore = match[1];
  const letterCase = match[2] === 'A' ? 'upper' : 'lower';
  const extension = match[3];
  
  // Generate A, B, C, D variants
  const letters = letterCase === 'upper' ? ['A', 'B', 'C', 'D'] : ['a', 'b', 'c', 'd'];
  
  return letters.map(letter => `${prefix}${underscore}${letter}${extension}`);
}

// Resolve row column key - handles casing/whitespace mismatches between mapping and actual keys
function resolveColumnKey(row: Record<string, any>, columnName: string | null | undefined): string | null {
  if (!columnName || typeof columnName !== 'string') return null;
  const wanted = String(columnName).trim().toLowerCase();
  if (!wanted) return null;
  for (const k of Object.keys(row)) {
    if (k.startsWith('_')) continue;
    if (String(k).trim().toLowerCase() === wanted) return k;
  }
  return columnName;
}

// Helper function to build category lookup key for pre-order processing
// Ensures consistent key construction between analyze and process endpoints
// Returns null if no usable key can be constructed
function buildCategoryLookupKey(gender: string | null | undefined, ageGroup: string | null | undefined): string | null {
  const trimmedGender = gender ? String(gender).trim() : '';
  const trimmedAgeGroup = ageGroup ? String(ageGroup).trim() : '';
  
  // Return null if no gender value (can't build a key without gender)
  if (!trimmedGender) {
    return null;
  }
  
  // Build composite key only if both values are non-empty
  if (trimmedAgeGroup) {
    return `${trimmedGender} | ${trimmedAgeGroup}`;
  }
  
  // Single gender key
  return trimmedGender;
}

// Helper function to get inactive pre-order collections from database
async function getInactivePreorderCollections(): Promise<Set<string>> {
  const settings = await db.select().from(preorderCollectionSettings).where(eq(preorderCollectionSettings.isActive, false));
  return new Set(settings.map(s => s.collectionName));
}

// Auto-seed default staff users (Sales, Finance) on server startup
export async function seedDefaultStaffUsers(): Promise<void> {
  try {
    const seedUsers = [
      { username: 'Sales', password: 'Sales', role: 'sales', displayName: 'Sales Manager' },
      { username: 'Finance', password: 'Finance', role: 'finance', displayName: 'Finance Manager' },
    ];

    for (const userData of seedUsers) {
      const existing = await storage.getUserByUsername(userData.username);
      if (!existing) {
        const hashedPassword = await hashPassword(userData.password);
        await storage.createUser({
          username: userData.username,
          password: hashedPassword,
          role: userData.role,
          displayName: userData.displayName,
        });
        console.log(`✅ Created default ${userData.role} user: ${userData.username}`);
      }
    }
  } catch (error) {
    console.error("Error seeding default staff users:", error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ==================== AUTHENTICATION ROUTES ====================
  
  // Get current user (no auth required - returns null if not logged in)
  app.get("/api/auth/user", async (req, res) => {
    try {
      if (!req.session || !req.session.userId) {
        return res.json(null);
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        req.session.destroy(() => {});
        return res.json(null);
      }

      // Get customer profile permissions and tax rate
      let orderPermissions: Record<string, any> = { allowPreOrders: true };
      let taxRate: string | null = null;
      // Always try to load a customer profile (customers, admins, and staff may all have one)
      const customerProfile = await storage.getCustomerProfile(user.id);
      if (customerProfile) {
        if (user.role === 'customer') {
          orderPermissions = {
            allowPreOrders: (customerProfile as any).allowPreOrders ?? true,
          };
        }
        taxRate = (customerProfile as any).taxRate ?? null;
      }

      const responseUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
        profilePicture: user.profilePicture,
        preferredCurrency: user.preferredCurrency,
        taxRate,
        ...orderPermissions,
      };

      res.json(responseUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.json(null);
    }
  });

  // Check for duplicate email/phone before creating customer
  app.get("/api/check-duplicate", async (req, res) => {
    try {
      const { email, phone } = req.query;
      const result: { emailExists: boolean; phoneExists: boolean } = {
        emailExists: false,
        phoneExists: false,
      };

      if (email && typeof email === 'string') {
        const normalizedEmail = email.toLowerCase().trim();
        // Check users table with case-insensitive lookup
        const [userByEmail] = await db.select()
          .from(users)
          .where(sql`LOWER(${users.email}) = ${normalizedEmail}`)
          .limit(1);
        if (userByEmail) {
          result.emailExists = true;
        } else {
          // Check customerProfiles table
          const [profileWithEmail] = await db.select()
            .from(customerProfiles)
            .where(sql`LOWER(${customerProfiles.email}) = ${normalizedEmail}`)
            .limit(1);
          if (profileWithEmail) {
            result.emailExists = true;
          }
        }
      }

      if (phone && typeof phone === 'string') {
        const normalizedPhone = phone.trim();
        // Check customerProfiles table for phone
        const [profileWithPhone] = await db.select()
          .from(customerProfiles)
          .where(eq(customerProfiles.phone, normalizedPhone))
          .limit(1);
        if (profileWithPhone) {
          result.phoneExists = true;
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Error checking duplicate:", error);
      res.status(500).json({ message: "Failed to check duplicates" });
    }
  });

  // Update current user's own profile
  app.patch("/api/auth/user", async (req, res) => {
    try {
      if (!req.session || !req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { displayName, email, preferredCurrency } = req.body;
      const updateData: any = {};
      
      if (displayName !== undefined) updateData.displayName = displayName;
      if (email !== undefined) updateData.email = email;
      if (preferredCurrency !== undefined) updateData.preferredCurrency = preferredCurrency;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const [updatedUser] = await db.update(users)
        .set(updateData)
        .where(eq(users.id, req.session.userId))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        displayName: updatedUser.displayName,
        profilePicture: updatedUser.profilePicture,
        preferredCurrency: updatedUser.preferredCurrency,
      });
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Admin login with username/password
  app.post("/api/auth/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      console.log("🔐 Admin login attempt:", { username, hasPassword: !!password });

      if (!username || !password) {
        console.log("❌ Missing credentials");
        return res.status(400).json({ message: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      console.log("👤 User lookup result:", user ? { id: user.id, username: user.username, role: user.role, hasPassword: !!user.password } : "NOT FOUND");
      
      // Allow admin, account_manager, sales, and finance roles to login via admin portal
      const allowedRoles = ['admin', 'account_manager', 'sales', 'finance'];
      if (!user || !allowedRoles.includes(user.role || '')) {
        console.log("❌ User not found or not authorized staff");
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!user.password) {
        console.log("❌ User has no password");
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isPasswordValid = await verifyPassword(password, user.password);
      console.log("🔑 Password verification:", isPasswordValid ? "SUCCESS" : "FAILED");
      
      if (!isPasswordValid) {
        console.log("❌ Invalid password");
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session!.userId = user.id;
      console.log("✅ Admin login successful");
      
      res.json({
        message: "Login successful",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
        }
      });
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Customer login with username/password (for testing)
  app.post("/api/auth/customer/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      
      if (!user || user.role !== 'customer') {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!user.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isPasswordValid = await verifyPassword(password, user.password);
      
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session!.userId = user.id;
      
      res.json({
        message: "Login successful",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
        }
      });
    } catch (error) {
      console.error("Customer login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Google OAuth for customers
  app.get("/api/auth/customer/oauth", async (req, res) => {
    try {
      const baseUrl = req.protocol + '://' + req.get('host');
      const redirectUri = `${baseUrl}/api/auth/customer/callback`;
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('openid email profile')}&` +
        `access_type=offline&` +
        `prompt=consent`;
      
      res.redirect(authUrl);
    } catch (error) {
      console.error("OAuth initiation error:", error);
      res.redirect('/login?error=oauth_init_failed');
    }
  });

  app.get("/api/auth/customer/callback", async (req, res) => {
    try {
      const { code, error } = req.query;
      
      if (error) {
        console.error("OAuth callback error:", error);
        return res.redirect('/login?error=oauth_failed');
      }

      if (!code || typeof code !== 'string') {
        return res.redirect('/login?error=no_code');
      }

      const baseUrl = req.protocol + '://' + req.get('host');
      const redirectUri = `${baseUrl}/api/auth/customer/callback`;

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        console.error("Token exchange failed:", await tokenResponse.text());
        return res.redirect('/login?error=token_failed');
      }

      const tokens = await tokenResponse.json();
      
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        console.error("Userinfo fetch failed");
        return res.redirect('/login?error=userinfo_failed');
      }

      const googleUser = await userInfoResponse.json();
      
      let user = await storage.getUserByGoogleId(googleUser.id);
      
      if (!user) {
        user = await storage.getUserByEmail(googleUser.email);
      }

      if (!user) {
        user = await storage.createUser({
          email: googleUser.email,
          googleId: googleUser.id,
          displayName: googleUser.name || googleUser.email.split('@')[0],
          profilePicture: googleUser.picture,
          role: 'customer',
          username: googleUser.email,
        });

        await storage.createCustomerProfile({
          userId: user.id,
          businessType: null,
          taxId: null,
          billingAddress: null,
          shippingAddresses: [],
          phone: null,
          creditLimit: "5000",
          isBlacklisted: false,
          blacklistReason: null,
          notes: null,
        });
      } else if (!user.googleId && googleUser.id) {
        await storage.upsertUser({
          ...user,
          googleId: googleUser.id,
          displayName: googleUser.name || user.displayName,
          profilePicture: googleUser.picture || user.profilePicture,
        });
      }

      req.session!.userId = user.id;
      
      res.redirect('/');
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.redirect('/login?error=callback_failed');
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session!.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logout successful" });
    });
  });

  // Get customer profile
  app.get("/api/profile", requireCustomer, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const profile = await storage.getCustomerProfile(req.user.id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Update customer profile (creates if doesn't exist - upsert behavior)
  app.patch("/api/profile", requireCustomer, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Check if profile exists first
      const existingProfile = await storage.getCustomerProfile(req.user.id);
      
      // Clone updates and remove protected fields
      const updates = { ...req.body };
      delete updates.userId;
      delete updates.id;
      delete updates.isBlacklisted;
      delete updates.blacklistReason;
      delete updates.creditLimit;
      
      if (!existingProfile) {
        // Create new profile with provided data
        const newProfile = await storage.createCustomerProfile({
          userId: req.user.id,
          ...updates,
        });
        return res.json(newProfile);
      }

      // Update existing profile
      const updatedProfile = await storage.updateCustomerProfile(req.user.id, updates);
      res.json(updatedProfile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // ==================== AI CHATBOT ROUTES ====================
  
  // Initialize OpenAI client with Replit AI Integrations (optional)
  const openai = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      })
    : null;

  // Chat endpoint with function calling
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      // Use the same session ID as the cart endpoint
      const sessionId = req.sessionID || "anonymous";
      
      console.log("💬 Chat request - Session ID:", sessionId);

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ message: "Messages array required" });
      }

      if (!openai) {
        return res.status(503).json({ message: "Chat service is not configured. Please set OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY environment variable." });
      }

      // Define available functions for the AI
      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
        {
          type: "function",
          function: {
            name: "search_products",
            description: "Search for products by name, brand, category, or other attributes. Returns product cards with details.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query (product name, brand, category, etc.)"
                },
                brand: {
                  type: "string",
                  description: "Filter by brand name"
                },
                category: {
                  type: "string",
                  description: "Filter by category"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of products to return (default 6)"
                }
              },
              required: []
            }
          }
        },
        {
          type: "function",
          function: {
            name: "get_cart_summary",
            description: "Get the current shopping cart contents and summary including total items, total price, and item details.",
            parameters: {
              type: "object",
              properties: {},
              required: []
            }
          }
        },
        {
          type: "function",
          function: {
            name: "navigate_to",
            description: "Navigate the user to a specific page in the application",
            parameters: {
              type: "object",
              properties: {
                page: {
                  type: "string",
                  enum: ["cart", "products", "orders", "order-builder"],
                  description: "The page to navigate to"
                }
              },
              required: ["page"]
            }
          }
        }
      ];

      // Call OpenAI with function calling
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a helpful shopping assistant for WholeSale Pro, a B2B wholesale footwear platform. 
            
Your capabilities:
- Search and recommend products based on customer needs
- Show product cards with images, prices, and details
- Navigate users to their cart or other pages
- Summarize cart contents and provide order insights

When showing products, be enthusiastic and helpful. Highlight key features like brand, price, and availability. 
If a customer asks about their cart, provide a clear summary with totals.
Always be professional and concise in your responses.`
          },
          ...messages
        ],
        tools,
        tool_choice: "auto",
        temperature: 0.7,
        max_tokens: 1000
      });

      const responseMessage = completion.choices[0].message;
      
      // Handle function calls
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        const toolCalls = responseMessage.tool_calls;
        const functionResults: any[] = [];

        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'function') continue;
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          let functionResult: any = {};

          if (functionName === "search_products") {
            // Search products
            const { query = '', brand, category, limit = 6 } = functionArgs;
            
            let productsQuery = db.select().from(products);
            const conditions = [];

            if (query) {
              conditions.push(
                sql`(${products.name} ILIKE ${`%${query}%`} OR ${products.brand} ILIKE ${`%${query}%`} OR ${products.category} ILIKE ${`%${query}%`})`
              );
            }
            if (brand) {
              conditions.push(eq(products.brand, brand));
            }
            if (category) {
              conditions.push(eq(products.category, category));
            }

            if (conditions.length > 0) {
              productsQuery = productsQuery.where(and(...conditions)) as any;
            }

            const foundProducts = await productsQuery.limit(limit);
            
            functionResult = {
              products: foundProducts.map(p => ({
                id: p.id,
                name: p.name,
                brand: p.brand,
                category: p.category,
                wholesalePrice: p.wholesalePrice,
                retailPrice: p.retailPrice,
                image1: p.image1,
                colourway: p.colourway,
                availableSizes: p.availableSizes,
                isPreOrder: p.isPreOrder
              })),
              count: foundProducts.length
            };
          } else if (functionName === "get_cart_summary") {
            // Get cart items using storage interface (in-memory)
            console.log("🛒 Getting cart for session:", sessionId);
            const cart = await storage.getCartItems(sessionId);
            
            console.log("📦 Cart items found:", cart.length);

            let totalItems = 0;
            let totalPrice = 0;
            const itemDetails = [];
            const cartProducts = [];

            for (const item of cart) {
              const product = await storage.getProduct(item.productId);

              if (product) {
                // Cart items have selections array with color/size/quantity
                for (const selection of item.selections) {
                  const itemTotal = parseFloat(product.wholesalePrice) * selection.quantity;
                  totalItems += selection.quantity;
                  totalPrice += itemTotal;

                  itemDetails.push({
                    name: product.name,
                    brand: product.brand,
                    size: selection.size,
                    quantity: selection.quantity,
                    unitPrice: product.wholesalePrice,
                    itemTotal: itemTotal.toFixed(2)
                  });
                }

                // Add full product details for card rendering
                cartProducts.push({
                  id: product.id,
                  name: product.name,
                  brand: product.brand,
                  category: product.category,
                  image1: product.image1,
                  wholesalePrice: product.wholesalePrice,
                  retailPrice: product.retailPrice,
                  colourway: product.colourway,
                  availableSizes: product.availableSizes,
                  isPreOrder: product.isPreOrder,
                  selections: item.selections
                });
              }
            }

            functionResult = {
              totalItems,
              totalPrice: totalPrice.toFixed(2),
              items: itemDetails,
              cartProducts,
              isEmpty: cart.length === 0
            };
          } else if (functionName === "navigate_to") {
            // Navigation command
            functionResult = {
              navigateTo: functionArgs.page,
              message: `Navigating to ${functionArgs.page}...`
            };
          }

          functionResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: JSON.stringify(functionResult)
          });
        }

        // Make second API call with function results
        const secondCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a helpful shopping assistant for WholeSale Pro. Present information clearly and concisely.`
            },
            ...messages,
            responseMessage,
            ...functionResults
          ],
          temperature: 0.7,
          max_tokens: 1000
        });

        const finalResponse = secondCompletion.choices[0].message;

        return res.json({
          message: finalResponse.content,
          toolCalls: toolCalls.map((tc, i) => ({
            function: tc.type === 'function' ? tc.function.name : 'unknown',
            result: JSON.parse(functionResults[i].content)
          }))
        });
      }

      // No function calls - just return the message
      res.json({
        message: responseMessage.content,
        toolCalls: []
      });
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ message: "Chat failed", error: (error as Error).message });
    }
  });

  // Admin: Get all customer profiles
  app.get("/api/admin/customers", requireAdmin, async (req, res) => {
    try {
      const allUsers = await db.select().from(users).where(eq(users.role, 'customer'));
      const profiles = await Promise.all(
        allUsers.map(async (user) => {
          const profile = await storage.getCustomerProfile(user.id);
          return {
            user: {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              profilePicture: user.profilePicture,
              createdAt: user.createdAt,
            },
            profile,
          };
        })
      );

      res.json(profiles);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  // Admin: Update customer profile (including blacklist, credit limit)
  app.patch("/api/admin/customers/:userId/profile", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const updates = req.body;

      const updatedProfile = await storage.updateCustomerProfile(userId, updates);
      
      if (!updatedProfile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      res.json(updatedProfile);
    } catch (error) {
      console.error("Error updating customer profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // ============= USER ROLES MANAGEMENT =============

  // Admin: Get all staff users (non-customer users)
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const allUsers = await db.select().from(users);
      const staffUsers = allUsers.filter(u => u.role !== 'customer');
      res.json(staffUsers.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        createdAt: u.createdAt,
      })));
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Admin: Create a new staff user
  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const { username, password, role, displayName, email } = req.body;
      
      if (!username || !password || !role) {
        return res.status(400).json({ message: "Username, password and role are required" });
      }

      const validRoles = ['sales', 'finance', 'admin', 'account_manager', 'warehouse'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Valid roles: ${validRoles.join(', ')}` });
      }

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await hashPassword(password);
      const newUser = await storage.createUser({
        username,
        password: hashedPassword,
        role,
        displayName: displayName || username,
        email: email || null,
      });

      res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role,
        createdAt: newUser.createdAt,
      });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Admin: Update user role
  app.patch("/api/admin/users/:userId", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { role, displayName, email } = req.body;

      const validRoles = ['customer', 'sales', 'finance', 'admin', 'account_manager', 'warehouse'];
      if (role && !validRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Valid roles: ${validRoles.join(', ')}` });
      }

      const updateData: any = {};
      if (role) updateData.role = role;
      if (displayName !== undefined) updateData.displayName = displayName;
      if (email !== undefined) updateData.email = email;

      const [updatedUser] = await db.update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        role: updatedUser.role,
        createdAt: updatedUser.createdAt,
      });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Admin: Delete user
  app.delete("/api/admin/users/:userId", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const authReq = req as AuthenticatedRequest;
      
      if (authReq.user?.id === userId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      await db.delete(users).where(eq(users.id, userId));
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Seed default Sales and Finance users
  app.post("/api/admin/seed-users", requireAdmin, async (req, res) => {
    try {
      const seedUsers = [
        { username: 'Sales', password: 'Sales', role: 'sales', displayName: 'Sales Manager' },
        { username: 'Finance', password: 'Finance', role: 'finance', displayName: 'Finance Manager' },
      ];

      const createdUsers = [];
      for (const userData of seedUsers) {
        const existing = await storage.getUserByUsername(userData.username);
        if (existing) {
          createdUsers.push({ ...userData, status: 'already_exists', id: existing.id });
          continue;
        }

        const hashedPassword = await hashPassword(userData.password);
        const newUser = await storage.createUser({
          username: userData.username,
          password: hashedPassword,
          role: userData.role,
          displayName: userData.displayName,
        });
        createdUsers.push({ ...userData, status: 'created', id: newUser.id });
      }

      res.json({ message: "Seed users processed", users: createdUsers });
    } catch (error) {
      console.error("Error seeding users:", error);
      res.status(500).json({ message: "Failed to seed users" });
    }
  });

  // ============= CUSTOMER USER MANAGEMENT (Regular Users) =============

  // Staff: Search customer users (for Account Managers to create orders on behalf of customers)
  app.get("/api/staff/customers/search", requireStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const searchQuery = (req.query.q as string || '').toLowerCase().trim();
      const allUsers = await db.select().from(users);
      let customerUsers = allUsers.filter(u => u.role === 'customer');

      if (req.user?.role === 'account_manager') {
        const assigned = await storage.getCustomerProfilesByAccountManager(req.user.id);
        const allowedIds = new Set(assigned.map((cp) => cp.userId));
        customerUsers = customerUsers.filter((u) => allowedIds.has(u.id));
      }

      // Filter by search query if provided
      const filteredUsers = searchQuery 
        ? customerUsers.filter(u => 
            (u.username?.toLowerCase().includes(searchQuery)) ||
            (u.displayName?.toLowerCase().includes(searchQuery)) ||
            (u.email?.toLowerCase().includes(searchQuery))
          )
        : customerUsers;
      
      // Return limited results (top 20)
      const results = filteredUsers.slice(0, 20).map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        displayName: u.displayName,
      }));
      
      res.json(results);
    } catch (error) {
      console.error("Error searching customers:", error);
      res.status(500).json({ message: "Failed to search customers" });
    }
  });

  // Admin: Get all customer users with their profiles
  app.get("/api/admin/customer-users", requireAdmin, async (req, res) => {
    try {
      const allUsers = await db.select().from(users);
      const customerUsers = allUsers.filter(u => u.role === 'customer');
      
      // Fetch profiles for all customer users
      const profiles = await db.select().from(customerProfiles);
      const profileMap = new Map(profiles.map(p => [p.userId, p]));
      
      const enrichedUsers = customerUsers.map(u => {
        const profile = profileMap.get(u.id);
        return {
          id: u.id,
          username: u.username,
          email: u.email,
          displayName: u.displayName,
          role: u.role,
          preferredCurrency: u.preferredCurrency,
          createdAt: u.createdAt,
          profile: profile ? {
            id: profile.id,
            legalName: profile.legalName,
            tradingName: profile.tradingName,
            type: profile.type,
            status: profile.status,
            taxVatNumber: profile.taxVatNumber,
            taxRate: profile.taxRate,
            registrationCountry: profile.registrationCountry,
            primaryContactName: profile.primaryContactName,
            email: profile.email,
            phone: profile.phone,
            phoneNumbers: profile.phoneNumbers,
            businessName: profile.businessName,
            ownerName: profile.ownerName,
            licenseNumber: profile.licenseNumber,
            tradeLicensePhotoUrl: profile.tradeLicensePhotoUrl,
            idPhotoUrl: profile.idPhotoUrl,
            storePhotoUrls: profile.storePhotoUrls,
            billingAddress: profile.billingAddress,
            shippingAddresses: profile.shippingAddresses,
            businessType: profile.businessType,
            taxId: profile.taxId,
            creditLimit: profile.creditLimit,
            isBlacklisted: profile.isBlacklisted,
            blacklistReason: profile.blacklistReason,
            notes: profile.notes,
            allowPreOrders: profile.allowPreOrders,
            defaultCurrency: profile.defaultCurrency,
            accountManagerId: profile.accountManagerId,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
          } : null,
        };
      });
      
      res.json(enrichedUsers);
    } catch (error) {
      console.error("Error fetching customer users:", error);
      res.status(500).json({ message: "Failed to fetch customer users" });
    }
  });

  // Admin: Update customer user account (username, password reset)
  app.patch("/api/admin/customer-users/:userId", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { username, displayName, email, preferredCurrency, newPassword } = req.body;

      const updateData: any = {};
      if (username !== undefined) updateData.username = username;
      if (displayName !== undefined) updateData.displayName = displayName;
      if (email !== undefined) updateData.email = email;
      if (preferredCurrency !== undefined) updateData.preferredCurrency = preferredCurrency;
      if (newPassword) {
        updateData.password = await hashPassword(newPassword);
      }

      const [updatedUser] = await db.update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        preferredCurrency: updatedUser.preferredCurrency,
        createdAt: updatedUser.createdAt,
      });
    } catch (error: any) {
      console.error("Error updating customer user:", error);
      if (error?.code === '23505') {
        return res.status(400).json({ message: "Username or email already exists" });
      }
      res.status(500).json({ message: "Failed to update customer user" });
    }
  });

  // Admin: Update customer profile (status, permissions, etc.)
  app.patch("/api/admin/customer-users/:userId/profile", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const body = req.body;

      // Validate incoming data with Zod schema - allows partial updates
      const updateSchema = z.object({
        status: z.enum(['Active', 'Suspended', 'On-Hold']).optional(),
        legalName: z.string().nullable().optional(),
        tradingName: z.string().nullable().optional(),
        type: z.string().optional(),
        taxVatNumber: z.string().nullable().optional(),
        taxRate: z.union([z.string(), z.number()]).nullable().optional(),
        registrationCountry: z.string().nullable().optional(),
        primaryContactName: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        phoneNumbers: z.array(z.string()).nullable().optional(),
        alternateEmail: z.string().nullable().optional(),
        companyName: z.string().nullable().optional(),
        businessName: z.string().nullable().optional(),
        ownerName: z.string().nullable().optional(),
        licenseNumber: z.string().nullable().optional(),
        tradeLicensePhotoUrl: z.string().nullable().optional(),
        idPhotoUrl: z.string().nullable().optional(),
        storePhotoUrls: z.array(z.string()).nullable().optional(),
        businessType: z.string().nullable().optional(),
        taxId: z.string().nullable().optional(),
        creditLimit: z.string().nullable().optional(),
        isBlacklisted: z.boolean().optional(),
        blacklistReason: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        allowPreOrders: z.boolean().optional(),
        defaultCurrency: z.string().optional(),
        accountManagerId: z.string().nullable().optional(),
        billingAddress: z.object({
          line1: z.string(),
          line2: z.string().optional(),
          city: z.string(),
          state: z.string().optional(),
          postalCode: z.string(),
          country: z.string(),
        }).nullable().optional(),
        shippingAddresses: z.array(z.object({
          label: z.string(),
          line1: z.string(),
          line2: z.string().optional(),
          city: z.string(),
          state: z.string().optional(),
          postalCode: z.string(),
          country: z.string(),
          isDefault: z.boolean(),
        })).nullable().optional(),
      });

      const parseResult = updateSchema.safeParse(body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid profile data", 
          errors: parseResult.error.errors 
        });
      }

      const validatedData = parseResult.data;
      
      // Build update object
      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };
      
      for (const [key, value] of Object.entries(validatedData)) {
        if (value !== undefined) {
          updateData[key] = value;
        }
      }

      if (updateData.taxRate != null && updateData.taxRate !== "") {
        updateData.taxRate = String(updateData.taxRate);
      } else if (updateData.taxRate === "") {
        updateData.taxRate = "0";
      }

      const [updatedProfile] = await db.update(customerProfiles)
        .set(updateData)
        .where(eq(customerProfiles.userId, userId))
        .returning();

      if (!updatedProfile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      res.json(updatedProfile);
    } catch (error) {
      console.error("Error updating customer profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Admin: Delete customer user and their profile
  app.delete("/api/admin/customer-users/:userId", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Delete profile first (foreign key constraint)
      await db.delete(customerProfiles).where(eq(customerProfiles.userId, userId));
      
      // Then delete user
      await db.delete(users).where(eq(users.id, userId));
      
      res.json({ message: "Customer user deleted successfully" });
    } catch (error) {
      console.error("Error deleting customer user:", error);
      res.status(500).json({ message: "Failed to delete customer user" });
    }
  });

  // ============= END CUSTOMER USER MANAGEMENT =============

  // ============= END USER ROLES MANAGEMENT =============

  // Staff: Get all orders with user info (excluding draft carts)
  // Account Managers only see orders from their assigned customers
  app.get("/api/admin/orders", requireStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const allOrders = await storage.getAllOrders();

      const assignedUserIds =
        req.user?.role === 'account_manager'
          ? (await storage.getCustomerProfilesByAccountManager(req.user.id)).map((cp) => cp.userId)
          : [];

      // Show submitted orders for everyone; draft carts only for Account Managers (assigned customers)
      let submittedOrders = allOrders.filter((order) => {
        if (order.status === 'draft') {
          if (req.user?.role !== 'account_manager') return false;
          return !!(order.userId && assignedUserIds.includes(order.userId));
        }
        return true;
      });

      // Account Managers only see orders from their assigned customers
      if (req.user?.role === 'account_manager') {
        submittedOrders = submittedOrders.filter(
          (order) => order.userId && assignedUserIds.includes(order.userId),
        );
      }
      
      // Enrich orders with user info (prioritize displayName over username)
      // Also enrich items with product details (unitsPerCarton) for carton display
      const enrichedOrders = await Promise.all(
        submittedOrders.map(async (order) => {
          let customerName = order.customerName;
          let customerEmail = order.customerEmail;
          
          if (order.userId) {
            const user = await storage.getUser(order.userId);
            customerName = customerName || user?.displayName || user?.username || 'Unknown Customer';
            customerEmail = customerEmail || user?.email || '';
          }
          
          // Enrich items with product details (unitsPerCarton)
          const enrichedItems = await Promise.all(
            (order.items || []).map(async (item: any) => {
              if (item.unitsPerCarton) return item; // Already has carton info
              const product = await storage.getProduct(item.productId);
              return {
                ...item,
                unitsPerCarton: product?.unitsPerCarton || undefined,
              };
            })
          );
          
          return {
            ...order,
            customerName,
            customerEmail,
            items: enrichedItems,
          };
        })
      );
      
      res.json(enrichedOrders);
    } catch (error) {
      console.error("Error fetching all orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Admin: Approve order
  app.post("/api/admin/orders/:orderId/approve", requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { orderId } = req.params;
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (!order.userId) {
        return res.status(400).json({ message: "Order does not have an associated user" });
      }

      const validation = await validateOrderApproval(orderId, order.userId);
      
      if (!validation.valid) {
        await storage.updateOrder(orderId, {
          validationErrors: validation.errors,
        });
        
        return res.status(400).json({
          message: "Order validation failed",
          errors: validation.errors,
        });
      }

      const approvedOrder = await storage.approveOrder(orderId, req.user.id);
      
      res.json({
        message: "Order approved successfully",
        order: approvedOrder,
      });
    } catch (error) {
      console.error("Error approving order:", error);
      res.status(500).json({ message: "Failed to approve order" });
    }
  });

  // Admin: Reject order
  app.post("/api/admin/orders/:orderId/reject", requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { orderId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const rejectedOrder = await storage.rejectOrder(orderId, req.user.id, reason);
      
      if (!rejectedOrder) {
        return res.status(404).json({ message: "Order not found" });
      }

      res.json({
        message: "Order rejected successfully",
        order: rejectedOrder,
      });
    } catch (error) {
      console.error("Error rejecting order:", error);
      res.status(500).json({ message: "Failed to reject order" });
    }
  });

  // Admin: Migrate existing products to have primaryColor based on colourway
  app.post("/api/admin/migrate-primary-colors", async (req, res) => {
    try {
      // Get all products without primaryColor
      const allProducts = await db.select().from(products);
      let updated = 0;
      
      for (const product of allProducts) {
        if (!product.primaryColor && product.colourway) {
          const detectedColor = detectPrimaryColor(product.colourway);
          await db.update(products)
            .set({ primaryColor: detectedColor })
            .where(eq(products.id, product.id));
          updated++;
        } else if (!product.primaryColor) {
          // No colourway, set to Other
          await db.update(products)
            .set({ primaryColor: 'Other' })
            .where(eq(products.id, product.id));
          updated++;
        }
      }
      
      res.json({ 
        message: `Migration complete. Updated ${updated} products.`,
        total: allProducts.length,
        updated 
      });
    } catch (error) {
      console.error("Error migrating primary colors:", error);
      res.status(500).json({ message: "Failed to migrate primary colors" });
    }
  });

  // ==================== ACCOUNT MANAGERS ROUTE ====================
  // Admin version: Get all users with account_manager role (for admin edit dialogs)
  app.get("/api/admin/account-managers", requireAuth, async (req, res) => {
    try {
      const managers = await db.select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.role, "account_manager"));
      
      res.json(managers);
    } catch (error) {
      console.error("Error fetching account managers:", error);
      res.status(500).json({ message: "Failed to fetch account managers" });
    }
  });

  // Get all users with account_manager role (for assignment dropdown)
  // No auth required - this just returns public staff info for dropdowns
  app.get("/api/account-managers", async (req, res) => {
    try {
      const managers = await db.select({
        id: users.id,
        name: users.displayName,
        email: users.email,
        avatar: users.profilePicture,
      })
      .from(users)
      .where(eq(users.role, "account_manager"));
      
      // Map null names to username fallback
      const formattedManagers = managers.map(m => ({
        ...m,
        name: m.name || m.email?.split('@')[0] || 'Unknown',
      }));
      
      res.json(formattedManagers);
    } catch (error) {
      console.error("Error fetching account managers:", error);
      res.status(500).json({ message: "Failed to fetch account managers" });
    }
  });

  // ==================== CUSTOMER PROFILE ROUTES ====================
  // Get customer profile for current user
  app.get("/api/customer/profile", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const profile = await storage.getCustomerProfile(req.user.id);
      
      if (!profile) {
        return res.json(null);
      }

      res.json(profile);
    } catch (error) {
      console.error("Error fetching customer profile:", error);
      res.status(500).json({ message: "Failed to fetch customer profile" });
    }
  });

  // Upload customer profile photos (trade license, ID, store photos) - saves locally
  app.post("/api/customer/profile/upload-photo", requireAuth, uploadSingle.single('photo'), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const photoType = req.body.type as string; // 'tradeLicense', 'id', 'store'
      if (!['tradeLicense', 'id', 'store'].includes(photoType)) {
        return res.status(400).json({ message: "Invalid photo type" });
      }

      // Save locally to uploads/customer-documents folder
      const fs = await import('fs');
      const path = await import('path');
      
      const uploadDir = path.join(process.cwd(), 'uploads', 'customer-documents', photoType);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Generate unique filename with random suffix to prevent collisions
      const crypto = await import('crypto');
      const timestamp = Date.now();
      const randomSuffix = crypto.randomUUID().slice(0, 8);
      const ext = path.extname(req.file.originalname) || '.jpg';
      const filename = `${req.user.id}_${timestamp}_${randomSuffix}${ext}`;
      const destPath = path.join(uploadDir, filename);

      // Move file from temp location to destination
      const tempFilePath = req.file.path;
      fs.renameSync(tempFilePath, destPath);

      // Return the URL path (served by Express static middleware)
      const url = `/uploads/customer-documents/${photoType}/${filename}`;
      res.json({ url });
    } catch (error) {
      console.error("Error uploading customer photo:", error);
      res.status(500).json({ message: "Failed to upload photo" });
    }
  });

  // Upload customer documents (trade license, ID, store photos) for customer creation - handles multiple files
  app.post("/api/customer/upload-documents", requireAuth, uploadCustomerDocuments.fields([
    { name: 'tradeLicensePhoto', maxCount: 1 },
    { name: 'idPhoto', maxCount: 1 },
    { name: 'storePhoto0', maxCount: 1 },
    { name: 'storePhoto1', maxCount: 1 },
    { name: 'storePhoto2', maxCount: 1 },
    { name: 'storePhoto3', maxCount: 1 },
    { name: 'storePhoto4', maxCount: 1 },
  ]), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const fs = await import('fs');
      const path = await import('path');
      const crypto = await import('crypto');
      
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const result: {
        tradeLicensePhotoUrl?: string;
        idPhotoUrl?: string;
        storePhotoUrls: string[];
      } = { storePhotoUrls: [] };

      const saveFile = async (file: Express.Multer.File, photoType: string): Promise<string> => {
        const uploadDir = path.join(process.cwd(), 'uploads', 'customer-documents', photoType);
        
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const timestamp = Date.now();
        const randomSuffix = crypto.randomUUID().slice(0, 8);
        const ext = path.extname(file.originalname) || '.jpg';
        const filename = `${req.user!.id}_${timestamp}_${randomSuffix}${ext}`;
        const destPath = path.join(uploadDir, filename);

        fs.renameSync(file.path, destPath);
        return `/uploads/customer-documents/${photoType}/${filename}`;
      };

      // Process trade license
      if (files.tradeLicensePhoto?.[0]) {
        result.tradeLicensePhotoUrl = await saveFile(files.tradeLicensePhoto[0], 'tradeLicense');
      }

      // Process ID photo
      if (files.idPhoto?.[0]) {
        result.idPhotoUrl = await saveFile(files.idPhoto[0], 'id');
      }

      // Process store photos
      for (let i = 0; i < 5; i++) {
        const storePhoto = files[`storePhoto${i}`]?.[0];
        if (storePhoto) {
          const url = await saveFile(storePhoto, 'store');
          result.storePhotoUrls.push(url);
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Error uploading customer documents:", error);
      res.status(500).json({ message: "Failed to upload documents" });
    }
  });

  // Update customer profile for current user (creates if doesn't exist - upsert behavior)
  app.patch("/api/customer/profile", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Check if profile exists first
      const existingProfile = await storage.getCustomerProfile(req.user.id);
      const updates = { ...req.body };
      
      if (!existingProfile) {
        // Create new profile with provided data
        const newProfile = await storage.createCustomerProfile({
          userId: req.user.id,
          ...updates,
        });
        return res.json(newProfile);
      }

      // Update existing profile
      const updatedProfile = await storage.updateCustomerProfile(req.user.id, updates);
      res.json(updatedProfile);
    } catch (error) {
      console.error("Error updating customer profile:", error);
      res.status(500).json({ message: "Failed to update customer profile" });
    }
  });

  // Create new customer account with auto-generated credentials (admin only)
  app.post("/api/admin/customers", requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const { email, businessName, primaryContactName, accountManagerId, preferredCurrency, ...profileRest } = body;

      const normalizeDocUrl = (v: unknown): string | null => {
        if (typeof v !== "string") return null;
        const t = v.trim();
        return t.length ? t : null;
      };

      const normalizeStorePhotoUrls = (v: unknown): string[] => {
        if (Array.isArray(v)) {
          return v.filter((u): u is string => typeof u === "string" && u.trim().length > 0).map((u) => u.trim());
        }
        if (typeof v === "string") {
          try {
            const parsed = JSON.parse(v);
            if (Array.isArray(parsed)) {
              return parsed.filter((u): u is string => typeof u === "string" && u.trim().length > 0).map((u) => u.trim());
            }
          } catch {
            /* ignore */
          }
        }
        return [];
      };

      if (!businessName?.trim()) {
        return res.status(400).json({ message: "Business name is required" });
      }

      // Email is optional; when provided, validate format and check for duplicates
      const emailValue = typeof email === "string" ? email.trim() : "";
      if (emailValue) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailValue)) {
          return res.status(400).json({ message: "Please enter a valid email address" });
        }
        const existingUser = await storage.getUserByEmail(emailValue);
        if (existingUser) {
          return res.status(400).json({ message: "A user with this email already exists" });
        }
      }

      // Generate username from business name
      const cleanBusinessName = businessName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      let username = "";
      let attempts = 0;
      const maxAttempts = 10;
      
      // Loop until we find a unique username
      while (attempts < maxAttempts) {
        const randomNum = Math.floor(Math.random() * 10000);
        username = `${cleanBusinessName}${randomNum}`;
        const existingUsername = await storage.getUserByUsername(username);
        if (!existingUsername) {
          break; // Found a unique username
        }
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        // Fallback: add timestamp to guarantee uniqueness
        username = `${cleanBusinessName}${Date.now()}`;
      }

      // Generate a random password
      const generatePassword = () => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
        let password = "";
        for (let i = 0; i < 12; i++) {
          password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
      };

      const plainPassword = generatePassword();
      const hashedPassword = await hashPassword(plainPassword);

      // Create the user account
      const newUser = await storage.createUser({
        username,
        password: hashedPassword,
        email: emailValue || null,
        displayName: primaryContactName || businessName,
        role: "customer",
        preferredCurrency: preferredCurrency || "USD",
      });

      const profileData: Record<string, unknown> = { ...profileRest };
      delete profileData.userId;
      delete profileData.id;

      const tradeLicensePhotoUrl = normalizeDocUrl(
        body.tradeLicensePhotoUrl ?? body.trade_license_photo_url ?? profileData.tradeLicensePhotoUrl ?? profileData.trade_license_photo_url,
      );
      const idPhotoUrl = normalizeDocUrl(
        body.idPhotoUrl ?? body.id_photo_url ?? profileData.idPhotoUrl ?? profileData.id_photo_url,
      );
      const storePhotoUrls = normalizeStorePhotoUrls(
        body.storePhotoUrls ?? body.store_photo_urls ?? profileData.storePhotoUrls ?? profileData.store_photo_urls,
      );

      delete profileData.tradeLicensePhotoUrl;
      delete profileData.trade_license_photo_url;
      delete profileData.idPhotoUrl;
      delete profileData.id_photo_url;
      delete profileData.storePhotoUrls;
      delete profileData.store_photo_urls;

      const currencyRaw = profileData.currency;
      delete profileData.currency;
      const defaultCurrency =
        typeof currencyRaw === "string" && currencyRaw.trim()
          ? currencyRaw.trim()
          : typeof preferredCurrency === "string" && preferredCurrency.trim()
            ? preferredCurrency.trim()
            : "USD";

      if (profileData.creditLimit != null && profileData.creditLimit !== "") {
        profileData.creditLimit = String(profileData.creditLimit);
      }
      if (profileData.taxRate != null && profileData.taxRate !== "") {
        profileData.taxRate = String(profileData.taxRate);
      }

      // Create the customer profile linked to the user (defaultCurrency + document URLs last so they are not overwritten)
      const newProfile = await storage.createCustomerProfile({
        userId: newUser.id,
        email: emailValue || null,
        legalName: businessName,
        tradingName: businessName,
        businessName: businessName,
        primaryContactName: primaryContactName || "",
        accountManagerId: accountManagerId || null,
        ...profileData,
        defaultCurrency,
        tradeLicensePhotoUrl,
        idPhotoUrl,
        storePhotoUrls,
      } as any);

      // Return the credentials along with the profile
      res.json({
        profile: newProfile,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
        },
        credentials: {
          username,
          password: plainPassword,
          email: emailValue || "",
          businessName,
        },
        isNewAccount: true,
      });
    } catch (error) {
      console.error("Error creating customer account:", error);
      res.status(500).json({ message: "Failed to create customer account" });
    }
  });

  // ==================== PRODUCT ROUTES ====================
  
  // Get product counts by brand (uses SQL aggregation, no limit)
  // Only counts products in active collections
  app.get("/api/products/brand-counts", async (req, res) => {
    try {
      const { isPreOrder } = req.query;
      const inactiveCollections = await getInactivePreorderCollections();
      const counts = await storage.getProductCountsByBrand({
        isPreOrder: isPreOrder === 'true' ? true : isPreOrder === 'false' ? false : undefined,
        excludeCollections: Array.from(inactiveCollections),
      });
      res.json(counts);
    } catch (error) {
      console.error("Error getting brand counts:", error);
      res.status(500).json({ error: "Failed to get brand counts" });
    }
  });

  // Get ALL products for admin page (no collection/status filtering, SQL pagination)
  // This is the central product registry - shows every product regardless of status
  app.get("/api/products/all", async (req, res) => {
    try {
      const { search, brand: brandSearch, limit = '50', offset = '0', type } = req.query;
      const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
      const offsetNum = parseInt(offset as string, 10) || 0;
      
      // Build query with optional UPC/SKU search
      let query = db
        .select({
          product: products,
          brandName: brands.name,
        })
        .from(products)
        .leftJoin(brands, eq(products.brand, brands.id));
      
      // Build conditions array
      const conditions = [];
      
      // Apply type filter (stock / preorder / catalogue)
      // Catalogue = products with empty collections (uploaded via Catalogue, not yet assigned to a collection)
      if (type === 'stock') {
        conditions.push(sql`${products.isPreOrder} = false`);
        conditions.push(sql`(${products.collections} != '[]'::jsonb AND jsonb_array_length(${products.collections}) > 0)`);
      } else if (type === 'preorder') {
        conditions.push(sql`${products.isPreOrder} = true`);
      } else if (type === 'catalogue') {
        conditions.push(sql`(${products.collections} = '[]'::jsonb OR jsonb_array_length(COALESCE(${products.collections}, '[]'::jsonb)) = 0)`);
      }
      
      // Apply search filter if provided (search by UPC/SKU, name, or barcode)
      if (search && typeof search === 'string' && search.trim()) {
        const rawTerm = search.trim();
        const term = rawTerm.toLowerCase();
        // UPC/EAN: all digits, 8-14 chars - exact match on sku/barcode only to avoid wrong results
        const isUpcLike = /^\d{8,14}$/.test(rawTerm);
        if (isUpcLike) {
          conditions.push(sql`(
            LOWER(TRIM(COALESCE(${products.sku}, ''))) = ${term} OR 
            LOWER(TRIM(COALESCE(${products.barcode}, ''))) = ${term}
          )`);
        } else {
          const searchTerm = `%${term}%`;
          conditions.push(sql`(
            LOWER(${products.sku}) LIKE ${searchTerm} OR 
            LOWER(${products.name}) LIKE ${searchTerm} OR 
            LOWER(${products.barcode}) LIKE ${searchTerm}
          )`);
        }
      }
      
      // Apply brand search filter if provided
      if (brandSearch && typeof brandSearch === 'string' && brandSearch.trim()) {
        const brandTerm = `%${brandSearch.trim().toLowerCase()}%`;
        conditions.push(sql`LOWER(${brands.name}) LIKE ${brandTerm}`);
      }
      
      // Apply all conditions
      if (conditions.length > 0) {
        query = query.where(sql`${sql.join(conditions, sql` AND `)}`) as typeof query;
      }
      
      // Apply pagination with ORDER BY for consistent results
      const results = await query
        .orderBy(products.name)
        .limit(limitNum)
        .offset(offsetNum);
      
      // Map to include brand name
      let mappedProducts = results.map(r => ({
        ...r.product,
        brandName: r.brandName || 'Unknown Brand'
      }));

      // When searching (non-UPC), prioritize exact SKU/barcode match
      if (search && typeof search === 'string' && search.trim()) {
        const term = search.trim().toLowerCase();
        const isUpcLike = /^\d{8,14}$/.test(search.trim());
        if (!isUpcLike && term.length >= 3 && /^[a-z0-9]+$/i.test(term)) {
          mappedProducts.sort((a, b) => {
            const aExactSku = (a.sku || '').toLowerCase().trim() === term;
            const bExactSku = (b.sku || '').toLowerCase().trim() === term;
            if (aExactSku && !bExactSku) return -1;
            if (!aExactSku && bExactSku) return 1;
            const aExactBarcode = (a.barcode || '').toLowerCase().trim() === term;
            const bExactBarcode = (b.barcode || '').toLowerCase().trim() === term;
            if (aExactBarcode && !bExactBarcode) return -1;
            if (!aExactBarcode && bExactBarcode) return 1;
            const aSkuStarts = (a.sku || '').toLowerCase().startsWith(term);
            const bSkuStarts = (b.sku || '').toLowerCase().startsWith(term);
            if (aSkuStarts && !bSkuStarts) return -1;
            if (!aSkuStarts && bSkuStarts) return 1;
            return 0;
          });
        }
      }
      
      res.json(mappedProducts);
    } catch (error) {
      console.error("Error fetching all products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // Get total count of ALL products (for admin page pagination)
  // Returns { count, stockCount, preorderCount } for accurate tab counters
  app.get("/api/products/all/count", async (req, res) => {
    try {
      const { search, brand: brandSearch } = req.query;
      
      // Build shared conditions
      const conditions: any[] = [];
      
      if (search && typeof search === 'string' && search.trim()) {
        const rawTerm = search.trim();
        const term = rawTerm.toLowerCase();
        const isUpcLike = /^\d{8,14}$/.test(rawTerm);
        if (isUpcLike) {
          conditions.push(sql`(
            LOWER(TRIM(COALESCE(${products.sku}, ''))) = ${term} OR 
            LOWER(TRIM(COALESCE(${products.barcode}, ''))) = ${term}
          )`);
        } else {
          const searchTerm = `%${term}%`;
          conditions.push(sql`(
            LOWER(${products.sku}) LIKE ${searchTerm} OR 
            LOWER(${products.name}) LIKE ${searchTerm} OR 
            LOWER(${products.barcode}) LIKE ${searchTerm}
          )`);
        }
      }
      
      if (brandSearch && typeof brandSearch === 'string' && brandSearch.trim()) {
        const brandTerm = `%${brandSearch.trim().toLowerCase()}%`;
        conditions.push(sql`LOWER(${brands.name}) LIKE ${brandTerm}`);
      }
      
      // Single query returning all counts using conditional aggregation
      // Catalogue = products with empty collections (not yet assigned to Stock or Pre-Order)
      let q = db
        .select({
          count: sql<number>`count(*)::int`,
          stockCount: sql<number>`count(*) FILTER (WHERE ${products.isPreOrder} = false AND (${products.collections} != '[]'::jsonb AND jsonb_array_length(COALESCE(${products.collections}, '[]'::jsonb)) > 0))::int`,
          preorderCount: sql<number>`count(*) FILTER (WHERE ${products.isPreOrder} = true)::int`,
          catalogueCount: sql<number>`count(*) FILTER (WHERE (${products.collections} = '[]'::jsonb OR jsonb_array_length(COALESCE(${products.collections}, '[]'::jsonb)) = 0))::int`,
        })
        .from(products)
        .leftJoin(brands, eq(products.brand, brands.id));

      if (conditions.length > 0) {
        q = q.where(sql`${sql.join(conditions, sql` AND `)}`) as typeof q;
      }
      
      const result = await q;
      res.json({
        count: result[0]?.count || 0,
        stockCount: result[0]?.stockCount || 0,
        preorderCount: result[0]?.preorderCount || 0,
        catalogueCount: result[0]?.catalogueCount || 0,
      });
    } catch (error) {
      console.error("Error getting total product count:", error);
      res.status(500).json({ error: "Failed to get product count" });
    }
  });

  // Get filtered product count (SQL COUNT with all filters, for accurate totals)
  app.get("/api/products/count", async (req, res) => {
    try {
      const { 
        category, brand, collections: collectionsFilter, minPrice, maxPrice, sizes, search, 
        styles, ageRanges, occasions, genders, colors, supplierLocations, isPreOrder,
        mainCategories, kidsGenders, kidsAgeGroups, divisions
      } = req.query;
      
      const inactiveCollections = await getInactivePreorderCollections();
      
      const count = await storage.getFilteredProductCount({
        category: category as string,
        brand: brand as string,
        collections: collectionsFilter ? (collectionsFilter as string).split(',') : undefined,
        minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
        sizes: sizes ? (sizes as string).split(',') : undefined,
        search: search as string,
        styles: styles ? (styles as string).split(',') : undefined,
        ageRanges: ageRanges ? (ageRanges as string).split(',') : undefined,
        occasions: occasions ? (occasions as string).split(',') : undefined,
        genders: genders ? (genders as string).split(',') : undefined,
        colors: colors ? (colors as string).split(',') : undefined,
        supplierLocations: supplierLocations ? (supplierLocations as string).split(',') : undefined,
        isPreOrder: isPreOrder === 'true' ? true : isPreOrder === 'false' ? false : undefined,
        mainCategories: mainCategories ? (mainCategories as string).split(',') : undefined,
        kidsGenders: kidsGenders ? (kidsGenders as string).split(',') : undefined,
        kidsAgeGroups: kidsAgeGroups ? (kidsAgeGroups as string).split(',') : undefined,
        divisions: divisions ? (divisions as string).split(',') : undefined,
        excludeCollections: Array.from(inactiveCollections),
      });
      
      res.json({ count });
    } catch (error) {
      console.error("Error getting filtered product count:", error);
      res.status(500).json({ error: "Failed to get product count" });
    }
  });
  
  // Get products with optional filters
  app.get("/api/products", async (req, res) => {
    try {
      const { 
        category, brand, collections: collectionsFilter, minPrice, maxPrice, sizes, search, 
        styles, ageRanges, occasions, genders, colors, supplierLocations, models, isPreOrder,
        mainCategories, kidsGenders, kidsAgeGroups, divisions, limit, offset
      } = req.query;
      
      // Get inactive collections FIRST so we can apply SQL-level filtering
      const inactiveCollections = await getInactivePreorderCollections();
      
      console.log("🔍 Products API called with filters:", { category, brand, collections: collectionsFilter, genders, sizes, search, models, isPreOrder, mainCategories, kidsGenders, kidsAgeGroups, divisions, limit, offset, inactiveCollectionsCount: inactiveCollections.size });
      
      // Use storage.getProducts() which includes LEFT JOIN for brand names
      // Pass excludeCollections to apply SQL-level filtering for active collections
      let filteredProducts = await storage.getProducts({
        category: category as string,
        brand: brand as string,
        collections: collectionsFilter ? (collectionsFilter as string).split(',') : undefined,
        minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
        sizes: sizes ? (sizes as string).split(',') : undefined,
        search: search as string,
        styles: styles ? (styles as string).split(',') : undefined,
        ageRanges: ageRanges ? (ageRanges as string).split(',') : undefined,
        occasions: occasions ? (occasions as string).split(',') : undefined,
        genders: genders ? (genders as string).split(',') : undefined,
        colors: colors ? (colors as string).split(',') : undefined,
        supplierLocations: supplierLocations ? (supplierLocations as string).split(',') : undefined,
        isPreOrder: isPreOrder === 'true' ? true : isPreOrder === 'false' ? false : undefined,
        mainCategories: mainCategories ? (mainCategories as string).split(',') : undefined,
        kidsGenders: kidsGenders ? (kidsGenders as string).split(',') : undefined,
        kidsAgeGroups: kidsAgeGroups ? (kidsAgeGroups as string).split(',') : undefined,
        divisions: divisions ? (divisions as string).split(',') : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
        excludeCollections: Array.from(inactiveCollections),
      });
      
      console.log(`🔍 Found ${filteredProducts.length} products after filtering`);
      res.json(filteredProducts);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // Get all products with the same name (for color variants on product detail page)
  // Exact match only - uses the product name value from Excel as-is, no processing
  app.get("/api/products/variants/by-name", async (req, res) => {
    try {
      const name = req.query.name as string;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.json([]);
      }
      const nameLower = name.trim().toLowerCase();
      const results = await db
        .select({
          product: products,
          brandName: brands.name,
        })
        .from(products)
        .leftJoin(brands, eq(products.brand, brands.id))
        .where(sql`LOWER(TRIM(${products.name})) = ${nameLower}`);
      
      const mappedProducts = results.map(r => ({
        ...r.product,
        brand: r.brandName || r.product.brand,
      }));
      
      res.json(mappedProducts);
    } catch (error) {
      console.error("Error fetching product variants by name:", error);
      res.status(500).json({ message: "Failed to fetch variants" });
    }
  });

  // Get single product (with brand name resolved via JOIN, same as getProducts)
  app.get("/api/products/:id", async (req, res) => {
    try {
      const results = await db
        .select({
          product: products,
          brandName: brands.name,
        })
        .from(products)
        .leftJoin(brands, eq(products.brand, brands.id))
        .where(eq(products.id, req.params.id));
      
      const result = results[0];
      if (!result) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Return product with brand name resolved (same as getProducts)
      const product = {
        ...result.product,
        brand: result.brandName || result.product.brand, // Use brand name, fallback to ID
      };
      
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // Get products by specific IDs (no filters, no collection exclusion, no limit)
  app.post("/api/products/by-ids", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.json([]);
      }
      const results = await db
        .select({
          product: products,
          brandName: brands.name,
        })
        .from(products)
        .leftJoin(brands, eq(products.brand, brands.id))
        .where(inArray(products.id, ids));
      
      const mappedProducts = results.map(r => ({
        ...r.product,
        brand: r.brandName || r.product.brand,
      }));
      
      res.json(mappedProducts);
    } catch (error) {
      console.error("Error fetching products by IDs:", error);
      res.status(500).json({ message: "Failed to fetch products by IDs" });
    }
  });

  // Create new product
  app.post("/api/products", async (req, res) => {
    try {
      const validatedProduct = insertProductSchema.parse(req.body);
      
      // Check if brand exists, create if it doesn't
      const brandName = validatedProduct.brand;
      const existingBrand = await db.select().from(brands).where(eq(brands.name, brandName)).limit(1);
      
      if (existingBrand.length === 0) {
        // Create new brand automatically
        const slug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        await db.insert(brands).values({
          name: brandName,
          slug: slug,
          description: `${brandName} footwear`,
          isActive: true,
          priority: 0
        });
        console.log(`✨ Auto-created new brand: ${brandName}`);
      }
      
      const newProduct = await storage.createProduct(validatedProduct);
      res.status(201).json(newProduct);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      console.error("Error creating product:", error);
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  // Update product
  app.patch("/api/products/:id", async (req, res) => {
    try {
      const productId = req.params.id;
      
      // Check if product exists
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Update product with provided fields
      const updatedProduct = await storage.updateProduct(productId, req.body);
      res.json(updatedProduct);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  // Delete single product
  app.delete("/api/products/:id", async (req, res) => {
    try {
      const productId = req.params.id;
      const success = await storage.deleteProduct(productId);
      if (!success) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // Bulk delete products
  app.post("/api/products/bulk-delete", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No product IDs provided" });
      }
      const deletedCount = await storage.deleteProducts(ids);
      res.json({ message: `Deleted ${deletedCount} products successfully`, count: deletedCount });
    } catch (error) {
      console.error("Error bulk deleting products:", error);
      res.status(500).json({ message: "Failed to delete products" });
    }
  });

  // Upload product photo to Cloudinary (or local fallback)
  // Does NOT update the DB — the edit form's "Save Changes" handles that via PATCH
  app.post("/api/products/:id/photo", uploadSingle.single('photo'), async (req, res) => {
    try {
      const productId = req.params.id;
      
      // Check if product exists using storage layer
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Try uploading to Cloudinary
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;

      if (cloudName && apiKey && apiSecret) {
        try {
          const cloudinary = (await import('cloudinary')).default;
          cloudinary.v2.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret
          });

          const filePath = req.file.path;
          const result = await cloudinary.v2.uploader.upload(filePath, {
            folder: 'wholesale-products',
            public_id: `${productId}_${Date.now()}`,
            overwrite: true,
            resource_type: 'image'
          });

          // Clean up local file after successful Cloudinary upload
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          console.log(`✅ Photo uploaded to Cloudinary for product ${productId}: ${result.secure_url}`);

          // Return Cloudinary URL — do NOT update DB here
          return res.json({ 
            message: "Photo uploaded to Cloudinary successfully", 
            photoUrl: result.secure_url,
            filename: req.file.filename 
          });
        } catch (cloudinaryError) {
          console.error("Cloudinary upload failed, falling back to local:", cloudinaryError);
        }
      }

      // Fallback: return local file URL if Cloudinary is not configured or failed
      const photoUrl = getFileUrl(productId, req.file.filename);
      console.log(`⚠️ Photo saved locally for product ${productId}: ${photoUrl} (Cloudinary not configured or failed)`);

      // Return local URL — do NOT update DB here
      res.json({ 
        message: "Photo saved locally (Cloudinary not available)", 
        photoUrl,
        filename: req.file.filename 
      });
    } catch (error) {
      console.error("Error uploading photo:", error);
      res.status(500).json({ message: "Failed to upload photo" });
    }
  });

  // Get product photo
  app.get("/api/products/:id/photo", async (req, res) => {
    try {
      const productId = req.params.id;
      const photoUrl = getFileUrl(productId);
      
      if (!photoUrl) {
        return res.status(404).json({ message: "Photo not found" });
      }

      // Get the actual file path
      const filename = path.basename(photoUrl);
      const filePath = path.join(process.cwd(), 'uploads', 'products', filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Photo file not found" });
      }

      // Set proper content type
      const ext = path.extname(filename).toLowerCase();
      const contentTypes: { [key: string]: string } = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      
      const contentType = contentTypes[ext] || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      
      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Error serving photo:", error);
      res.status(500).json({ message: "Failed to serve photo" });
    }
  });

  // Get cart items
  app.get("/api/cart", async (req, res) => {
    try {
      const sessionId = req.sessionID || "anonymous";
      const cartItems = await storage.getCartItems(sessionId);
      
      // Enrich cart items with product details
      const enrichedItems = await Promise.all(
        cartItems.map(async (item) => {
          const product = await storage.getProduct(item.productId);
          return { ...item, product };
        })
      );
      
      res.json(enrichedItems);
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  // Add item to cart
  app.post("/api/cart", async (req, res) => {
    try {
      const sessionId = req.sessionID || "anonymous";
      const { productId, batchName, selections } = req.body;
      
      // Look up product to determine source type
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Check limitOrder per size (or product-level fallback)
      const avs = (product.availableSizes || []) as { size: string; limitOrder?: number }[];
      for (const s of selections) {
        const size = s.size;
        const qty = s.quantity || 0;
        const sizeEntry = avs.find((a) => a.size === size);
        const limit = sizeEntry?.limitOrder ?? (product.limitOrder && product.limitOrder >= 1 ? product.limitOrder : null);
        if (limit != null && qty > limit) {
          return res.status(400).json({
            message: `You cannot order more than ${limit} units of size ${size}.`,
            limitOrder: limit,
            size,
            requestedQuantity: qty
          });
        }
      }
      
      // Determine source type from product
      const newItemSourceType = product.isPreOrder ? 'preorder' : 'stock';
      
      // Check existing cart items for this session
      const existingCartItems = await storage.getCartItems(sessionId);
      
      // If cart has items, verify source type matches
      if (existingCartItems.length > 0) {
        const existingSourceType = existingCartItems[0].sourceType || 'stock';
        if (existingSourceType !== newItemSourceType) {
          return res.status(409).json({ 
            message: `Cannot mix ${newItemSourceType} items with ${existingSourceType} items. Please clear your cart first or checkout your current ${existingSourceType} order.`,
            currentSourceType: existingSourceType,
            attemptedSourceType: newItemSourceType
          });
        }
      }
      
      const cartItemData = insertCartItemSchema.parse({
        productId,
        batchName,
        selections,
        sessionId,
        sourceType: newItemSourceType
      });

      const cartItem = await storage.addCartItem(cartItemData);
      res.json(cartItem);
    } catch (error) {
      console.error("Error adding to cart:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid cart item data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add item to cart" });
    }
  });

  // Add multiple items to cart (batch)
  app.post("/api/cart/batch", async (req, res) => {
    try {
      const sessionId = req.sessionID || "anonymous";
      const { items } = req.body;
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ message: "Items must be an array" });
      }

      // Check existing cart items for this session
      const existingCartItems = await storage.getCartItems(sessionId);
      const existingSourceType = existingCartItems.length > 0 
        ? (existingCartItems[0].sourceType || 'stock') 
        : null;

      const cartItemsResult = [];
      for (const item of items) {
        // Look up product to determine source type
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return res.status(404).json({ message: `Product not found: ${item.productId}` });
        }
        
        // Check limitOrder per size (or product-level fallback)
        const itemSelections = item.selections || [];
        const avs = (product.availableSizes || []) as { size: string; limitOrder?: number }[];
        for (const s of itemSelections) {
          const size = s.size;
          const qty = s.quantity || 0;
          const sizeEntry = avs.find((a) => a.size === size);
          const limit = sizeEntry?.limitOrder ?? (product.limitOrder && product.limitOrder >= 1 ? product.limitOrder : null);
          if (limit != null && qty > limit) {
            return res.status(400).json({
              message: `You cannot order more than ${limit} units of size ${size} for "${product.name}".`,
              limitOrder: limit,
              size,
              requestedQuantity: qty
            });
          }
        }
        
        const newItemSourceType = product.isPreOrder ? 'preorder' : 'stock';
        
        // Check source type consistency
        const currentSourceType = existingSourceType || (cartItemsResult.length > 0 
          ? cartItemsResult[0].sourceType 
          : null);
        
        if (currentSourceType && currentSourceType !== newItemSourceType) {
          return res.status(409).json({ 
            message: `Cannot mix ${newItemSourceType} items with ${currentSourceType} items. Please clear your cart first or checkout your current ${currentSourceType} order.`,
            currentSourceType,
            attemptedSourceType: newItemSourceType
          });
        }
        
        const cartItemData = insertCartItemSchema.parse({
          ...item,
          sessionId,
          sourceType: newItemSourceType
        });
        const cartItem = await storage.addCartItem(cartItemData);
        cartItemsResult.push(cartItem);
      }

      res.json(cartItemsResult);
    } catch (error) {
      console.error("Error adding batch items to cart:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid cart item data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add batch items to cart" });
    }
  });

  // Update cart item
  app.patch("/api/cart/:id", async (req, res) => {
    try {
      const updatedItem = await storage.updateCartItem(req.params.id, req.body);
      if (!updatedItem) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      res.json(updatedItem);
    } catch (error) {
      console.error("Error updating cart item:", error);
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  // Remove cart item
  app.delete("/api/cart/:id", async (req, res) => {
    try {
      const success = await storage.removeCartItem(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing cart item:", error);
      res.status(500).json({ message: "Failed to remove cart item" });
    }
  });

  // Remove specific selections from a cart item
  app.patch("/api/cart/:id/remove-selections", async (req, res) => {
    try {
      const cartItemId = req.params.id;
      const { selectionsToRemove } = req.body;

      if (!Array.isArray(selectionsToRemove)) {
        return res.status(400).json({ message: "selectionsToRemove must be an array" });
      }

      // Get current cart item
      const cartItemsResults = await db.select().from(cartItems).where(eq(cartItems.id, cartItemId));
      if (cartItemsResults.length === 0) {
        return res.status(404).json({ message: "Cart item not found" });
      }

      const cartItem = cartItemsResults[0];
      const currentSelections = cartItem.selections as Array<{size: string, quantity: number}>;

      // Filter out the selections to remove
      const remainingSelections = currentSelections.filter(sel => {
        return !selectionsToRemove.some((toRemove: any) =>
          toRemove.size === sel.size
        );
      });

      // If no selections remain, delete the entire cart item
      if (remainingSelections.length === 0) {
        await storage.removeCartItem(cartItemId);
        return res.json({ success: true, deleted: true });
      }

      // Otherwise, update with remaining selections
      const updated = await storage.updateCartItem(cartItemId, {
        selections: remainingSelections
      });

      res.json({ success: true, cartItem: updated });
    } catch (error) {
      console.error("Error removing selections from cart item:", error);
      res.status(500).json({ message: "Failed to remove selections" });
    }
  });

  // Clear entire cart
  app.delete("/api/cart", async (req, res) => {
    try {
      const sessionId = req.sessionID || "anonymous";
      await storage.clearCart(sessionId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing cart:", error);
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });

  // Create order
  app.post("/api/orders", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const sessionId = req.sessionID || "anonymous";
      const rawBody = (req.body || {}) as Record<string, unknown>;
      const forCustomerUserId =
        typeof rawBody.forCustomerUserId === "string" ? rawBody.forCustomerUserId : undefined;
      const body = { ...rawBody };
      delete body.forCustomerUserId;

      const requester = req.user;
      let orderUserId = requester?.id || null;

      if (requester && forCustomerUserId && ["account_manager", "admin", "sales", "finance"].includes(requester.role)) {
        if (requester.role === "account_manager") {
          const assigned = await storage.getCustomerProfilesByAccountManager(requester.id);
          if (!assigned.some((cp) => cp.userId === forCustomerUserId)) {
            return res.status(403).json({ message: "Customer is not assigned to you" });
          }
        }
        orderUserId = forCustomerUserId;
        (body as any).createdByAccountManagerId = requester.id;
        (body as any).createdByAccountManagerName =
          requester.displayName || requester.username || null;
      }

      // Parse order data, ensuring orderType is preserved
      const parsedData = insertOrderSchema.parse({
        ...body,
        sessionId,
        userId: orderUserId,
      });

      if (forCustomerUserId && orderUserId === forCustomerUserId) {
        const cu = await storage.getUser(forCustomerUserId);
        if (cu) {
          (parsedData as any).customerName =
            (body as any).customerName || cu.displayName || cu.username || parsedData.customerName;
          (parsedData as any).customerEmail =
            (body as any).customerEmail || cu.email || parsedData.customerEmail;
        }
      }

      // Enrich items with product details (unitsPerCarton) and check for pre-order products
      let isPreOrder = false;
      const enrichedItems = [];
      if (parsedData.items && parsedData.items.length > 0) {
        for (const item of parsedData.items) {
          const product = await storage.getProduct(item.productId);
          if (product && product.isPreOrder) {
            isPreOrder = true;
          }
          enrichedItems.push({
            ...item,
            unitsPerCarton: (item as any).unitsPerCarton || product?.unitsPerCarton || undefined,
          });
        }
      }

      // Set orderType: use provided orderType if items are empty, otherwise determine from items
      // IMPORTANT: For empty carts, prioritize the orderType from request body
      const providedOrderType = req.body.orderType;
      let finalOrderType: string;
      
      if (enrichedItems.length > 0) {
        // If cart has items, determine type from products
        finalOrderType = isPreOrder ? 'pre-order' : 'regular';
      } else {
        // If cart is empty, use the provided orderType (for new cart creation)
        // This allows users to create pre-order carts even when empty
        finalOrderType = providedOrderType || parsedData.orderType || 'regular';
      }
      
      console.log('Creating order with orderType:', {
        providedOrderType,
        parsedOrderType: parsedData.orderType,
        finalOrderType,
        itemsCount: enrichedItems.length,
        isPreOrder
      });

      const finalOrderData = {
        ...parsedData,
        items: enrichedItems.length > 0 ? enrichedItems : parsedData.items,
        orderType: finalOrderType,
        // Ensure staff-on-behalf-of-customer metadata is stored even if parse omitted it
        ...(requester &&
        forCustomerUserId &&
        orderUserId === forCustomerUserId && {
          createdByAccountManagerId: requester.id,
          createdByAccountManagerName:
            requester.displayName || requester.username || null,
        }),
      };

      const order = await storage.createOrder(finalOrderData);
      
      // Verify orderType was saved correctly
      console.log('Order created:', {
        id: order.id,
        orderType: order.orderType,
        finalOrderType,
        nickname: order.nickname
      });
      
      // Note: Cart is not automatically cleared - selections are removed individually
      // by the frontend using /api/cart/:id/remove-selections endpoint
      
      res.json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid order data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Get draft orders (organized by brand for shopping cart)
  app.get("/api/orders/drafts", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const sessionId = req.sessionID || "anonymous";
      const userId = req.user?.id || null;
      const searchQuery = req.query.search as string || "";
      
      let allOrders: Awaited<ReturnType<typeof storage.getOrders>>;
      
      if (userId && req.user?.role === "account_manager") {
        const own = await storage.getOrders(undefined, userId);
        const assigned = await storage.getCustomerProfilesByAccountManager(userId);
        const byCustomer = await Promise.all(
          assigned.map((cp) => storage.getOrders(undefined, cp.userId)),
        );
        const seen = new Set(own.map((o) => o.id));
        allOrders = [...own];
        for (const list of byCustomer) {
          for (const o of list) {
            if (!seen.has(o.id)) {
              seen.add(o.id);
              allOrders.push(o);
            }
          }
        }
      } else if (
        userId &&
        (req.user?.role === "sales" || req.user?.role === "finance")
      ) {
        const all = await storage.getAllOrders();
        allOrders = all.filter(
          (o) =>
            o.userId === userId ||
            (o.status === "draft" && o.createdByAccountManagerId === userId),
        );
      } else if (userId) {
        // Logged-in users: only return their orders (by userId). Do not merge session-based
        // drafts to prevent new users from inheriting previous session's cart data.
        allOrders = await storage.getOrders(undefined, userId);
      } else {
        // Guests: use sessionId only
        allOrders = await storage.getOrders(sessionId);
      }
      
      // Include both drafts and submitted (pending) orders so users can view their submitted orders
      let draftOrders = allOrders.filter(order => order.status === 'draft' || order.status === 'pending');

      // Carts created by staff for another user (e.g. account manager "create customer cart") should appear
      // on the staff dashboard and the customer's shop, not in the staff member's cart sidebar list.
      if (
        userId &&
        req.user &&
        ["account_manager", "sales", "finance"].includes(req.user.role)
      ) {
        draftOrders = draftOrders.filter((order) => {
          const forSomeoneElse = !!(order.userId && order.userId !== userId);
          const createdByThisStaff = order.createdByAccountManagerId === userId;
          return !(forSomeoneElse && createdByThisStaff);
        });
      }
      
      if (searchQuery) {
        draftOrders = draftOrders.filter(order => {
          const search = searchQuery.toLowerCase();
          return (
            order.orderName?.toLowerCase().includes(search) ||
            order.nickname?.toLowerCase().includes(search) ||
            order.customerName?.toLowerCase().includes(search) ||
            order.items?.some(item => 
              item.brand?.toLowerCase().includes(search) ||
              item.productName?.toLowerCase().includes(search)
            )
          );
        });
      }
      
      res.json(draftOrders);
    } catch (error) {
      console.error("Error fetching draft orders:", error);
      res.status(500).json({ message: "Failed to fetch draft orders" });
    }
  });

  // Rename draft cart
  app.patch("/api/orders/:id", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const sessionId = req.sessionID || "anonymous";
      const order = await storage.getOrder(orderId);

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.status !== "draft") {
        return res.status(400).json({ message: "Only draft orders can be renamed" });
      }

      if (!(await userCanModifyDraftOrder(order, req, sessionId))) {
        return res.status(403).json({ message: "Unauthorized to modify this order" });
      }

      const requestedName =
        (typeof req.body?.nickname === "string" && req.body.nickname.trim()) ||
        (typeof req.body?.orderName === "string" && req.body.orderName.trim()) ||
        "";

      if (!requestedName) {
        return res.status(400).json({ message: "A non-empty cart name is required" });
      }

      const updatedOrder = await storage.updateOrder(orderId, {
        nickname: requestedName,
        orderName: requestedName,
      });

      res.json(updatedOrder);
    } catch (error) {
      console.error("Error renaming draft order:", error);
      res.status(500).json({ message: "Failed to rename order" });
    }
  });

  // Submit draft order for approval
  app.post("/api/orders/:id/submit", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const {
        items,
        targetUserId,
        paymentMethod,
        deliveryMethod,
        discountPercent,
        forAccountManagerQueue,
      } = req.body;
      const placement =
        typeof req.query.placement === "string" ? req.query.placement : "";
      const useAccountManagerApprovalQueue =
        placement === "new_order" ||
        forAccountManagerQueue === true ||
        forAccountManagerQueue === "true" ||
        forAccountManagerQueue === 1;
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      if (order.status !== 'draft') {
        return res.status(400).json({ message: "Only draft orders can be submitted" });
      }
      
      // Staff (AM, admin, sales, finance) submitting on behalf of a customer — same customer + queue rules
      const isStaffOnBehalfOrder =
        req.user &&
        ["account_manager", "admin", "sales", "finance"].includes(req.user.role) &&
        targetUserId;
      
      // Get username for order naming
      let username = "Guest";
      let customerName = "";
      let customerUserId = order.userId;
      
      if (isStaffOnBehalfOrder) {
        // Get the target customer's info
        const targetUser = await storage.getUser(targetUserId);
        if (!targetUser) {
          return res.status(400).json({ message: "Target customer not found" });
        }
        username = targetUser.displayName || targetUser.username || "Customer";
        customerName = username;
        customerUserId = targetUserId;
      } else if (req.user) {
        username = req.user.displayName || req.user.email?.split('@')[0] || "User";
        customerName = username;
      }
      
      // Get sequential order number based on submitted orders sorted by createdAt
      const allOrders = await storage.getOrders();
      const submittedOrders = allOrders
        .filter(o => o.status !== 'draft')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const orderNumber = submittedOrders.length + 1;
      
      // Generate order name: "Username - Cart #N" using short cart ID
      const shortCartId = orderId.slice(0, 8);
      const orderName = `${username} - Cart ${shortCartId} #${orderNumber}`;
      
      // Build update data
      const updateData: any = {
        items: items || order.items,
        status: 'pending',
        approvalStatus: 'pending',
        orderName: orderName,
        customerName: customerName,
      };
      
      if (isStaffOnBehalfOrder) {
        updateData.userId = customerUserId;
        updateData.createdByAccountManagerId = req.user!.id;
        updateData.createdByAccountManagerName =
          req.user!.displayName || req.user!.username || 'Account Manager';
        updateData.paymentMethod = paymentMethod ?? 'card';
        updateData.deliveryMethod = deliveryMethod ?? 'pickup_from_warehouse';
        if (discountPercent !== undefined) {
          updateData.discountPercent = discountPercent;
        }

        if (useAccountManagerApprovalQueue) {
          // Dashboard "New order": pending order at initial stage (same badge as new_order in UI)
          updateData.workflowStage = 'new_order';
          updateData.workflowHistory = [
            ...(order.workflowHistory || []),
            {
              stage: 'new_order',
              action: 'submitted',
              userId: req.user!.id,
              userName: req.user!.displayName || req.user!.username,
              timestamp: new Date().toISOString(),
              notes: `Order created by account manager on behalf of customer`,
            },
          ];
        } else {
          // Cart submit with payment/delivery: skip AM approval, go to sales
          updateData.workflowStage = 'sales_approval';
          updateData.workflowHistory = [
            ...(order.workflowHistory || []),
            {
              stage: 'sales_approval',
              action: 'created_and_approved_by_account_manager',
              userId: req.user!.id,
              userName: req.user!.displayName || req.user!.username,
              timestamp: new Date().toISOString(),
              notes: `Order created and approved by Account Manager ${req.user!.displayName || req.user!.username} on behalf of customer`,
            },
          ];
        }
      } else {
        // Regular customer order: goes to account_manager_approval
        updateData.workflowStage = 'account_manager_approval';
      }
      
      const updatedOrder = await storage.updateOrder(orderId, updateData);

      // Reserve stock for non-pre-order items
      const finalItems = (items || order.items || []) as OrderItem[];
      if (order.orderType !== 'pre-order') {
        try {
          await reserveStockForOrder(finalItems);
        } catch (e) {
          console.error("[StockReserve] Failed to reserve stock for order", orderId, e);
        }
      }
      
      // Broadcast to connected admin clients for real-time updates
      const orderItems = items || order.items || [];
      const totalAmount = orderItems.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0);
      broadcastOrderSubmission({
        id: orderId,
        orderName: orderName,
        status: 'pending',
        total: totalAmount,
        itemCount: orderItems.length,
        submittedAt: new Date().toISOString(),
      });
      
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error submitting order:", error);
      res.status(500).json({ message: "Failed to submit order" });
    }
  });
  
  // Rename all existing submitted orders with proper sequential naming
  app.post("/api/orders/rename-all", requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const allOrders = await storage.getOrders();
      const submittedOrders = allOrders
        .filter(o => o.status !== 'draft')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      const updatedOrders = [];
      for (let i = 0; i < submittedOrders.length; i++) {
        const order = submittedOrders[i];
        const orderNumber = i + 1;
        
        // Try to get username from userId
        let username = "Guest";
        if (order.userId) {
          const user = await storage.getUser(order.userId);
          if (user) {
            username = user.displayName || user.username || "User";
          }
        } else if (order.customerName) {
          username = order.customerName;
        }
        
        const shortCartId = order.id.slice(0, 8);
        const orderName = `${username} - Cart ${shortCartId} #${orderNumber}`;
        
        const updated = await storage.updateOrder(order.id, { orderName });
        updatedOrders.push(updated);
      }
      
      res.json({ message: `Renamed ${updatedOrders.length} orders`, orders: updatedOrders });
    } catch (error) {
      console.error("Error renaming orders:", error);
      res.status(500).json({ message: "Failed to rename orders" });
    }
  });

  // Helper function to recalculate order totals and metadata
  // IMPORTANT: When the cart becomes empty, the original orderType is always preserved
  // so that a pre-order cart stays pre-order and a stock cart stays stock.
  async function recalculateOrderTotals(
    items: any[],
    discount: string | number,
    storageInstance: any,
    originalOrder?: { orderType?: string }
  ) {
    // Recalculate each item's totalPrice server-side
    const processedItems = await Promise.all(items.map(async (item) => {
      const unitPrice = parseFloat(String(item.unitPrice));
      const quantity = parseInt(String(item.quantity || 0));
      const totalPrice = unitPrice * quantity;
      return { ...item, unitPrice, quantity, totalPrice };
    }));

    // Calculate subtotal from processed items
    const subtotal = processedItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const discountAmount = parseFloat(String(discount || 0));
    const total = subtotal - discountAmount;

    // Determine orderType:
    // 1. If cart is empty → ALWAYS preserve the original orderType so the cart stays
    //    under the correct section (stock / pre-order) in the sidebar.
    // 2. If cart has items → derive the type from the products in the cart.
    let finalOrderType: 'pre-order' | 'regular';

    if (processedItems.length === 0) {
      // Empty cart – preserve the original type unconditionally
      const orig = originalOrder?.orderType?.toLowerCase();
      finalOrderType = (orig === 'pre-order' || orig === 'preorder') ? 'pre-order' : 'regular';
    } else {
      // Cart has items – check whether any product is a pre-order product
      let hasPreOrder = false;
      for (const item of processedItems) {
        const product = await storageInstance.getProduct(item.productId);
        if (product && product.isPreOrder) {
          hasPreOrder = true;
          break;
        }
      }
      // If we couldn't determine from products (e.g. deleted products), fall back to original
      if (!hasPreOrder && originalOrder) {
        const orig = originalOrder.orderType?.toLowerCase();
        if (orig === 'pre-order' || orig === 'preorder') {
          hasPreOrder = true;
        }
      }
      finalOrderType = hasPreOrder ? 'pre-order' : 'regular';
    }

    return {
      items: processedItems,
      subtotal: subtotal.toFixed(2),
      total: total.toFixed(2),
      orderType: finalOrderType,
    };
  }

  // Add items to draft order
  app.post("/api/orders/:id/items", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const sessionId = req.sessionID || "anonymous";
      const orderId = req.params.id;
      const { items: newItems } = req.body;

      if (!Array.isArray(newItems)) {
        return res.status(400).json({ message: "Items must be an array" });
      }

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (!(await userCanModifyDraftOrder(order, req, sessionId))) {
        return res.status(403).json({ message: "Unauthorized to modify this order" });
      }

      if (order.status !== 'draft') {
        return res.status(400).json({ message: "Can only add items to draft orders" });
      }

      // Validate product type matches cart type
      const cartType = order.orderType === 'pre-order' ? 'pre-order' : 'stock';
      if (newItems.length > 0) {
        for (const item of newItems) {
          const product = await storage.getProduct(item.productId);
          if (!product) {
            return res.status(404).json({ message: `Product ${item.productId} not found` });
          }
          
          const productType = product.isPreOrder ? 'pre-order' : 'stock';
          if (productType !== cartType) {
            const cartTypeLabel = cartType === 'pre-order' ? 'Pre-order' : 'Stock';
            const productTypeLabel = productType === 'pre-order' ? 'Pre-order' : 'Stock';
            return res.status(409).json({ 
              message: `Cannot add ${productTypeLabel} product to ${cartTypeLabel} cart. Please use a ${productTypeLabel} cart.`,
              cartType,
              productType,
              productId: product.id,
              productName: product.name
            });
          }
          // Check limitOrder per size
          const qty = item.quantity || 0;
          const size = item.size;
          const avs = (product.availableSizes || []) as { size: string; limitOrder?: number }[];
          const sizeEntry = avs.find((a) => a.size === size);
          const limit = sizeEntry?.limitOrder ?? (product.limitOrder && product.limitOrder >= 1 ? product.limitOrder : null);
          if (limit != null && qty > limit) {
            return res.status(400).json({
              message: `You cannot order more than ${limit} units of size ${size} for "${product.name}".`,
              limitOrder: limit,
              size,
              requestedQuantity: qty
            });
          }
        }
      }

      // Append new items to existing items
      const currentItems = Array.isArray(order.items) ? order.items : [];
      const allItems = [...currentItems, ...newItems];

      // Recalculate totals server-side
      const recalculated = await recalculateOrderTotals(allItems, order.discount, storage, order);

      const updatedOrder = await storage.updateOrder(orderId, recalculated);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error adding items to draft order:", error);
      res.status(500).json({ message: "Failed to add items to draft order" });
    }
  });

  // Bulk update multiple items in draft order
  app.patch("/api/orders/:id/items/bulk", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const sessionId = req.sessionID || "anonymous";
      const orderId = req.params.id;
      const { updates } = req.body; // Array of { itemIndex, updates }

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: "Updates array required" });
      }

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (!(await userCanModifyDraftOrder(order, req, sessionId))) {
        return res.status(403).json({ message: "Unauthorized to modify this order" });
      }

      if (order.status !== 'draft') {
        return res.status(400).json({ message: "Can only update items in draft orders" });
      }

      const currentItems = Array.isArray(order.items) ? order.items : [];

      // Apply all updates (enforce limitOrder per size)
      for (const { itemIndex, updates: itemUpdates } of updates) {
        if (itemIndex < 0 || itemIndex >= currentItems.length) continue;
        const item = currentItems[itemIndex];
        let merged = { ...item, ...itemUpdates };
        if (typeof merged.quantity === 'number' && merged.productId && merged.size) {
          const product = await storage.getProduct(merged.productId);
          if (product) {
            const avs = (product.availableSizes || []) as { size: string; limitOrder?: number }[];
            const sizeEntry = avs.find((a) => a.size === merged.size);
            const limit = sizeEntry?.limitOrder ?? (product.limitOrder && product.limitOrder >= 1 ? product.limitOrder : null);
            if (limit != null && merged.quantity > limit) {
              merged = { ...merged, quantity: item.quantity }; // Reject: keep existing quantity
            }
          }
        }
        currentItems[itemIndex] = merged;
      }

      // Recalculate totals once after all updates
      const recalculated = await recalculateOrderTotals(currentItems, order.discount, storage, order);

      const updatedOrder = await storage.updateOrder(orderId, recalculated);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error bulk updating draft order items:", error);
      res.status(500).json({ message: "Failed to bulk update draft order items" });
    }
  });

  // Update item in draft order
  app.patch("/api/orders/:id/items/:itemIndex", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const sessionId = req.sessionID || "anonymous";
      const orderId = req.params.id;
      const itemIndex = parseInt(req.params.itemIndex);
      const itemUpdates = req.body;

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (!(await userCanModifyDraftOrder(order, req, sessionId))) {
        return res.status(403).json({ message: "Unauthorized to modify this order" });
      }

      if (order.status !== 'draft') {
        return res.status(400).json({ message: "Can only update items in draft orders" });
      }

      const currentItems = Array.isArray(order.items) ? order.items : [];
      if (itemIndex < 0 || itemIndex >= currentItems.length) {
        return res.status(404).json({ message: "Item not found" });
      }

      // Update the item
      currentItems[itemIndex] = { ...currentItems[itemIndex], ...itemUpdates };

      // Recalculate totals server-side (always, to handle edge cases like quantity=0)
      const recalculated = await recalculateOrderTotals(currentItems, order.discount, storage, order);

      const updatedOrder = await storage.updateOrder(orderId, recalculated);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating draft order item:", error);
      res.status(500).json({ message: "Failed to update draft order item" });
    }
  });

  // Remove item from draft order
  app.delete("/api/orders/:id/items/:itemIndex", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const sessionId = req.sessionID || "anonymous";
      const orderId = req.params.id;
      const itemIndex = parseInt(req.params.itemIndex);

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (!(await userCanModifyDraftOrder(order, req, sessionId))) {
        return res.status(403).json({ message: "Unauthorized to modify this order" });
      }

      if (order.status !== 'draft') {
        return res.status(400).json({ message: "Can only remove items from draft orders" });
      }

      const currentItems = Array.isArray(order.items) ? order.items : [];
      if (itemIndex < 0 || itemIndex >= currentItems.length) {
        return res.status(404).json({ message: "Item not found" });
      }

      // Remove the item
      const newItems = [...currentItems];
      newItems.splice(itemIndex, 1);

      // Recalculate totals server-side
      const recalculated = await recalculateOrderTotals(newItems, order.discount, storage, order);

      const updatedOrder = await storage.updateOrder(orderId, recalculated);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error removing draft order item:", error);
      res.status(500).json({ message: "Failed to remove draft order item" });
    }
  });

  // Remove entire product row (all sizes for a product)
  app.delete("/api/orders/:id/products/:productId", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const sessionId = req.sessionID || "anonymous";
      const userId = req.user?.id;
      const orderId = req.params.id;
      const productId = req.params.productId;

      console.log('[DELETE PRODUCT] Request:', { orderId, productId, sessionId, userId });

      const order = await storage.getOrder(orderId);
      if (!order) {
        console.log('[DELETE PRODUCT] Order not found:', orderId);
        return res.status(404).json({ message: "Order not found" });
      }

      console.log('[DELETE PRODUCT] Order found:', { orderId, orderSessionId: order.sessionId, orderUserId: order.userId });

      if (!(await userCanModifyDraftOrder(order, req, sessionId))) {
        console.log('[DELETE PRODUCT] Unauthorized:', { sessionId, orderSessionId: order.sessionId, userId, orderUserId: order.userId });
        return res.status(403).json({ message: "Unauthorized to modify this order" });
      }

      if (order.status !== 'draft') {
        console.log('[DELETE PRODUCT] Not a draft order:', order.status);
        return res.status(400).json({ message: "Can only remove items from draft orders" });
      }

      const currentItems = Array.isArray(order.items) ? order.items : [];
      console.log('[DELETE PRODUCT] Current items count:', currentItems.length);
      console.log('[DELETE PRODUCT] Looking for productId:', productId);
      console.log('[DELETE PRODUCT] Sample items:', currentItems.slice(0, 3).map(i => ({ productId: i.productId })));
      
      // Filter out all items matching the productId
      const newItems = currentItems.filter(item => 
        item.productId !== productId
      );

      console.log('[DELETE PRODUCT] New items count:', newItems.length);

      if (newItems.length === currentItems.length) {
        console.log('[DELETE PRODUCT] No items matched - nothing to remove (idempotent success)');
        // Return success even if nothing removed - idempotent behavior prevents race condition errors
        return res.json(order);
      }

      // Recalculate totals server-side
      const recalculated = await recalculateOrderTotals(newItems, order.discount, storage, order);

      const updatedOrder = await storage.updateOrder(orderId, recalculated);
      console.log('[DELETE PRODUCT] Success - removed', currentItems.length - newItems.length, 'items');
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error removing product from draft order:", error);
      res.status(500).json({ message: "Failed to remove product from draft order" });
    }
  });

  // Get orders (for customer's Order History page)
  app.get("/api/orders", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const sessionId = req.sessionID || "anonymous";
      const userId = req.user?.id || null;
      
      // Get orders by sessionId first
      let allOrders = await storage.getOrders(sessionId);
      
      // If user is logged in, also get their user-based orders and merge (avoiding duplicates)
      if (userId) {
        const userOrders = await storage.getOrders(undefined, userId);
        const existingIds = new Set(allOrders.map((o: any) => o.id));
        const newOrders = userOrders.filter((o: any) => !existingIds.has(o.id));
        allOrders = [...allOrders, ...newOrders];
        
        // If user is an Account Manager, also get orders they created on behalf of customers
        if (req.user?.role === 'account_manager' || req.user?.role === 'admin') {
          const allDbOrders = await storage.getAllOrders();
          const amCreatedOrders = allDbOrders.filter((o: any) => 
            o.createdByAccountManagerId === userId && 
            !existingIds.has(o.id) &&
            !newOrders.some((no: any) => no.id === o.id)
          );
          allOrders = [...allOrders, ...amCreatedOrders];
        }
      }
      
      res.json(allOrders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Clear all items from order (keep the order itself)
  app.post("/api/orders/:id/clear", async (req, res) => {
    try {
      const orderId = req.params.id;
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Recalculate totals with empty items to preserve orderType
      const recalculated = await recalculateOrderTotals([], order.discount || '0', storage, order);

      // Update order with empty items array and zero totals, preserving orderType
      const updatedOrder = await storage.updateOrder(orderId, {
        items: [],
        subtotal: recalculated.subtotal,
        total: recalculated.total,
        discount: order.discount || '0',
        orderType: recalculated.orderType
      });
      
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error clearing order items:", error);
      res.status(500).json({ message: "Failed to clear order items" });
    }
  });

  // Delete order
  app.delete("/api/orders/:id", async (req, res) => {
    try {
      const orderId = req.params.id;
      const order = await storage.getOrder(orderId);

      if (!order) {
        return res.status(404).json({ message: "Order not found", reason: "This cart no longer exists. It may have already been deleted." });
      }

      const nonDeletableStatuses = ['pending', 'approved', 'completed'];
      if (nonDeletableStatuses.includes(order.status)) {
        const statusLabel = order.status.charAt(0).toUpperCase() + order.status.slice(1);
        return res.status(409).json({
          message: "Cannot delete this cart",
          reason: `This cart has a status of "${statusLabel}" and cannot be deleted. Only draft or rejected carts can be removed.`,
        });
      }

      // Release reserved stock if order was in-progress (not draft/completed/rejected/pre-order)
      if (
        order.orderType !== 'pre-order' &&
        order.status !== 'draft' &&
        order.status !== 'completed' &&
        order.status !== 'rejected'
      ) {
        try {
          await releaseStockForOrder((order.items || []) as OrderItem[]);
        } catch (e) {
          console.error("[StockReserve] Failed to release stock for deleted order", orderId, e);
        }
      }

      const deleted = await storage.deleteOrder(orderId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Order not found", reason: "The cart could not be found in the database. It may have already been deleted." });
      }
      
      res.json({ success: true, message: "Order deleted" });
    } catch (error) {
      console.error("Error deleting order:", error);
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ message: "Failed to delete order", reason: `An unexpected error occurred: ${errMsg}` });
    }
  });

  // ==================== ORDER FLOW MANAGEMENT ROUTES ====================

  // Get orders for a specific workflow stage (filtered by user role)
  app.get("/api/orders/workflow/:stage", requireStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const { stage } = req.params;
      const allOrders = await storage.getOrders();
      const filteredOrders = allOrders.filter((o: any) => o.workflowStage === stage);
      res.json(filteredOrders);
    } catch (error) {
      console.error("Error fetching workflow orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // ─── Stock Reservation Helpers ─────────────────────────────────────
  // reserve  = +1 per unit (on order submit)
  // release  = -1 per unit (on reject / return / delete)
  // confirm  = deduct from physical stock & clear reservation (on complete)

  type OrderItem = { productId: string; size?: string; quantity: number };

  async function reserveStockForOrder(orderItems: OrderItem[]) {
    const grouped = groupItemsByProduct(orderItems);
    const updates: Parameters<typeof broadcastStockUpdate>[0] = [];

    for (const [productId, sizeQtys] of Object.entries(grouped)) {
      const product = await storage.getProduct(productId);
      if (!product || product.isPreOrder) continue;

      const totalReserve = sizeQtys.reduce((s, q) => s + q.quantity, 0);
      const newReserved = (product.reservedStock ?? 0) + totalReserve;

      const avs = (product.availableSizes || []).map((s: any) => {
        const match = sizeQtys.find((q) => q.size === s.size);
        if (!match) return s;
        return { ...s, reserved: (s.reserved ?? 0) + match.quantity };
      });

      await db
        .update(products)
        .set({
          reservedStock: newReserved,
          availableSizes: avs as any,
        })
        .where(eq(products.id, productId));

      updates.push({
        productId,
        stock: product.stock,
        reservedStock: newReserved,
        availableStock: Math.max(0, product.stock - newReserved),
        availableSizes: avs.map((s: any) => ({
          size: s.size,
          stock: s.stock ?? 0,
          reserved: s.reserved ?? 0,
        })),
      });
    }

    if (updates.length > 0) broadcastStockUpdate(updates);
  }

  async function releaseStockForOrder(orderItems: OrderItem[]) {
    const grouped = groupItemsByProduct(orderItems);
    const updates: Parameters<typeof broadcastStockUpdate>[0] = [];

    for (const [productId, sizeQtys] of Object.entries(grouped)) {
      const product = await storage.getProduct(productId);
      if (!product || product.isPreOrder) continue;

      const totalRelease = sizeQtys.reduce((s, q) => s + q.quantity, 0);
      const newReserved = Math.max(0, (product.reservedStock ?? 0) - totalRelease);

      const avs = (product.availableSizes || []).map((s: any) => {
        const match = sizeQtys.find((q) => q.size === s.size);
        if (!match) return s;
        return { ...s, reserved: Math.max(0, (s.reserved ?? 0) - match.quantity) };
      });

      await db
        .update(products)
        .set({
          reservedStock: newReserved,
          availableSizes: avs as any,
        })
        .where(eq(products.id, productId));

      updates.push({
        productId,
        stock: product.stock,
        reservedStock: newReserved,
        availableStock: Math.max(0, product.stock - newReserved),
        availableSizes: avs.map((s: any) => ({
          size: s.size,
          stock: s.stock ?? 0,
          reserved: s.reserved ?? 0,
        })),
      });
    }

    if (updates.length > 0) broadcastStockUpdate(updates);
  }

  async function confirmStockForOrder(orderItems: OrderItem[]) {
    const grouped = groupItemsByProduct(orderItems);
    const updates: Parameters<typeof broadcastStockUpdate>[0] = [];

    for (const [productId, sizeQtys] of Object.entries(grouped)) {
      const product = await storage.getProduct(productId);
      if (!product || product.isPreOrder) continue;

      const totalDeduct = sizeQtys.reduce((s, q) => s + q.quantity, 0);
      const newStock = Math.max(0, product.stock - totalDeduct);
      const newReserved = Math.max(0, (product.reservedStock ?? 0) - totalDeduct);

      const avs = (product.availableSizes || []).map((s: any) => {
        const match = sizeQtys.find((q) => q.size === s.size);
        if (!match) return s;
        return {
          ...s,
          stock: Math.max(0, (s.stock ?? 0) - match.quantity),
          reserved: Math.max(0, (s.reserved ?? 0) - match.quantity),
        };
      });

      const totalSizeStock = avs.reduce((acc: number, s: any) => acc + (s.stock ?? 0), 0);
      const effectiveStock = Math.max(newStock, totalSizeStock);

      await db
        .update(products)
        .set({
          stock: effectiveStock,
          reservedStock: newReserved,
          availableSizes: avs as any,
          inStock: effectiveStock > 0,
          stockLevel: effectiveStock <= 0 ? "out_of_stock" : effectiveStock <= 5 ? "low_stock" : "in_stock",
        })
        .where(eq(products.id, productId));

      updates.push({
        productId,
        stock: effectiveStock,
        reservedStock: newReserved,
        availableStock: Math.max(0, effectiveStock - newReserved),
        availableSizes: avs.map((s: any) => ({
          size: s.size,
          stock: s.stock ?? 0,
          reserved: s.reserved ?? 0,
        })),
      });
    }

    if (updates.length > 0) broadcastStockUpdate(updates);
  }

  function groupItemsByProduct(items: OrderItem[]): Record<string, { size: string; quantity: number }[]> {
    const grouped: Record<string, { size: string; quantity: number }[]> = {};
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) continue;
      if (!grouped[item.productId]) grouped[item.productId] = [];
      const existing = grouped[item.productId].find((e) => e.size === (item.size ?? ""));
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        grouped[item.productId].push({ size: item.size ?? "", quantity: item.quantity });
      }
    }
    return grouped;
  }

  // ─── End Stock Reservation Helpers ────────────────────────────────

  // Workflow stage mapping - User → Sales → Finance → Admin flow
  const STAGE_ROLE_MAP: Record<string, string | null> = {
    new_order: null,
    sales_approval: "sales",
    finance_approval: "finance",
    admin_approval: "admin",
    completed: null,
    rejected: null,
  };

  const NEXT_STAGE: Record<string, string> = {
    new_order: "sales_approval",
    sales_approval: "finance_approval",
    finance_approval: "admin_approval",
    admin_approval: "completed",
  };

  // Advance order to next workflow stage (role-based access)
  app.patch("/api/orders/:id/advance-stage", requireStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const { notes } = req.body;
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const currentStage = (order as any).workflowStage || 'new_order';
      const userRole = req.user?.role;

      // Check if user role matches the stage (admin can approve any stage)
      const requiredRole = STAGE_ROLE_MAP[currentStage];
      if (requiredRole && userRole !== requiredRole && userRole !== 'admin') {
        return res.status(403).json({ 
          message: `Only ${requiredRole} role can approve orders at this stage` 
        });
      }

      // Prevent advancement from terminal states
      if (currentStage === 'completed' || currentStage === 'rejected') {
        return res.status(400).json({ message: "Order is already in a terminal state and cannot be advanced" });
      }

      const nextStage = NEXT_STAGE[currentStage];
      if (!nextStage) {
        return res.status(400).json({ message: "Order cannot be advanced further" });
      }

      // Build workflow history entry
      const historyEntry = {
        stage: currentStage,
        action: 'approved',
        userId: req.user?.id || null,
        userName: req.user?.displayName || 'Unknown',
        timestamp: new Date().toISOString(),
        notes: notes || undefined,
      };

      const existingHistory = (order as any).workflowHistory || [];

      const updateData: any = {
        workflowStage: nextStage,
        workflowHistory: [...existingHistory, historyEntry],
        updatedAt: new Date().toISOString(),
      };

      // If final stage, mark as completed
      if (nextStage === 'completed') {
        updateData.status = 'completed';
        updateData.approvalStatus = 'approved';
        updateData.approvedBy = req.user?.id || null;
        updateData.approvedAt = new Date().toISOString();
      }

      const updatedOrder = await storage.updateOrder(orderId, updateData);

      // Confirm stock deduction when order reaches completed
      if (nextStage === 'completed' && order.orderType !== 'pre-order') {
        try {
          await confirmStockForOrder((order.items || []) as OrderItem[]);
        } catch (e) {
          console.error("[StockReserve] Failed to confirm stock for completed order", orderId, e);
        }
      }
      
      // Notify user when order is completed (via WebSocket broadcast)
      if (nextStage === 'completed') {
        console.log(`[Notification] Order ${orderId} completed. Approver: ${req.user?.displayName || 'Admin'}`);
        // Broadcast completion for any connected clients to pick up
        broadcastOrderSubmission({
          id: orderId,
          orderName: order.orderName || orderId,
          status: 'completed',
          total: parseFloat(order.total) || 0,
          itemCount: order.items?.length || 0,
          submittedAt: new Date().toISOString(),
          type: 'order_completed',
        });
      }
      
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error advancing order stage:", error);
      res.status(500).json({ message: "Failed to advance order stage" });
    }
  });

  // Account Manager approval endpoint - requires discount, payment method, and delivery method
  app.patch("/api/orders/:id/account-manager-approve", requireStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const { discountPercent, paymentMethod, deliveryMethod, notes } = req.body;
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const currentStage = (order as any).workflowStage || 'new_order';
      const userRole = req.user?.role;

      // Verify user is account_manager or admin
      if (userRole !== 'account_manager' && userRole !== 'admin') {
        return res.status(403).json({ 
          message: "Only Account Manager or Admin can use this approval endpoint" 
        });
      }

      // Verify order is at the correct stage
      if (currentStage !== 'account_manager_approval' && currentStage !== 'new_order') {
        return res.status(400).json({ 
          message: "Order is not at Account Manager approval stage" 
        });
      }

      // Validate required fields
      const errors: string[] = [];
      if (discountPercent === undefined || discountPercent === null || discountPercent === '') {
        errors.push("Discount percentage is required");
      } else if (parseFloat(discountPercent) < 0 || parseFloat(discountPercent) > 100) {
        errors.push("Discount percentage must be between 0 and 100");
      }
      
      const validPaymentMethods = ['cheques', 'card', 'cash'];
      if (!paymentMethod || !validPaymentMethods.includes(paymentMethod)) {
        errors.push("Payment method is required (cheques, card, or cash)");
      }
      
      const validDeliveryMethods = ['pickup_from_warehouse', 'delivery_to_store'];
      if (!deliveryMethod || !validDeliveryMethods.includes(deliveryMethod)) {
        errors.push("Delivery method is required (pickup from warehouse or delivery to store)");
      }

      if (errors.length > 0) {
        return res.status(400).json({ 
          message: "Validation failed",
          errors 
        });
      }

      const nextStage = 'sales_approval';

      // Build workflow history entry
      const historyEntry = {
        stage: currentStage,
        action: 'approved',
        userId: req.user?.id || null,
        userName: req.user?.displayName || 'Account Manager',
        timestamp: new Date().toISOString(),
        notes: notes || `Discount: ${discountPercent}%, Payment: ${paymentMethod}, Delivery: ${deliveryMethod}`,
      };

      const existingHistory = (order as any).workflowHistory || [];

      // Calculate new total with discount
      const subtotal = parseFloat(order.subtotal) || 0;
      const discountAmount = subtotal * (parseFloat(discountPercent) / 100);
      const newTotal = subtotal - discountAmount;

      const updateData: any = {
        workflowStage: nextStage,
        workflowHistory: [...existingHistory, historyEntry],
        discountPercent: discountPercent.toString(),
        paymentMethod,
        deliveryMethod,
        discount: discountAmount.toFixed(2),
        total: newTotal.toFixed(2),
        accountManagerApprovedBy: req.user?.id || null,
        accountManagerApprovedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updatedOrder = await storage.updateOrder(orderId, updateData);
      
      console.log(`[Account Manager] Order ${orderId} approved with discount ${discountPercent}%. Forwarded to Sales.`);
      
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error in Account Manager approval:", error);
      res.status(500).json({ message: "Failed to process Account Manager approval" });
    }
  });

  // Update order items (for Account Manager / Sales / Admin editing)
  app.patch("/api/orders/:id/items", requireStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const { items } = req.body;
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const currentStage = (order as any).workflowStage || 'new_order';
      const userRole = req.user?.role;

      const canEditItems =
        userRole === 'admin'
          ? ['new_order', 'account_manager_approval', 'sales_approval'].includes(currentStage)
          : userRole === 'account_manager'
            ? ['new_order', 'account_manager_approval'].includes(currentStage)
            : userRole === 'sales'
              ? currentStage === 'sales_approval'
              : false;

      if (!canEditItems) {
        return res.status(403).json({
          message:
            "You cannot edit order items at this stage, or your role is not allowed to edit items.",
        });
      }

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ message: "Items array is required" });
      }

      const lineKey = (i: { productId?: string; sku?: string; size?: string }) =>
        `${String(i.productId || '')}|${String(i.sku || '')}|${String(i.size || '')}`;

      const sumQtyByKey = (arr: any[]) => {
        const m = new Map<
          string,
          { item: any; qty: number; unitPrice: number }
        >();
        for (const i of arr) {
          const k = lineKey(i);
          const q = Number(i.quantity) || 0;
          const up = typeof i.unitPrice === 'number' ? i.unitPrice : parseFloat(String(i.unitPrice || 0)) || 0;
          if (!m.has(k)) {
            m.set(k, { item: i, qty: 0, unitPrice: up });
          }
          const e = m.get(k)!;
          e.qty += q;
          if (e.unitPrice === 0 && up > 0) e.unitPrice = up;
        }
        return m;
      };

      const oldItems = Array.isArray(order.items) ? order.items : [];
      const oldMap = sumQtyByKey(oldItems);
      const newMap = sumQtyByKey(items);

      const removedAt = new Date().toISOString();
      const removedByRole = String(userRole || 'staff');
      const removedByName =
        (req.user as any)?.displayName || (req.user as any)?.username || null;

      const newRemovals: Array<{
        productId: string;
        productName: string;
        sku: string;
        brand: string;
        size: string;
        quantityRemoved: number;
        unitPrice: number;
        totalPriceRemoved: number;
        removedByRole: string;
        removedByName: string | null;
        removedAt: string;
      }> = [];

      for (const [k, oldEntry] of oldMap) {
        const newQty = newMap.get(k)?.qty ?? 0;
        const oldQty = oldEntry.qty;
        if (newQty >= oldQty) continue;
        const removed = oldQty - newQty;
        const i = oldEntry.item;
        const up = oldEntry.unitPrice;
        newRemovals.push({
          productId: String(i.productId || ''),
          productName: String(i.productName || ''),
          sku: String(i.sku || ''),
          brand: String(i.brand || ''),
          size: String(i.size || ''),
          quantityRemoved: removed,
          unitPrice: up,
          totalPriceRemoved: removed * up,
          removedByRole,
          removedByName,
          removedAt,
        });
      }

      const priorRemoved = Array.isArray((order as any).itemsRemovedByStaff)
        ? (order as any).itemsRemovedByStaff
        : [];
      const itemsRemovedByStaff = [...priorRemoved, ...newRemovals];

      // Calculate new subtotal
      const subtotal = items.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0);

      const existingHistory = (order as any).workflowHistory || [];
      const editorName =
        (req.user as any)?.displayName || (req.user as any)?.username || removedByRole;
      const historyEntry = {
        stage: currentStage,
        action: 'items_edited',
        userId: req.user?.id || null,
        userName: editorName,
        timestamp: new Date().toISOString(),
        notes: 'Order line items updated',
      };

      const updateData: any = {
        items,
        subtotal: subtotal.toFixed(2),
        total: subtotal.toFixed(2), // Will be recalculated with discount during approval
        updatedAt: new Date().toISOString(),
        workflowHistory: [...existingHistory, historyEntry],
        itemsRemovedByStaff,
      };

      const updatedOrder = await storage.updateOrder(orderId, updateData);
      
      console.log(`[Staff] Order ${orderId} items updated. New subtotal: $${subtotal.toFixed(2)}`);
      
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order items:", error);
      res.status(500).json({ message: "Failed to update order items" });
    }
  });

  // Legacy approve endpoint (for backward compatibility) - now advances to next stage
  app.patch("/api/orders/:id/approve", requireStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const currentStage = (order as any).workflowStage || 'new_order';
      const nextStage = NEXT_STAGE[currentStage] || 'completed';

      const historyEntry = {
        stage: currentStage,
        action: 'approved',
        userId: req.user?.id || null,
        userName: req.user?.displayName || 'Unknown',
        timestamp: new Date().toISOString(),
      };

      const existingHistory = (order as any).workflowHistory || [];

      const updateData: any = {
        workflowStage: nextStage,
        workflowHistory: [...existingHistory, historyEntry],
        updatedAt: new Date().toISOString(),
      };

      if (nextStage === 'completed') {
        updateData.status = 'completed';
        updateData.approvalStatus = 'approved';
        updateData.approvedBy = req.user?.id || null;
        updateData.approvedAt = new Date().toISOString();
      }

      const updatedOrder = await storage.updateOrder(orderId, updateData);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error approving order:", error);
      res.status(500).json({ message: "Failed to approve order" });
    }
  });

  // Update order details (discount, payment method, delivery method)
  app.patch("/api/orders/:id/update-details", requireStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const { discountPercent, paymentMethod, deliveryMethod } = req.body;
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const validPaymentMethods = ['cheques', 'card', 'cash'];
      const validDeliveryMethods = ['pickup_from_warehouse', 'delivery_to_store'];

      const updateData: any = {
        updatedAt: new Date().toISOString(),
      };

      if (discountPercent !== undefined && discountPercent !== null && discountPercent !== '') {
        const discount = parseFloat(discountPercent);
        if (discount < 0 || discount > 100) {
          return res.status(400).json({ message: "Discount must be between 0 and 100" });
        }
        updateData.discountPercent = discountPercent.toString();
        
        // Recalculate total with new discount
        const subtotal = parseFloat(order.subtotal || order.total || '0');
        const discountAmount = subtotal * (discount / 100);
        const newTotal = subtotal - discountAmount;
        updateData.total = newTotal.toFixed(2);
      }

      if (paymentMethod) {
        if (!validPaymentMethods.includes(paymentMethod)) {
          return res.status(400).json({ message: `Payment method must be one of: ${validPaymentMethods.join(', ')}` });
        }
        updateData.paymentMethod = paymentMethod;
      }

      if (deliveryMethod) {
        if (!validDeliveryMethods.includes(deliveryMethod)) {
          return res.status(400).json({ message: `Delivery method must be one of: ${validDeliveryMethods.join(', ')}` });
        }
        updateData.deliveryMethod = deliveryMethod;
      }

      const updatedOrder = await storage.updateOrder(orderId, updateData);
      console.log(`[Staff] Order ${orderId} details updated`);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order details:", error);
      res.status(500).json({ message: "Failed to update order details" });
    }
  });

  // Return an order for correction (sends back to customer)
  app.patch("/api/orders/:id/return", requireStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const { reason } = req.body;
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const currentStage = (order as any).workflowStage || 'new_order';
      
      const historyEntry = {
        stage: currentStage,
        action: 'returned',
        userId: req.user?.id || null,
        userName: req.user?.displayName || 'Unknown',
        timestamp: new Date().toISOString(),
        notes: reason || 'Returned for correction',
      };

      const existingHistory = (order as any).workflowHistory || [];

      const updatedOrder = await storage.updateOrder(orderId, {
        workflowStage: 'new_order',
        workflowHistory: [...existingHistory, historyEntry],
        status: 'returned',
        approvalStatus: 'pending',
        rejectionReason: reason || 'Returned for correction',
        updatedAt: new Date().toISOString(),
      });

      // Release reserved stock so customer can re-edit
      if (order.orderType !== 'pre-order' && order.status !== 'draft' && order.status !== 'rejected' && order.status !== 'completed') {
        try {
          await releaseStockForOrder((order.items || []) as OrderItem[]);
        } catch (e) {
          console.error("[StockReserve] Failed to release stock for returned order", orderId, e);
        }
      }
      
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error returning order:", error);
      res.status(500).json({ message: "Failed to return order" });
    }
  });

  // Reject an order permanently
  app.patch("/api/orders/:id/reject", requireStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const { reason } = req.body;
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const currentStage = (order as any).workflowStage || 'new_order';
      
      const historyEntry = {
        stage: currentStage,
        action: 'rejected',
        userId: req.user?.id || null,
        userName: req.user?.displayName || 'Unknown',
        timestamp: new Date().toISOString(),
        notes: reason || 'Order rejected',
      };

      const existingHistory = (order as any).workflowHistory || [];

      const updatedOrder = await storage.updateOrder(orderId, {
        workflowStage: 'rejected',
        workflowHistory: [...existingHistory, historyEntry],
        status: 'rejected',
        approvalStatus: 'rejected',
        rejectionReason: reason || 'Order rejected',
        updatedAt: new Date().toISOString(),
      });

      // Release reserved stock back
      if (order.orderType !== 'pre-order' && order.status !== 'draft' && order.status !== 'rejected' && order.status !== 'completed') {
        try {
          await releaseStockForOrder((order.items || []) as OrderItem[]);
        } catch (e) {
          console.error("[StockReserve] Failed to release stock for rejected order", orderId, e);
        }
      }
      
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error rejecting order:", error);
      res.status(500).json({ message: "Failed to reject order" });
    }
  });

  // AI-powered order review
  app.post("/api/orders/ai-review", requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { order } = req.body;
      
      if (!order) {
        return res.status(400).json({ message: "Order data required" });
      }

      const orderTotal = typeof order.total === 'number' ? order.total : parseFloat(order.total) || 0;
      const orderBrand = order.brand || (order.items?.[0]?.brand) || 'Unknown';
      
      const itemsList = order.items?.map((item: any) => {
        const price = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
        const total = typeof item.total === 'number' ? item.total : parseFloat(item.total) || 0;
        return `- ${item.name || 'Unknown'} (SKU: ${item.sku || 'N/A'}) x${item.quantity || 0} @ $${price.toFixed(2)} = $${total.toFixed(2)}`;
      }).join('\n') || 'No items';

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert B2B order analyst for a wholesale footwear company. Analyze orders and provide insights on:
1. Order value assessment (is it typical for the customer segment?)
2. Product mix analysis (any unusual patterns?)
3. Potential issues or red flags
4. Recommendations for the account manager
5. Customer relationship insights

Keep your response concise but informative. Use bullet points when appropriate.`
          },
          {
            role: "user",
            content: `Please analyze this order:
Order ID: ${order.id || 'Unknown'}
Customer: ${order.customerName || 'Unknown'} (${order.customerEmail || 'No email'})
Brand: ${orderBrand}
Status: ${order.status || 'Unknown'}
Date: ${order.date || 'Unknown'}
Total: $${orderTotal.toFixed(2)}

Items:
${itemsList}

Please provide your analysis and recommendations.`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const analysis = completion.choices[0]?.message?.content || "Unable to generate analysis.";
      res.json({ analysis });
    } catch (error) {
      console.error("Error generating AI review:", error);
      res.status(500).json({ message: "Failed to generate AI review", analysis: "AI analysis is temporarily unavailable. Please try again later." });
    }
  });

  // AI assistant for general order queries
  app.post("/api/orders/ai-assistant", requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { message, ordersContext } = req.body;
      
      if (!message) {
        return res.status(400).json({ message: "Message required" });
      }

      const ordersummary = ordersContext?.slice(0, 10).map((o: any) => {
        const total = typeof o.total === 'number' ? o.total : parseFloat(o.total) || 0;
        return `Order #${o.id?.slice(-6) || 'Unknown'}: ${o.customerName || 'Unknown'} - $${total.toFixed(2)} - ${o.status || 'Unknown'}`;
      }).join('\n') || 'No orders available';

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an AI assistant for OrderFlow Pro, a B2B order management system. You help account managers with:
- Summarizing pending orders
- Identifying trends and patterns
- Drafting responses for returned orders
- Providing insights on customer behavior
- General order management questions

Current orders summary:
${ordersummary}

Be helpful, concise, and professional.`
          },
          {
            role: "user",
            content: message
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      const response = completion.choices[0]?.message?.content || "I couldn't process that request. Please try again.";
      res.json({ response });
    } catch (error) {
      console.error("Error with AI assistant:", error);
      res.status(500).json({ message: "Failed to process request", response: "Sorry, I'm having trouble right now. Please try again." });
    }
  });

  // Size Chart management routes
  app.get("/api/size-charts", async (req, res) => {
    try {
      const charts = await db.select().from(sizeCharts);
      res.json(charts);
    } catch (error) {
      console.error("Error fetching size charts:", error);
      res.status(500).json({ message: "Failed to fetch size charts" });
    }
  });

  app.get("/api/size-charts/:id", async (req, res) => {
    try {
      const [chart] = await db.select().from(sizeCharts).where(eq(sizeCharts.id, req.params.id));
      if (!chart) {
        return res.status(404).json({ message: "Size chart not found" });
      }
      res.json(chart);
    } catch (error) {
      console.error("Error fetching size chart:", error);
      res.status(500).json({ message: "Failed to fetch size chart" });
    }
  });

  app.post("/api/size-charts", async (req, res) => {
    try {
      const chartData = insertSizeChartSchema.parse(req.body);
      // Ensure sizes is a proper array for database insertion  
      const [chart] = await db.insert(sizeCharts).values({
        name: chartData.name,
        description: chartData.description,
        isActive: chartData.isActive,
        sizes: chartData.sizes ? [...chartData.sizes] : [],
        unitsPerSize: chartData.unitsPerSize || {}
      }).returning();
      res.status(201).json(chart);
    } catch (error) {
      console.error("Error creating size chart:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid size chart data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create size chart" });
    }
  });

  app.patch("/api/size-charts/:id", async (req, res) => {
    try {
      const [chart] = await db.update(sizeCharts)
        .set(req.body)
        .where(eq(sizeCharts.id, req.params.id))
        .returning();
      if (!chart) {
        return res.status(404).json({ message: "Size chart not found" });
      }
      res.json(chart);
    } catch (error) {
      console.error("Error updating size chart:", error);
      res.status(500).json({ message: "Failed to update size chart" });
    }
  });

  app.delete("/api/size-charts/:id", async (req, res) => {
    try {
      const [chart] = await db.delete(sizeCharts)
        .where(eq(sizeCharts.id, req.params.id))
        .returning();
      if (!chart) {
        return res.status(404).json({ message: "Size chart not found" });
      }
      res.json({ success: true, message: "Size chart deleted" });
    } catch (error) {
      console.error("Error deleting size chart:", error);
      res.status(500).json({ message: "Failed to delete size chart" });
    }
  });

  // Apply size chart sizes to existing carton products
  // This updates products that have unitsPerCarton but only "One Size" or empty sizes
  app.post("/api/size-charts/:id/apply-to-carton-products", async (req, res) => {
    try {
      const { productIds } = req.body; // Optional: specific product IDs to update
      
      // Fetch the size chart
      const [chart] = await db.select().from(sizeCharts).where(eq(sizeCharts.id, req.params.id));
      if (!chart) {
        return res.status(404).json({ message: "Size chart not found" });
      }
      
      if (!chart.sizes || chart.sizes.length === 0) {
        return res.status(400).json({ message: "Size chart has no sizes defined" });
      }
      
      // Find carton products to update
      let query = db.select().from(products).where(
        sql`${products.unitsPerCarton} IS NOT NULL AND ${products.unitsPerCarton} > 0`
      );
      
      let cartonProducts = await query;
      
      // Filter to specific product IDs if provided
      if (productIds && Array.isArray(productIds) && productIds.length > 0) {
        cartonProducts = cartonProducts.filter(p => productIds.includes(p.id));
      }
      
      // Filter to products with "One Size" or no proper sizes
      cartonProducts = cartonProducts.filter(p => {
        const sizes = p.availableSizes || [];
        if (sizes.length === 0) return true;
        if (sizes.length === 1 && sizes[0].size === 'One Size') return true;
        return false;
      });
      
      if (cartonProducts.length === 0) {
        return res.json({ 
          success: true, 
          message: "No carton products with 'One Size' found to update",
          updated: 0 
        });
      }
      
      // Build the new availableSizes from size chart, sorted numerically
      const unitsPerSize = chart.unitsPerSize || {};
      const sortedSizes = [...chart.sizes].sort((a: string, b: string) => {
        const numA = parseFloat(a);
        const numB = parseFloat(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });
      const newAvailableSizes = sortedSizes.map((size: string) => ({
        size: size,
        stock: unitsPerSize[size] || 0
      }));
      
      // Build stockMatrix from size chart (using 'Default' color for carton products)
      const newStockMatrix: Record<string, Record<string, number>> = {
        'Default': {}
      };
      for (const size of sortedSizes) {
        newStockMatrix['Default'][size] = unitsPerSize[size] || 0;
      }
      
      // Calculate total units per carton from size chart
      const totalUnits = Object.values(unitsPerSize).reduce((sum: number, val: any) => sum + (val || 0), 0);
      
      let updatedCount = 0;
      const updatedProducts: string[] = [];
      
      for (const product of cartonProducts) {
        // Preserve existing colourway in stockMatrix if available
        const productColor = product.colourway || 'Default';
        const stockMatrixForProduct: Record<string, Record<string, number>> = {
          [productColor]: {}
        };
        for (const size of sortedSizes) {
          stockMatrixForProduct[productColor][size] = unitsPerSize[size] || 0;
        }
        
        await db.update(products)
          .set({
            availableSizes: newAvailableSizes,
            stockMatrix: stockMatrixForProduct,
            // Update unitsPerCarton if size chart has units defined
            ...(totalUnits > 0 ? { unitsPerCarton: totalUnits } : {})
          })
          .where(eq(products.id, product.id));
        
        updatedCount++;
        updatedProducts.push(product.sku);
      }
      
      console.log(`📦 Applied size chart "${chart.name}" to ${updatedCount} carton products: ${updatedProducts.slice(0, 5).join(', ')}${updatedProducts.length > 5 ? '...' : ''}`);
      
      res.json({
        success: true,
        message: `Applied size chart to ${updatedCount} carton products`,
        updated: updatedCount,
        sizeChart: chart.name,
        sizes: chart.sizes,
        updatedSkus: updatedProducts.slice(0, 20) // Return first 20 SKUs
      });
    } catch (error) {
      console.error("Error applying size chart to carton products:", error);
      res.status(500).json({ message: "Failed to apply size chart to carton products" });
    }
  });

  // Parse Excel file to extract sizes for size chart creation
  app.post("/api/size-charts/parse-excel", uploadCSV.single('file'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.Workbook();
      await workbook.xlsx.readFile(file.path);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ message: "No worksheet found in the Excel file" });
      }

      const sizes: string[] = [];
      let suggestedName = '';

      // Try to extract sizes from the first row (header row with sizes)
      const firstRow = worksheet.getRow(1);
      let foundSizesInRow = false;
      
      firstRow.eachCell((cell, colNumber) => {
        const value = cell.value?.toString().trim();
        if (value) {
          // Check if this looks like a size (numeric, or common size patterns like S, M, L, XL)
          const lowerValue = value.toLowerCase();
          if (/^\d+(\.\d+)?$/.test(value) || 
              /^(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl)$/i.test(value) ||
              /^\d{1,2}-\d{1,2}$/.test(value) || // Range like 6-12
              /^\d+[a-z]?$/i.test(value)) { // Size like 7.5 or 38B
            sizes.push(value);
            foundSizesInRow = true;
          }
        }
      });

      // If no sizes found in first row, try first column
      if (!foundSizesInRow) {
        worksheet.eachRow((row, rowNumber) => {
          const firstCell = row.getCell(1);
          const value = firstCell.value?.toString().trim();
          if (value) {
            if (/^\d+(\.\d+)?$/.test(value) || 
                /^(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl)$/i.test(value) ||
                /^\d{1,2}-\d{1,2}$/.test(value) ||
                /^\d+[a-z]?$/i.test(value)) {
              sizes.push(value);
            }
          }
        });
      }

      // Try to extract a suggested name from the file name
      const fileName = file.originalname.replace(/\.(xlsx|xls)$/i, '');
      if (fileName && fileName.length < 50) {
        suggestedName = fileName.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
      }

      // Clean up uploaded file
      fs.unlinkSync(file.path);

      // Remove duplicates while preserving order
      const uniqueSizes = Array.from(new Set(sizes));

      res.json({
        sizes: uniqueSizes,
        suggestedName: suggestedName || undefined,
        message: uniqueSizes.length > 0 
          ? `Found ${uniqueSizes.length} sizes` 
          : 'No sizes detected in the file'
      });
    } catch (error) {
      console.error("Error parsing Excel for sizes:", error);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ message: "Failed to parse Excel file" });
    }
  });

  // Parse Size Chart Mapping File (product-specific or gender-based)
  app.post("/api/size-charts/parse-mapping", uploadCSV.single('file'), async (req, res) => {
    try {
      const file = req.file;
      const mappingType = req.body.mappingType as 'product-specific' | 'gender-based';
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      if (!mappingType || !['product-specific', 'gender-based'].includes(mappingType)) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ message: "Invalid mapping type" });
      }

      const fileExt = path.extname(file.originalname).toLowerCase();
      let rows: any[][] = [];

      if (fileExt === '.csv') {
        const { parse } = await import('csv-parse/sync');
        const csvText = fs.readFileSync(file.path, 'utf-8');
        rows = parse(csvText, { columns: false, skip_empty_lines: true, trim: true });
      } else if (fileExt === '.xlsx' || fileExt === '.xls') {
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.default.Workbook();
        await workbook.xlsx.readFile(file.path);
        
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          fs.unlinkSync(file.path);
          return res.status(400).json({ message: "No worksheet found in the Excel file" });
        }
        
        worksheet.eachRow((row, rowNumber) => {
          const rowValues = row.values as any[];
          const normalizedRow = rowValues.slice(1).map(cell => {
            if (cell === null || cell === undefined) return '';
            if (typeof cell === 'object' && cell.text !== undefined) return String(cell.text);
            return String(cell);
          });
          rows.push(normalizedRow);
        });
      } else {
        fs.unlinkSync(file.path);
        return res.status(400).json({ message: "Unsupported file type. Please upload CSV or Excel file." });
      }

      fs.unlinkSync(file.path);

      if (rows.length < 1) {
        return res.status(400).json({ message: "File must have at least one row" });
      }

      // Gender normalization map for fixing typos and standardizing casing
      const normalizeGenderLabel = (raw: string): string => {
        const lower = raw.toLowerCase().replace(/\s*(size|sizes)?\s*$/i, '').trim();
        
        // Common typos and variations
        if (lower.includes('men') && !lower.includes('women') && !lower.includes('wom')) {
          return 'Men';
        }
        if (lower.includes('women') || lower.includes('weman') || lower.includes('woman') || lower.includes('wmn')) {
          return 'Women';
        }
        if (lower.includes('kid') || lower.includes('child') || lower.includes('junior') || lower.includes('youth')) {
          return 'Kids';
        }
        if (lower.includes('unisex') || lower.includes('adult')) {
          return 'Unisex';
        }
        if (lower.includes('boy')) {
          return 'Boys';
        }
        if (lower.includes('girl')) {
          return 'Girls';
        }
        
        // Title case the original if no match
        return raw.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ').replace(/\s*(size|sizes)?\s*$/i, '').trim();
      };

      // Build mappings - horizontal format: each row has gender label in first column, sizes in subsequent columns
      const mappings: Array<{ key: string; sizes: string[] }> = [];
      const parsedRows: Array<{ key: string; sizes: string[]; rowIndex: number }> = [];
      
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        if (!row || row.length < 2) continue;
        
        // First column is the gender/key label
        let key = String(row[0] || '').trim();
        if (!key) continue;
        
        // DISABLED: Normalize gender key - keep exact values as provided in the file
        // This allows labels like "Homme et Unisex" to remain unchanged
        // if (mappingType === 'gender-based') {
        //   key = normalizeGenderLabel(key);
        // }
        
        // Remaining columns are the size VALUES (not headers)
        const sizes: string[] = [];
        for (let i = 1; i < row.length; i++) {
          const value = String(row[i] || '').trim();
          // Include non-empty values as sizes
          if (value && value !== '' && value.toLowerCase() !== 'n/a' && value.toLowerCase() !== 'no') {
            sizes.push(value);
          }
        }
        
        if (sizes.length > 0) {
          // Check if key already exists, merge sizes
          const existing = mappings.find(m => m.key.toLowerCase() === key.toLowerCase());
          if (existing) {
            existing.sizes = Array.from(new Set([...existing.sizes, ...sizes]));
          } else {
            mappings.push({ key, sizes });
          }
          parsedRows.push({ key, sizes, rowIndex });
        }
      }

      console.log(`📊 Size Chart Mapping: Parsed ${mappings.length} ${mappingType} mappings`);
      mappings.forEach(m => console.log(`  - ${m.key}: ${m.sizes.join(', ')}`));

      res.json({
        mappings,
        keyColumn: 'Gender',
        type: mappingType,
        sizeHeaders: [],
        parsedRows,
        message: `Found ${mappings.length} size mappings`
      });
    } catch (error) {
      console.error("Error parsing size chart mapping file:", error);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ message: "Failed to parse mapping file" });
    }
  });

  // Brand management routes
  app.get("/api/brands", async (req, res) => {
    try {
      const brandResults = await db.select().from(brands);
      res.json(brandResults.map((b) => withResolvedBrandLogo(b, req)));
    } catch (error) {
      console.error("Error fetching brands:", error);
      res.status(500).json({ message: "Failed to fetch brands" });
    }
  });

  app.get("/api/brands/:id", async (req, res) => {
    try {
      const brand = await storage.getBrand(req.params.id);
      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }
      res.json(withResolvedBrandLogo(brand, req));
    } catch (error) {
      console.error("Error fetching brand:", error);
      res.status(500).json({ message: "Failed to fetch brand" });
    }
  });

  app.post("/api/brands", async (req, res) => {
    try {
      // Auto-generate slug from name if not provided
      const body = { ...req.body };
      if (!body.slug && body.name) {
        body.slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }
      const brandData = insertBrandSchema.parse(body);
      const brand = await storage.createBrand(brandData);
      res.status(201).json(withResolvedBrandLogo(brand, req));
    } catch (error) {
      console.error("Error creating brand:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid brand data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create brand" });
    }
  });

  app.patch("/api/brands/:id", async (req, res) => {
    try {
      const updatedBrand = await storage.updateBrand(req.params.id, req.body);
      if (!updatedBrand) {
        return res.status(404).json({ message: "Brand not found" });
      }
      res.json(withResolvedBrandLogo(updatedBrand, req));
    } catch (error) {
      console.error("Error updating brand:", error);
      res.status(500).json({ message: "Failed to update brand" });
    }
  });

  app.delete("/api/brands/:id", async (req, res) => {
    try {
      const success = await storage.deleteBrand(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Brand not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting brand:", error);
      res.status(500).json({ message: "Failed to delete brand" });
    }
  });

  // Delete brand with all its products
  app.delete("/api/brands/:id/with-products", async (req, res) => {
    try {
      const brandId = req.params.id;
      
      // Get the brand first
      const brandResults = await db.select().from(brands).where(eq(brands.id, brandId));
      const brand = brandResults[0];
      
      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }
      
      // Delete all products with this brand name
      const deleteResult = await db.delete(products).where(eq(products.brand, brand.name));
      
      // Delete the brand
      await db.delete(brands).where(eq(brands.id, brandId));
      
      res.json({ success: true, deletedProducts: deleteResult.rowCount || 0 });
    } catch (error) {
      console.error("Error deleting brand with products:", error);
      res.status(500).json({ message: "Failed to delete brand with products" });
    }
  });

  // Brand logo upload route
  app.post("/api/brands/:id/logo", uploadBrandLogo.single("logo"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const brandId = req.params.id;
      console.log(`🖼️ Uploading logo for brand ID: ${brandId}`);
      
      // Query brand directly from database
      const brandResults = await db.select().from(brands).where(eq(brands.id, brandId));
      const brand = brandResults[0];
      
      if (!brand) {
        console.error(`❌ Brand not found: ${brandId}`);
        const allBrands = await db.select().from(brands);
        console.log(`📋 Available brands: ${allBrands.map(b => b.id).join(', ')}`);
        return res.status(404).json({ message: `Brand not found with ID: ${brandId}` });
      }

      const filePath = req.file.path;
      let logoUrl: string = `/uploads/products/${req.file.filename}`;

      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;

      if (cloudName && apiKey && apiSecret) {
        try {
          const cloudinary = (await import('cloudinary')).default;
          cloudinary.v2.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
          });

          const result = await cloudinary.v2.uploader.upload(filePath, {
            folder: 'wholesale-brand-logos',
            public_id: `brand_${brandId}_${Date.now()}`,
            overwrite: true,
            resource_type: 'image',
          });

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          logoUrl = result.secure_url;
          console.log(`✅ Brand logo uploaded to Cloudinary for ${brand.name}: ${logoUrl}`);
        } catch (cloudinaryError) {
          console.error('Cloudinary brand logo upload failed, using local file:', cloudinaryError);
        }
      } else {
        console.log('⚠️ CLOUDINARY_* not set — brand logo stored locally only (may not persist across deploys)');
      }

      // Update brand in database
      await db.update(brands).set({ logoUrl }).where(eq(brands.id, brandId));
      const updatedBrandResults = await db.select().from(brands).where(eq(brands.id, brandId));
      const updatedBrand = updatedBrandResults[0];
      
      console.log(`✅ Logo uploaded successfully for brand: ${brand.name}`);
      res.json(withResolvedBrandLogo(updatedBrand, req));
    } catch (error) {
      console.error("Error uploading brand logo:", error);
      res.status(500).json({ message: "Failed to upload brand logo" });
    }
  });

  // Brand size standards preview route - returns headers and raw preview for manual column mapping
  app.post("/api/brands/:id/size-standards/preview", uploadCSV.single("sizeStandards"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const brandId = req.params.id;
      console.log(`📏 Previewing size standards for brand ID: ${brandId}`);
      
      // Query brand directly from database
      const brandResults = await db.select().from(brands).where(eq(brands.id, brandId));
      const brand = brandResults[0];
      
      if (!brand) {
        console.error(`❌ Brand not found: ${brandId}`);
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: `Brand not found with ID: ${brandId}` });
      }

      // Parse the Excel file
      const filePath = req.file.path;
      const XLSX = (await import('xlsx')).default;
      const workbook = XLSX.readFile(filePath);
      
      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: "Excel file has no sheets" });
      }
      
      const sheet = workbook.Sheets[sheetName];
      const data: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      if (data.length < 2) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: "Excel file has no data rows" });
      }
      
      // Return ALL column headers for manual mapping
      const headers = (data[0] as any[]).map((h, idx) => ({
        index: idx,
        name: String(h || `Column ${idx + 1}`).trim()
      }));
      
      // Get raw preview rows (first 15 data rows)
      const rawPreviewRows: any[][] = [];
      for (let i = 1; i < Math.min(data.length, 16); i++) {
        const row = data[i] as any[];
        rawPreviewRows.push(row.map(cell => String(cell || '').trim()));
      }
      
      console.log(`📏 Found ${headers.length} columns: ${headers.map(h => h.name).join(', ')}`);
      
      // Store file path temporarily for the next steps
      const tempFileId = `size-standards-${brandId}-${Date.now()}`;
      const tempFilePath = `uploads/temp/${tempFileId}.xlsx`;
      fs.copyFileSync(filePath, tempFilePath);
      fs.unlinkSync(filePath);
      
      res.json({
        brandId,
        brandName: brand.name,
        tempFileId,
        headers: headers,
        rawPreviewRows,
        totalRows: data.length - 1
      });
    } catch (error) {
      console.error("Error previewing brand size standards:", error);
      res.status(500).json({ message: "Failed to preview brand size standards" });
    }
  });

  // Brand size standards - extract categories after column mapping
  app.post("/api/brands/:id/size-standards/extract-categories", async (req, res) => {
    try {
      const brandId = req.params.id;
      const { tempFileId, columnMapping } = req.body;
      
      if (!tempFileId || !columnMapping) {
        return res.status(400).json({ message: "Missing tempFileId or columnMapping" });
      }

      const { usIndex, euIndex, ukIndex, categoryIndex } = columnMapping;
      
      if (categoryIndex === undefined || categoryIndex < 0) {
        return res.status(400).json({ message: "Category column must be mapped" });
      }

      if (usIndex < 0 && euIndex < 0 && ukIndex < 0) {
        return res.status(400).json({ message: "At least one size column (US, EU, or UK) must be mapped" });
      }

      const tempFilePath = `uploads/temp/${tempFileId}.xlsx`;
      
      if (!fs.existsSync(tempFilePath)) {
        return res.status(400).json({ message: "Temporary file expired. Please upload again." });
      }

      const XLSX = (await import('xlsx')).default;
      const workbook = XLSX.readFile(tempFilePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Extract unique categories from the mapped column
      const categories = new Set<string>();
      const previewRows: any[] = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i] as any[];
        const category = String(row[categoryIndex] || '').trim();
        if (category) categories.add(category);
        
        if (i <= 15) {
          previewRows.push({
            us: usIndex >= 0 ? String(row[usIndex] || '').trim() : null,
            uk: ukIndex >= 0 ? String(row[ukIndex] || '').trim() : null,
            eu: euIndex >= 0 ? String(row[euIndex] || '').trim() : null,
            category: category
          });
        }
      }
      
      console.log(`📏 Found ${categories.size} unique categories: ${Array.from(categories).join(', ')}`);
      
      // Save column mapping to metadata
      const tempMetaPath = `uploads/temp/${tempFileId}.json`;
      const metadata = {
        brandId,
        categories: Array.from(categories),
        columnMapping: { usIndex, euIndex, ukIndex, categoryIndex }
      };
      fs.writeFileSync(tempMetaPath, JSON.stringify(metadata));
      
      res.json({
        categories: Array.from(categories),
        previewRows,
        totalRows: data.length - 1
      });
    } catch (error) {
      console.error("Error extracting categories:", error);
      res.status(500).json({ message: "Failed to extract categories" });
    }
  });

  // Brand size standards save route - applies category mapping and saves
  app.post("/api/brands/:id/size-standards", async (req, res) => {
    try {
      const brandId = req.params.id;
      const { tempFileId, categoryMapping } = req.body;
      
      // categoryMapping: { "BOYS-L": "Kids - Large", "GIRLS-J": "Kids - Junior", "MEN": "Men", ... }
      
      if (!tempFileId || !categoryMapping) {
        return res.status(400).json({ message: "Missing tempFileId or categoryMapping" });
      }
      
      // Valid target categories - must match product-detail size chart keys for correct product-to-size-chart mapping
      const validCategories = ['Adult Female', 'Adult Male', 'Unisex', 'Kids Female', 'Kids Male', 'Kids Unisex', 'Infant'];
      const invalidMappings: string[] = [];
      
      for (const [rawCategory, mappedCategory] of Object.entries(categoryMapping)) {
        if (!validCategories.includes(mappedCategory as string)) {
          invalidMappings.push(`"${rawCategory}" -> "${mappedCategory}"`);
        }
      }
      
      if (invalidMappings.length > 0) {
        return res.status(400).json({ 
          message: `Invalid category mappings. All categories must be mapped to: ${validCategories.join(', ')}`,
          invalidMappings
        });
      }
      
      console.log(`📏 Saving size standards for brand ID: ${brandId}`);
      console.log(`📏 Category mapping:`, categoryMapping);
      
      // Query brand directly from database
      const brandResults = await db.select().from(brands).where(eq(brands.id, brandId));
      const brand = brandResults[0];
      
      if (!brand) {
        console.error(`❌ Brand not found: ${brandId}`);
        return res.status(404).json({ message: `Brand not found with ID: ${brandId}` });
      }

      // Read the temp file and metadata
      const tempFilePath = `uploads/temp/${tempFileId}.xlsx`;
      const tempMetaPath = `uploads/temp/${tempFileId}.json`;
      
      if (!fs.existsSync(tempFilePath)) {
        return res.status(400).json({ message: "Temporary file expired. Please upload again." });
      }
      
      // Load metadata with column mapping and expected categories
      let expectedCategories: string[] = [];
      let columnMapping: any = null;
      if (fs.existsSync(tempMetaPath)) {
        const metadata = JSON.parse(fs.readFileSync(tempMetaPath, 'utf-8'));
        expectedCategories = metadata.categories || [];
        columnMapping = metadata.columnMapping;
      }
      
      if (expectedCategories.length === 0) {
        return res.status(400).json({ 
          message: "No category metadata found. Please complete column mapping first."
        });
      }
      
      if (!columnMapping) {
        return res.status(400).json({ 
          message: "No column mapping found. Please complete column mapping first."
        });
      }
      
      // Validate that categoryMapping is an object with correct keys
      if (!categoryMapping || typeof categoryMapping !== 'object') {
        return res.status(400).json({ 
          message: "Invalid categoryMapping format."
        });
      }
      
      const submittedCategories = Object.keys(categoryMapping);
      
      // Check for missing categories (expected but not submitted)
      const missingMappings = expectedCategories.filter(cat => !submittedCategories.includes(cat));
      if (missingMappings.length > 0) {
        return res.status(400).json({ 
          message: `Missing category mappings. All categories must be mapped.`,
          missingCategories: missingMappings
        });
      }
      
      // Validate all mapping values are non-empty and valid
      const emptyMappings: string[] = [];
      for (const [rawCategory, mappedCategory] of Object.entries(categoryMapping)) {
        if (!mappedCategory || typeof mappedCategory !== 'string' || mappedCategory.trim() === '') {
          emptyMappings.push(rawCategory);
        }
      }
      
      if (emptyMappings.length > 0) {
        return res.status(400).json({ 
          message: `Empty mappings found. All categories must be mapped to a valid value.`,
          emptyMappings
        });
      }
      
      const XLSX = (await import('xlsx')).default;
      const workbook = XLSX.readFile(tempFilePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      // Use stored column indices from the column mapping step
      const { usIndex, euIndex, ukIndex, categoryIndex } = columnMapping;
      
      // Build size standards: { category: { EU: ["36", "37"], US: ["4", "4.5"], UK: ["3", "3.5"] } }
      const sizeStandards: Record<string, Record<string, string[]>> = {};
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i] as any[];
        const rawCategory = String(row[categoryIndex] || '').trim();
        const mappedCategory = categoryMapping[rawCategory] || rawCategory;
        
        if (!mappedCategory) continue;
        
        if (!sizeStandards[mappedCategory]) {
          sizeStandards[mappedCategory] = { EU: [], US: [], UK: [] };
        }
        
        // Add sizes for each standard (using manual column mapping indices)
        // IMPORTANT: Always add a value (use "-" for empty) to keep arrays aligned for index-based conversion
        const euSize = euIndex >= 0 ? String(row[euIndex] || '').trim() : '';
        const usSize = usIndex >= 0 ? String(row[usIndex] || '').trim() : '';
        const ukSize = ukIndex >= 0 ? String(row[ukIndex] || '').trim() : '';
        
        // Only process row if at least one size value exists
        if (euSize || usSize || ukSize) {
          // Use "-" as placeholder for empty cells to keep arrays aligned
          sizeStandards[mappedCategory].EU.push(euSize || '-');
          sizeStandards[mappedCategory].US.push(usSize || '-');
          sizeStandards[mappedCategory].UK.push(ukSize || '-');
        }
      }
      
      console.log(`📏 Parsed size standards:`, JSON.stringify(sizeStandards, null, 2));
      
      // Update brand with size standards
      await db.update(brands).set({ sizeStandards: sizeStandards as any }).where(eq(brands.id, brandId));
      const updatedBrandResults = await db.select().from(brands).where(eq(brands.id, brandId));
      const updatedBrand = updatedBrandResults[0];
      
      // Clean up temp files
      fs.unlinkSync(tempFilePath);
      if (fs.existsSync(tempMetaPath)) {
        fs.unlinkSync(tempMetaPath);
      }
      
      console.log(`✅ Size standards saved successfully for brand: ${brand.name}`);
      res.json(updatedBrand);
    } catch (error) {
      console.error("Error saving brand size standards:", error);
      res.status(500).json({ message: "Failed to save brand size standards" });
    }
  });

  // Category management routes
  app.get("/api/categories", async (req, res) => {
    try {
      const categoryResults = await db.select().from(categories);
      res.json(categoryResults);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.get("/api/categories/:id", async (req, res) => {
    try {
      const category = await storage.getCategory(req.params.id);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json(category);
    } catch (error) {
      console.error("Error fetching category:", error);
      res.status(500).json({ message: "Failed to fetch category" });
    }
  });

  app.post("/api/categories", async (req, res) => {
    try {
      const categoryData = insertCategorySchema.parse(req.body);
      const category = await storage.createCategory(categoryData);
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid category data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  app.patch("/api/categories/:id", async (req, res) => {
    try {
      const updatedCategory = await storage.updateCategory(req.params.id, req.body);
      if (!updatedCategory) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json(updatedCategory);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  app.delete("/api/categories/:id", async (req, res) => {
    try {
      const success = await storage.deleteCategory(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  // Collection management routes
  app.get("/api/collections", async (req, res) => {
    try {
      const collections = await storage.getCollections();
      res.json(collections);
    } catch (error) {
      console.error("Error fetching collections:", error);
      res.status(500).json({ message: "Failed to fetch collections" });
    }
  });

  app.get("/api/collections/category/:categoryId", async (req, res) => {
    try {
      const collections = await storage.getCollectionsByCategory(req.params.categoryId);
      res.json(collections);
    } catch (error) {
      console.error("Error fetching collections by category:", error);
      res.status(500).json({ message: "Failed to fetch collections" });
    }
  });

  app.get("/api/collections/:id", async (req, res) => {
    try {
      const collection = await storage.getCollection(req.params.id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      res.json(collection);
    } catch (error) {
      console.error("Error fetching collection:", error);
      res.status(500).json({ message: "Failed to fetch collection" });
    }
  });

  app.post("/api/collections", async (req, res) => {
    try {
      const collectionData = insertCollectionSchema.parse(req.body);
      const collection = await storage.createCollection(collectionData);
      
      // Sync products: add collection name to selected products' collections array
      if (collectionData.productIds && collectionData.productIds.length > 0) {
        const allProducts = await storage.getProducts({});
        for (const productId of collectionData.productIds) {
          const product = allProducts.find((p: any) => p.id === productId);
          if (product) {
            const currentCollections = product.collections || [];
            if (!currentCollections.includes(collection.name)) {
              await storage.updateProduct(productId, {
                collections: [...currentCollections, collection.name]
              });
            }
          }
        }
      }
      
      res.status(201).json(collection);
    } catch (error) {
      console.error("Error creating collection:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid collection data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create collection" });
    }
  });

  app.patch("/api/collections/:id", async (req, res) => {
    try {
      const oldCollection = await storage.getCollection(req.params.id);
      if (!oldCollection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      
      const updatedCollection = await storage.updateCollection(req.params.id, req.body);
      if (!updatedCollection) {
        return res.status(404).json({ message: "Collection not found after update" });
      }
      
      // Sync products when productIds are provided
      if (req.body.productIds !== undefined) {
        const newProductIds = req.body.productIds || [];
        const oldProductIds = oldCollection.productIds || [];
        const allProducts = await storage.getProducts({});
        
        // Remove collection from products no longer in the list
        const removedProductIds = oldProductIds.filter((id: string) => !newProductIds.includes(id));
        for (const productId of removedProductIds) {
          const product = allProducts.find((p: any) => p.id === productId);
          if (product) {
            const currentCollections = (product.collections || []).filter(
              (c: string) => c !== updatedCollection.name
            );
            await storage.updateProduct(productId, { collections: currentCollections });
          }
        }
        
        // Add collection to newly selected products
        for (const productId of newProductIds) {
          const product = allProducts.find((p: any) => p.id === productId);
          if (product) {
            const currentCollections = product.collections || [];
            if (!currentCollections.includes(updatedCollection.name)) {
              await storage.updateProduct(productId, {
                collections: [...currentCollections, updatedCollection.name]
              });
            }
          }
        }
      }
      
      res.json(updatedCollection);
    } catch (error) {
      console.error("Error updating collection:", error);
      res.status(500).json({ message: "Failed to update collection" });
    }
  });

  app.delete("/api/collections/:id", async (req, res) => {
    try {
      const success = await storage.deleteCollection(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Collection not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting collection:", error);
      res.status(500).json({ message: "Failed to delete collection" });
    }
  });

  // Analytics routes
  app.get("/api/analytics/summary", async (req, res) => {
    try {
      const summary = await storage.getAnalyticsSummary();
      res.json(summary);
    } catch (error) {
      console.error("Error fetching analytics summary:", error);
      res.status(500).json({ message: "Failed to fetch analytics summary" });
    }
  });

  app.get("/api/analytics/orders", async (req, res) => {
    try {
      const { from, to } = req.query;
      const dateRange = from && to ? { from: from as string, to: to as string } : undefined;
      const trends = await storage.getOrderTrends(dateRange);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching order trends:", error);
      res.status(500).json({ message: "Failed to fetch order trends" });
    }
  });

  app.get("/api/analytics/revenue", async (req, res) => {
    try {
      const { type = 'category', parentId } = req.query;
      if (type !== 'category' && type !== 'brand') {
        return res.status(400).json({ message: "Type must be 'category' or 'brand'" });
      }
      const breakdown = await storage.getRevenueBreakdown(type, parentId as string);
      res.json(breakdown);
    } catch (error) {
      console.error("Error fetching revenue breakdown:", error);
      res.status(500).json({ message: "Failed to fetch revenue breakdown" });
    }
  });

  app.get("/api/analytics/products", async (req, res) => {
    try {
      const { limit, category, brand } = req.query;
      const limitNum = limit ? parseInt(limit as string, 10) : undefined;
      const performance = await storage.getProductPerformance(limitNum, category as string, brand as string);
      res.json(performance);
    } catch (error) {
      console.error("Error fetching product performance:", error);
      res.status(500).json({ message: "Failed to fetch product performance" });
    }
  });

  app.get("/api/analytics/cart-abandonment", async (req, res) => {
    try {
      const cartAnalytics = await storage.getCartAnalytics();
      res.json(cartAnalytics);
    } catch (error) {
      console.error("Error fetching cart analytics:", error);
      res.status(500).json({ message: "Failed to fetch cart analytics" });
    }
  });

  // Comprehensive cart summary endpoint
  app.get("/api/analytics/carts-summary", async (req, res) => {
    try {
      const allProducts = await storage.getProducts({});
      const productMap = new Map(allProducts.map(p => [p.id, p]));
      
      // Get all cart items across all sessions
      const allCartItems: any[] = [];
      const sessionIds = new Set<string>();
      
      // Access cart items from storage (in-memory)
      const cartItemsMap = (storage as any).memStorage?.cartItems || (storage as any).cartItems;
      if (cartItemsMap) {
        for (const item of cartItemsMap.values()) {
          allCartItems.push(item);
          sessionIds.add(item.sessionId);
        }
      }

      // Calculate items per brand
      const itemsPerBrand: Record<string, { count: number; totalQuantity: number; totalValue: number }> = {};
      const productAddCount: Record<string, { productId: string; name: string; brand: string; count: number; quantity: number; image1: string }> = {};
      const sizePopularity: Record<string, number> = {};
      const colorPopularity: Record<string, number> = {};
      
      let totalItems = 0;
      let totalQuantity = 0;
      let totalValue = 0;

      allCartItems.forEach(item => {
        const product = productMap.get(item.productId);
        if (!product) return;

        const brand = product.brand || 'Unknown';
        
        // Initialize brand stats
        if (!itemsPerBrand[brand]) {
          itemsPerBrand[brand] = { count: 0, totalQuantity: 0, totalValue: 0 };
        }

        // Initialize product stats
        if (!productAddCount[item.productId]) {
          productAddCount[item.productId] = {
            productId: item.productId,
            name: product.name,
            brand: product.brand || 'Unknown',
            count: 0,
            quantity: 0,
            image1: product.image1 || ''
          };
        }

        // Calculate quantities from selections
        const itemQuantity = item.selections?.reduce((sum: number, sel: any) => sum + (sel.quantity || 0), 0) || 0;
        const itemValue = itemQuantity * parseFloat(product.wholesalePrice?.toString() || '0');

        itemsPerBrand[brand].count += 1;
        itemsPerBrand[brand].totalQuantity += itemQuantity;
        itemsPerBrand[brand].totalValue += itemValue;

        productAddCount[item.productId].count += 1;
        productAddCount[item.productId].quantity += itemQuantity;

        totalItems += 1;
        totalQuantity += itemQuantity;
        totalValue += itemValue;

        // Track size and color popularity
        item.selections?.forEach((sel: any) => {
          if (sel.size) {
            sizePopularity[sel.size] = (sizePopularity[sel.size] || 0) + sel.quantity;
          }
          if (sel.color) {
            colorPopularity[sel.color] = (colorPopularity[sel.color] || 0) + sel.quantity;
          }
        });
      });

      // Sort brands by count
      const brandsSorted = Object.entries(itemsPerBrand)
        .map(([brand, stats]) => ({ brand, ...stats }))
        .sort((a, b) => b.totalQuantity - a.totalQuantity);

      // Get most added products (top 10)
      const mostAddedProducts = Object.values(productAddCount)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);

      // Get popular sizes (top 10)
      const popularSizes = Object.entries(sizePopularity)
        .map(([size, count]) => ({ size, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Get popular colors (top 10)
      const popularColors = Object.entries(colorPopularity)
        .map(([color, count]) => ({ color, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      res.json({
        summary: {
          totalActiveCarts: sessionIds.size,
          totalCartItems: totalItems,
          totalQuantity,
          totalValue: Math.round(totalValue * 100) / 100,
          avgItemsPerCart: sessionIds.size > 0 ? Math.round(totalItems / sessionIds.size * 10) / 10 : 0,
          avgValuePerCart: sessionIds.size > 0 ? Math.round(totalValue / sessionIds.size * 100) / 100 : 0
        },
        itemsPerBrand: brandsSorted,
        mostAddedProducts,
        popularSizes,
        popularColors
      });
    } catch (error) {
      console.error("Error fetching carts summary:", error);
      res.status(500).json({ message: "Failed to fetch carts summary" });
    }
  });

  app.get("/api/analytics/drill-down", async (req, res) => {
    try {
      const { level = 'summary', parentId } = req.query;
      if (level !== 'summary' && level !== 'category' && level !== 'brand') {
        return res.status(400).json({ message: "Level must be 'summary', 'category', or 'brand'" });
      }
      const drillDownData = await storage.getDrillDownData(level, parentId as string);
      res.json(drillDownData);
    } catch (error) {
      console.error("Error fetching drill-down data:", error);
      res.status(500).json({ message: "Failed to fetch drill-down data" });
    }
  });

  // Stock Management API routes
  
  // Current inventory route — full-catalog SQL + strict order limits (integer >= 1 only)
  app.get("/api/stock/inventory", async (req, res) => {
    const parsePositiveLimit = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n =
        typeof v === "number" && Number.isFinite(v)
          ? Math.trunc(v)
          : parseInt(String(v).trim(), 10);
      if (!Number.isFinite(n) || n < 1) return null;
      return n;
    };

    const limitOrderLabelFromProduct = (row: {
      limitOrder?: number | null;
      availableSizes?: { limitOrder?: unknown }[] | null;
    }): string | null => {
      const vals: number[] = [];
      const lo = parsePositiveLimit(row.limitOrder);
      if (lo != null) vals.push(lo);
      for (const s of row.availableSizes || []) {
        const x = parsePositiveLimit(s?.limitOrder);
        if (x != null) vals.push(x);
      }
      if (vals.length === 0) return null;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return min === max ? String(max) : `${min}–${max}`;
    };

    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const category = req.query.category as string;
      const brand = req.query.brand as string;
      const gender = req.query.gender as string;
      const search = req.query.search as string;
      const mode = (req.query.mode as string) || "all";
      const hasLimitOrder =
        req.query.hasLimitOrder === "true" || req.query.hasLimitOrder === "1";
      const outOfStockOnly =
        req.query.outOfStockOnly === "true" || req.query.outOfStockOnly === "1";

      const allProductsTotal = await storage.getFilteredProductCount({});

      const conditions: any[] = [];
      conditions.push(sql`jsonb_array_length(${products.collections}) > 0`);

      if (category && category !== "all-categories") {
        conditions.push(sql`LOWER(${products.category}) = LOWER(${category})`);
      }

      if (mode === "stock") {
        conditions.push(eq(products.isPreOrder, false));
      } else if (mode === "preorder") {
        conditions.push(eq(products.isPreOrder, true));
      }

      if (brand && brand !== "all-brands") {
        conditions.push(sql`LOWER(${brands.name}) = LOWER(${brand})`);
      }

      if (gender && gender !== "all-genders") {
        conditions.push(sql`LOWER(${products.gender}) = LOWER(${gender})`);
      }

      if (search && search.trim()) {
        const term = `%${search.trim().toLowerCase()}%`;
        conditions.push(sql`LOWER(${products.sku}) LIKE ${term}`);
      }

      if (hasLimitOrder) {
        conditions.push(sql`(
          (${products.limitOrder} IS NOT NULL AND ${products.limitOrder} >= 1)
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(${products.availableSizes}, '[]'::jsonb)) AS elem
            WHERE (elem->>'limitOrder') ~ '^[0-9]+$'
              AND (elem->>'limitOrder')::int >= 1
          )
        )`);
      }

      if (outOfStockOnly) {
        conditions.push(eq(products.isPreOrder, false));
        conditions.push(sql`COALESCE(${products.stock}, 0) <= 0`);
        conditions.push(sql`NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(${products.availableSizes}, '[]'::jsonb)) AS elem
          WHERE (elem->>'stock') ~ '^-?[0-9]+$' AND (elem->>'stock')::bigint > 0
        )`);
      }

      const whereClause = and(...conditions);

      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .leftJoin(brands, eq(products.brand, brands.id))
        .where(whereClause);

      const totalItems = countRows[0]?.count ?? 0;
      const totalPages = Math.ceil(totalItems / limit) || 0;
      const offset = (page - 1) * limit;

      const rows = await db
        .select({
          product: products,
          brandName: brands.name,
        })
        .from(products)
        .leftJoin(brands, eq(products.brand, brands.id))
        .where(whereClause)
        .orderBy(asc(products.sku))
        .limit(limit)
        .offset(offset);

      const inventory = rows.map(({ product, brandName }) => {
        const isPreOrder = product.isPreOrder || false;
        const avs = (product.availableSizes || []) as {
          size: string;
          stock?: number;
        }[];
        const variantSum = avs.reduce(
          (acc, s) => acc + (Number(s.stock) || 0),
          0
        );
        const currentStock = isPreOrder
          ? 0
          : Math.max(product.stock ?? 0, variantSum);

        const limitOrderLabel = limitOrderLabelFromProduct(product);

        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode ?? null,
          brand: brandName || product.brand,
          category: product.category,
          gender: product.gender,
          mainCategory: product.mainCategory ?? null,
          kidsGender: product.kidsGender ?? null,
          kidsAgeGroup: product.kidsAgeGroup ?? null,
          description: product.description ?? null,
          currentStock,
          isPreOrder,
          limitOrder: product.limitOrder ?? null,
          limitOrderLabel,
          minOrder: product.minOrder ?? 1,
          moq: product.moq ?? null,
          wholesalePrice: parseFloat(String(product.wholesalePrice)),
          retailPrice: parseFloat(String(product.retailPrice)),
          cost: product.cost ? parseFloat(String(product.cost)) : null,
          discount: product.discount ? parseFloat(String(product.discount)) : 0,
          image1: product.image1,
          sizes: product.availableSizes,
          collections: product.collections,
          inStock: product.inStock,
          stockLevel: product.stockLevel,
          division: product.division ?? null,
          countryOfOrigin: product.countryOfOrigin ?? null,
          keyCategory: product.keyCategory ?? null,
          colourway: product.colourway ?? null,
          primaryColor: product.primaryColor ?? null,
          ageGroup: product.ageGroup ?? null,
          corporateMarketingLine: product.corporateMarketingLine ?? null,
          productLine: product.productLine ?? null,
          productType: product.productType ?? null,
          sportsCategory: product.sportsCategory ?? null,
          conditions: product.conditions ?? null,
          materialComposition: product.materialComposition ?? null,
          unitsPerCarton: product.unitsPerCarton ?? null,
          baseCurrency: product.baseCurrency ?? "USD",
        };
      });

      res.json({
        items: inventory,
        allProductsTotal,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
          hasMore: page < totalPages,
        },
      });
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ error: "Failed to fetch inventory" });
    }
  });
  
  // Stock Batches
  app.get("/api/stock/batches", async (req, res) => {
    try {
      const batches = await storage.getStockBatches();
      res.json(batches);
    } catch (error) {
      console.error("Error fetching stock batches:", error);
      res.status(500).json({ message: "Failed to fetch stock batches" });
    }
  });

  app.get("/api/stock/batches/:id", async (req, res) => {
    try {
      const batch = await storage.getStockBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ message: "Stock batch not found" });
      }
      res.json(batch);
    } catch (error) {
      console.error("Error fetching stock batch:", error);
      res.status(500).json({ message: "Failed to fetch stock batch" });
    }
  });

  app.post("/api/stock/batches", async (req, res) => {
    try {
      const batchData = insertStockBatchSchema.parse(req.body);
      const batch = await storage.createStockBatch(batchData);
      res.status(201).json(batch);
    } catch (error) {
      console.error("Error creating stock batch:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid batch data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create stock batch" });
    }
  });

  app.patch("/api/stock/batches/:id", async (req, res) => {
    try {
      const updatedBatch = await storage.updateStockBatch(req.params.id, req.body);
      if (!updatedBatch) {
        return res.status(404).json({ message: "Stock batch not found" });
      }
      res.json(updatedBatch);
    } catch (error) {
      console.error("Error updating stock batch:", error);
      res.status(500).json({ message: "Failed to update stock batch" });
    }
  });

  // Stock Adjustments
  app.get("/api/stock/adjustments", async (req, res) => {
    try {
      const { batchId, productId } = req.query;
      const filters: { batchId?: string; productId?: string } = {};
      
      if (batchId) filters.batchId = batchId as string;
      if (productId) filters.productId = productId as string;
      
      const adjustments = await storage.getStockAdjustments(filters);
      res.json(adjustments);
    } catch (error) {
      console.error("Error fetching stock adjustments:", error);
      res.status(500).json({ message: "Failed to fetch stock adjustments" });
    }
  });

  app.post("/api/stock/adjustments", async (req, res) => {
    try {
      console.log("📦 Stock adjustment request:", JSON.stringify(req.body, null, 2));
      const adjustmentData = insertStockAdjustmentSchema.parse(req.body);
      console.log("📦 Parsed adjustment data:", JSON.stringify(adjustmentData, null, 2));
      const adjustment = await storage.createStockAdjustment(adjustmentData);
      console.log("✅ Created adjustment:", JSON.stringify(adjustment, null, 2));
      res.status(201).json(adjustment);
    } catch (error) {
      console.error("Error creating stock adjustment:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid adjustment data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create stock adjustment" });
    }
  });

  app.get("/api/stock/products/:productId/history", async (req, res) => {
    try {
      const history = await storage.getProductStockHistory(req.params.productId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching product stock history:", error);
      res.status(500).json({ message: "Failed to fetch product stock history" });
    }
  });

  // Stock Upload - Parse and preview file
  app.post("/api/stock/upload/preview", uploadCSV.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const filePath = req.file.path;
      const fileExt = path.extname(req.file.originalname).toLowerCase();

      let rows: any[] = [];
      let imageColumnInfo: { columnName: string; columnIndex: number; imageCount: number } | null = null;

      if (fileExt === '.csv') {
        // Parse CSV
        const { parse } = await import('csv-parse/sync');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        rows = parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true
        });
      } else if (fileExt === '.xls' || fileExt === '.xlsx') {
        // Parse Excel with ExcelJS to detect and extract embedded images
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        const worksheet = workbook.worksheets[0];
        const excelImages = worksheet.getImages();
        
        // Also parse with xlsx for row data first
        const XLSX = (await import('xlsx')).default;
        const xlsxWorkbook = XLSX.readFile(filePath);
        const sheetName = xlsxWorkbook.SheetNames[0];
        const xlsxWorksheet = xlsxWorkbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(xlsxWorksheet);
        
        // Extract and save FULL-QUALITY images from Excel ZIP media folder
        if (excelImages.length > 0) {
          // Find Article/SKU column for file naming
          const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
          const articleColName = columns.find((col: string) => 
            col.toLowerCase().includes('article') || 
            col.toLowerCase().includes('upc') || 
            col.toLowerCase().includes('sku')
          );
          
          // Build article number map (row index -> article number)
          const articleNumberMap = new Map<number, string>();
          if (articleColName) {
            rows.forEach((row: any, index: number) => {
              if (row[articleColName]) {
                articleNumberMap.set(index + 1, String(row[articleColName]).trim());
              }
            });
          }
          
          // Extract FULL-QUALITY images from Excel ZIP (bypasses Excel's compression)
          const fullQualityImages = await extractFullQualityImagesFromExcel(filePath);
          
          // Track extracted images with their row positions
          const extractedImageUrls: { row: number; imageUrl: string }[] = [];
          const imagesToUpload: { row: number; safeFileName: string; buffer: Buffer; extension: string }[] = [];
          let imageColIndex = -1;
          
          // Map full-quality images to rows using ExcelJS position data
          for (let i = 0; i < excelImages.length; i++) {
            const image = excelImages[i];
            const range = image.range;
            let row = 0;
            let col = 0;
            
            if (typeof range === 'object' && 'tl' in range) {
              row = Math.floor(range.tl.row);
              col = Math.floor(range.tl.col);
            }
            
            if (imageColIndex === -1) imageColIndex = col;
            
            // Get the corresponding full-quality image (images are in order)
            const fullQualityImage = fullQualityImages[i];
            if (fullQualityImage) {
              const articleNum = articleNumberMap.get(row) || `row${row}`;
              const safeFileName = articleNum.replace(/[^a-zA-Z0-9-_]/g, '_');
              
              // Prepare image data for batch processing
              imagesToUpload.push({
                row,
                safeFileName,
                buffer: fullQualityImage.buffer,
                extension: fullQualityImage.extension
              });
            }
          }
          
          // Batch upload images to Cloudinary
          const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
          const apiKey = process.env.CLOUDINARY_API_KEY;
          const apiSecret = process.env.CLOUDINARY_API_SECRET;
          
          if (cloudName && apiKey && apiSecret && imagesToUpload.length > 0) {
            const cloudinary = (await import('cloudinary')).default;
            const os = await import('os');
            
            cloudinary.v2.config({
              cloud_name: cloudName,
              api_key: apiKey,
              api_secret: apiSecret
            });
            
            // Create temp directory for this upload session
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'excel-images-'));
            console.log(`📁 Stock Upload: Created temp directory ${tempDir}`);
            
            try {
              // Process in batches of 5
              const batchSize = 5;
              for (let i = 0; i < imagesToUpload.length; i += batchSize) {
                const batch = imagesToUpload.slice(i, i + batchSize);
                
                const uploadPromises = batch.map(async (img) => {
                  const tempFilePath = path.join(tempDir, `${img.safeFileName}.${img.extension}`);
                  
                  // Write to temp file
                  fs.writeFileSync(tempFilePath, img.buffer);
                  
                  try {
                    const result = await cloudinary.v2.uploader.upload(tempFilePath, {
                      folder: 'wholesale-products',
                      public_id: img.safeFileName,
                      overwrite: true,
                      resource_type: 'image'
                    });
                    
                    // Delete temp file after successful upload
                    fs.unlinkSync(tempFilePath);
                    console.log(`✅ Stock Upload: Uploaded ${img.safeFileName} to Cloudinary`);
                    
                    return { row: img.row, imageUrl: result.secure_url };
                  } catch (uploadError) {
                    // Delete temp file even on error
                    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                    console.error(`❌ Stock Upload: Failed to upload ${img.safeFileName}:`, uploadError);
                    return { row: img.row, imageUrl: null };
                  }
                });
                
                const results = await Promise.all(uploadPromises);
                results.forEach(r => {
                  if (r.imageUrl) {
                    extractedImageUrls.push({ row: r.row, imageUrl: r.imageUrl });
                  }
                });
                
                // Small delay between batches
                if (i + batchSize < imagesToUpload.length) {
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              }
            } finally {
              // Clean up temp directory
              if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
                console.log(`🧹 Stock Upload: Cleaned up temp directory`);
              }
            }
          } else if (imagesToUpload.length > 0) {
            console.log(`⚠️ Stock Upload: Cloudinary credentials not configured, images not uploaded`);
          }
          
          // Update rows with image URLs
          if (extractedImageUrls.length > 0) {
            const headerRow = worksheet.getRow(1);
            const headerCell = headerRow.getCell(imageColIndex + 1);
            const columnName = headerCell.value ? String(headerCell.value) : 'Images';
            
            rows = rows.map((row: any, index: number) => {
              const imageInfo = extractedImageUrls.find(img => img.row === index + 1);
              if (imageInfo) {
                return { ...row, [columnName]: imageInfo.imageUrl };
              }
              return row;
            });
            
            imageColumnInfo = {
              columnName,
              columnIndex: imageColIndex,
              imageCount: extractedImageUrls.length
            };
            console.log(`Stock Upload: Extracted ${extractedImageUrls.length} full-quality images`);
          }
        }
      } else {
        return res.status(400).json({ message: "Only CSV and Excel files are supported" });
      }

      // Store raw rows temporarily for processing (like PreOrder)
      const tempDataId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const tempDataPath = path.join(process.cwd(), 'uploads/temp', `${tempDataId}.json`);
      const tempDir = path.dirname(tempDataPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Convert rows to raw 2D array format for header selection (like PreOrder)
      const rawRows: any[][] = [];
      
      // Get columns from first row
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      
      // First row is the header (column names)
      rawRows.push(columns);
      
      // Add data rows
      for (const row of rows) {
        const rowArray = columns.map(col => row[col] ?? '');
        rawRows.push(rowArray);
      }
      
      // Store the raw 2D array and image info
      fs.writeFileSync(tempDataPath, JSON.stringify({ rawRows, imageColumnInfo }));

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      res.json({
        totalRows: rawRows.length,
        rawRows: rawRows.slice(0, 20), // Preview first 20 rows
        fileName: req.file.originalname,
        tempDataId,
        imageColumnInfo
      });
    } catch (error) {
      console.error("Error parsing file:", error);
      res.status(500).json({ message: "Failed to parse file" });
    }
  });

  // Stock Upload - Set header row and get parsed data (like PreOrder)
  app.post("/api/stock/upload/set-header", async (req, res) => {
    try {
      const { tempDataId, headerRowIndex } = req.body;

      if (!tempDataId || headerRowIndex === undefined) {
        return res.status(400).json({ message: "Missing tempDataId or headerRowIndex" });
      }

      const tempDataPath = path.join(process.cwd(), 'uploads/temp', `${tempDataId}.json`);
      if (!fs.existsSync(tempDataPath)) {
        return res.status(400).json({ message: "Upload data not found. Please re-upload your file." });
      }

      const { rawRows, imageColumnInfo } = JSON.parse(fs.readFileSync(tempDataPath, 'utf-8'));

      if (!rawRows || rawRows.length === 0) {
        return res.status(400).json({ message: "No data found in file" });
      }

      // Use selected row as headers
      const headerRow = rawRows[headerRowIndex];
      const columns = headerRow.map((cell: any) => String(cell || '').trim() || `Column_${headerRow.indexOf(cell) + 1}`);

      // Convert remaining rows to objects
      const dataRows = rawRows.slice(headerRowIndex + 1).map((row: any[]) => {
        const obj: Record<string, any> = {};
        columns.forEach((col: string, i: number) => {
          obj[col] = row[i] ?? '';
        });
        return obj;
      });

      // Store parsed data back to temp file
      fs.writeFileSync(tempDataPath, JSON.stringify(dataRows));

      res.json({
        totalRows: dataRows.length,
        previewRows: dataRows.slice(0, 20),
        columns,
        tempDataId,
        imageColumnInfo
      });
    } catch (error) {
      console.error("Error setting header row:", error);
      res.status(500).json({ message: "Failed to set header row" });
    }
  });

  // Stock Upload - Preview with SKU status
  app.post("/api/stock/upload/preview-with-status", async (req, res) => {
    try {
      const { tempDataId, mapping } = req.body;

      if (!tempDataId || !mapping || !mapping.sku) {
        return res.status(400).json({ message: "Missing data or SKU mapping" });
      }

      // Read temp data
      const tempDataPath = path.join(process.cwd(), 'uploads/temp', `${tempDataId}.json`);
      if (!fs.existsSync(tempDataPath)) {
        return res.status(400).json({ message: "Upload data not found. Please re-upload your file." });
      }

      const rows = JSON.parse(fs.readFileSync(tempDataPath, 'utf-8'));

      // Get all unique SKUs from the file
      const skusInFile: string[] = Array.from(new Set(rows.map((row: any) => row[mapping.sku]?.toString().trim()).filter(Boolean))) as string[];

      // Fetch existing products
      const existingProducts = skusInFile.length > 0
        ? await db.select()
            .from(products)
            .where(sql`${products.sku} IN ${sql.raw(`(${skusInFile.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')})`)}`)
        : [];

      const productMap = new Map(existingProducts.map(p => [p.sku, p]));

      // Build preview rows with status
      const previewRows = rows.map((row: any, index: number) => {
        const sku = row[mapping.sku]?.toString().trim() || '';
        const stock = parseInt(row[mapping.stock]) || 50; // Default to 50 if not provided
        
        // Get raw color/size from upload, keep as-is (might be undefined/empty)
        const rawColor = (mapping.color && mapping.color !== 'none') ? row[mapping.color] : undefined;
        const rawSize = (mapping.size && mapping.size !== 'none') ? row[mapping.size] : undefined;
        
        // For display/processing, use 'Default' for color but preserve empty size
        // Empty size means product should get sizes from Size Chart (for carton products)
        const color = rawColor || 'Default';
        const size = rawSize || '';
        
        const existingProduct = productMap.get(sku);
        
        // Find the specific variant (color + size) in availableSizes
        let currentStock = 0;
        if (existingProduct?.availableSizes && existingProduct.availableSizes.length > 0) {
          // Normalize function: treat undefined, null, empty string as equivalent to default
          const normalize = (val: any, defaultVal: string) => {
            if (!val || val === '' || val === defaultVal) return defaultVal;
            return val.toString().trim();
          };
          
          const normalizedColor = normalize(rawColor, 'Default');
          const normalizedSize = rawSize ? rawSize.toString().trim() : ''; // Empty string if no size mapped
          
          // Try to find exact match (with normalization)
          let variant = existingProduct.availableSizes.find((v: any) => 
            normalize(v.color, 'Default') === normalizedColor && 
            (!normalizedSize || v.size === normalizedSize) // Match any size if empty, or exact match
          );
          
          // If no match found and size is empty, try to aggregate total stock
          if (!variant && !normalizedSize) {
            // Sum all sizes for this product (carton product case)
            currentStock = existingProduct.availableSizes.reduce((sum: number, v: any) => sum + (v.stock || 0), 0);
          } else if (variant) {
            currentStock = variant.stock || 0;
          }
        }
        
        // Extract mapped values with fallbacks
        const mappedName = row[mapping.name] || '';
        const mappedBrand = row[mapping.brand] || '';
        const mappedCategory = row[mapping.category] || '';
        const mappedGender = row[mapping.gender] || '';
        const mappedWholesalePrice = row[mapping.wholesalePrice] || '';
        const mappedRetailPrice = row[mapping.retailPrice] || '';
        const mappedMinOrder = row[mapping.minOrder] || '';
        const mappedDivision = (mapping.division && mapping.division !== 'none') ? row[mapping.division] : '';
        const mappedCountryOfOrigin = (mapping.countryOfOrigin && mapping.countryOfOrigin !== 'none') ? row[mapping.countryOfOrigin] : '';
        const mappedImageUrl = (mapping.imageUrl && mapping.imageUrl !== 'none') ? row[mapping.imageUrl] : '';
        const mappedDescription = (mapping.description && mapping.description !== 'none') ? row[mapping.description] : '';
        const mappedKeyCategory = (mapping.keyCategory && mapping.keyCategory !== 'none') ? row[mapping.keyCategory] : '';
        const mappedColourway = (mapping.colourway && mapping.colourway !== 'none') ? row[mapping.colourway] : '';
        const mappedAgeGroup = (mapping.ageGroup && mapping.ageGroup !== 'none') ? row[mapping.ageGroup] : '';
        const mappedCorporateMarketingLine = (mapping.corporateMarketingLine && mapping.corporateMarketingLine !== 'none') ? row[mapping.corporateMarketingLine] : '';
        const mappedProductLine = (mapping.productLine && mapping.productLine !== 'none') ? row[mapping.productLine] : '';
        const mappedProductType = (mapping.productType && mapping.productType !== 'none') ? row[mapping.productType] : '';
        const mappedSportsCategory = (mapping.sportsCategory && mapping.sportsCategory !== 'none') ? row[mapping.sportsCategory] : '';
        const mappedMoq = (mapping.moq && mapping.moq !== 'none') ? row[mapping.moq] : '';
        const mappedConditions = (mapping.conditions && mapping.conditions !== 'none') ? row[mapping.conditions] : '';
        const mappedMaterialComposition = (mapping.materialComposition && mapping.materialComposition !== 'none') ? row[mapping.materialComposition] : '';
        const mappedDiscount = (mapping.discount && mapping.discount !== 'none') ? row[mapping.discount] : '';
        const mappedUnitsPerCarton = (mapping.unitsPerCarton && mapping.unitsPerCarton !== 'none') ? row[mapping.unitsPerCarton] : '';

        return {
          rowNumber: index + 1,
          sku,
          productName: existingProduct?.name || mappedName,
          // Include ALL mapped fields at top level for frontend use
          name: existingProduct?.name || mappedName,
          brand: existingProduct?.brand || mappedBrand,
          category: existingProduct?.category || mappedCategory,
          gender: existingProduct?.gender || mappedGender,
          wholesalePrice: existingProduct?.wholesalePrice || mappedWholesalePrice,
          retailPrice: existingProduct?.retailPrice || mappedRetailPrice,
          minOrder: mappedMinOrder,
          division: mappedDivision,
          countryOfOrigin: mappedCountryOfOrigin,
          image1: existingProduct?.image1 || mappedImageUrl,
          imageUrls: (mappedImageUrl ? [mappedImageUrl] : []),
          description: existingProduct?.description || mappedDescription,
          color,
          size,
          previousStock: currentStock,
          newStock: stock,
          difference: stock - currentStock,
          status: existingProduct ? 'existing' : 'new',
          barcode: (mapping.barcode && mapping.barcode !== 'none') ? row[mapping.barcode] : '',
          // Metadata fields
          keyCategory: mappedKeyCategory,
          colourway: mappedColourway,
          ageGroup: mappedAgeGroup,
          corporateMarketingLine: mappedCorporateMarketingLine,
          productLine: mappedProductLine,
          productType: mappedProductType,
          sportsCategory: mappedSportsCategory,
          moq: mappedMoq,
          conditions: mappedConditions,
          materialComposition: mappedMaterialComposition,
          discount: mappedDiscount,
          unitsPerCarton: mappedUnitsPerCarton,
          // Keep rawData for backward compatibility
          rawData: {
            name: mappedName,
            brand: mappedBrand,
            category: mappedCategory,
            gender: mappedGender,
            wholesalePrice: mappedWholesalePrice,
            retailPrice: mappedRetailPrice,
            minOrder: mappedMinOrder,
            division: mappedDivision,
            countryOfOrigin: mappedCountryOfOrigin,
            imageUrl: mappedImageUrl,
            description: mappedDescription,
            keyCategory: mappedKeyCategory,
            colourway: mappedColourway,
            ageGroup: mappedAgeGroup,
            corporateMarketingLine: mappedCorporateMarketingLine,
            productLine: mappedProductLine,
            productType: mappedProductType,
            sportsCategory: mappedSportsCategory,
            moq: mappedMoq,
            conditions: mappedConditions,
            materialComposition: mappedMaterialComposition,
            discount: mappedDiscount,
            unitsPerCarton: mappedUnitsPerCarton
          }
        };
      });

      const existingCount = previewRows.filter((r: any) => r.status === 'existing').length;
      const newCount = previewRows.filter((r: any) => r.status === 'new').length;

      res.json({
        totalRows: rows.length,
        existingCount,
        newCount,
        previewRows
      });
    } catch (error) {
      console.error("Error generating preview with status:", error);
      res.status(500).json({ message: "Failed to generate preview" });
    }
  });

  // Stock Upload - Check for missing SKUs
  app.post("/api/stock/upload/check-missing", async (req, res) => {
    try {
      const { tempDataId, mapping } = req.body;

      if (!tempDataId || !mapping || !mapping.sku) {
        return res.status(400).json({ message: "Missing data or SKU mapping" });
      }

      // Read temp data
      const tempDataPath = path.join(process.cwd(), 'uploads/temp', `${tempDataId}.json`);
      if (!fs.existsSync(tempDataPath)) {
        return res.status(400).json({ message: "Upload data not found. Please re-upload your file." });
      }

      const rows = JSON.parse(fs.readFileSync(tempDataPath, 'utf-8'));

      // Extract all SKUs from the data
      const skusInFile = new Set<string>();
      const skuToRowData = new Map<string, any>();
      
      for (const row of rows) {
        const sku = row[mapping.sku]?.toString().trim();
        if (sku) {
          skusInFile.add(sku);
          // Store first occurrence of each SKU with its data
          if (!skuToRowData.has(sku)) {
            skuToRowData.set(sku, {
              sku,
              barcode: (mapping.barcode && mapping.barcode !== 'none') ? row[mapping.barcode] : '',
              color: (mapping.color && mapping.color !== 'none') ? row[mapping.color] : '',
              size: (mapping.size && mapping.size !== 'none') ? row[mapping.size] : '',
              stock: parseInt(row[mapping.stock]) || 50
            });
          }
        }
      }

      // Check which SKUs exist in database
      const existingSKUs = await db.select({ sku: products.sku })
        .from(products)
        .where(sql`${products.sku} IN ${sql.raw(`(${Array.from(skusInFile).map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`)}`)
;

      const existingSkuSet = new Set(existingSKUs.map(p => p.sku));

      // Find missing SKUs
      const missingSKUs = Array.from(skusInFile).filter(sku => !existingSkuSet.has(sku));
      const missingSkuData = missingSKUs.map(sku => skuToRowData.get(sku));

      res.json({
        totalSKUs: skusInFile.size,
        existingSKUs: existingSkuSet.size,
        missingSKUs: missingSKUs.length,
        missingSkuData
      });
    } catch (error) {
      console.error("Error checking missing SKUs:", error);
      res.status(500).json({ message: "Failed to check missing SKUs" });
    }
  });

  // Stock Upload - Quick create product for missing SKU
  app.post("/api/stock/upload/create-product", async (req, res) => {
    try {
      const data = req.body;
      
      console.log('Creating product with data:', { sku: data.sku, brand: data.brand, category: data.category });
      
      // Convert brand name to brand ID
      let brandId = data.brand;
      let actualBrandName = 'Product'; // Track the actual brand name for name construction
      
      // Check if brand is a name (not an ID) and find or create it
      if (brandId && !brandId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        // It's a brand name, not an ID
        const brandName = brandId;
        actualBrandName = brandName; // Save the brand name
        console.log('Looking up brand:', brandName);
        const existingBrands = await storage.getBrands();
        let brand = existingBrands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
        
        if (!brand) {
          // Create the brand
          console.log('Creating new brand:', brandName);
          brand = await storage.createBrand({
            name: brandName,
            slug: brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            description: '',
            logoUrl: '',
            isActive: true,
            priority: 0
          });
          console.log('Brand created with ID:', brand.id);
        } else {
          console.log('Found existing brand with ID:', brand.id);
        }
        
        brandId = brand.id;
      } else if (brandId) {
        // It's already an ID, look up the name
        const brands = await storage.getBrands();
        const brand = brands.find(b => b.id === brandId);
        actualBrandName = brand ? brand.name : 'Product';
      }
      
      // Auto-construct name as "Brand - SKU" if not provided
      let productName = data.name;
      if (!productName || productName.trim() === '') {
        productName = `${actualBrandName} - ${data.sku}`;
        console.log('Auto-constructed product name:', productName);
      }
      
      // Build product data directly like Pre-Order does (skip Zod parse for compatibility)
      const productData = {
        sku: data.sku,
        barcode: data.barcode || null,
        name: productName,
        brand: brandId,
        category: data.category || 'General',
        gender: data.gender || 'unisex',
        description: data.description || '',
        wholesalePrice: String(data.wholesalePrice || '0'),
        retailPrice: String(data.retailPrice || '0'),
        imageUrl: data.imageUrl || 'https://via.placeholder.com/400x400?text=No+Image',
        imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
        availableSizes: Array.isArray(data.availableSizes) ? data.availableSizes : [],
        inStock: data.inStock !== false,
        stockLevel: data.stockLevel || 'in_stock',
        collections: Array.isArray(data.collections) ? data.collections : [],
        stockMatrix: data.stockMatrix || null,
        minOrder: parseInt(data.minOrder) || 1,
        countryOfOrigin: data.countryOfOrigin || null,
        division: data.division || null,
        isPreOrder: data.isPreOrder === true,
        keyCategory: data.keyCategory || null,
        colourway: data.colourway || null,
        ageGroup: data.ageGroup || null,
        corporateMarketingLine: data.corporateMarketingLine || null,
        productLine: data.productLine || null,
        productType: data.productType || null,
        sportsCategory: data.sportsCategory || null,
        moq: data.moq ? parseInt(data.moq) : null,
        conditions: data.conditions || null,
        materialComposition: data.materialComposition || null,
        discount: String(data.discount || '0'),
        unitsPerCarton: data.unitsPerCarton ? parseInt(data.unitsPerCarton) : null,
        rawAttributes: data.rawAttributes || {},
      };
      
      console.log('Inserting product with brand ID:', brandId, 'SKU:', data.sku);
      const newProduct = await storage.createProduct(productData);
      console.log('Product created successfully:', newProduct.id);
      res.status(201).json(newProduct);
    } catch (error) {
      console.error("Error creating product:", error);
      if (error instanceof z.ZodError) {
        const errorDetails = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ 
          message: "Invalid product data", 
          errors: error.errors,
          details: errorDetails
        });
      }
      const errorMessage = error instanceof Error ? error.message : "Failed to create product";
      res.status(500).json({ message: errorMessage, error: String(error) });
    }
  });

  // Stock Upload - Process mapped data
  app.post("/api/stock/upload/process", async (req, res) => {
    try {
      const { rows, mapping, batchName } = req.body;

      if (!rows || !mapping) {
        return res.status(400).json({ message: "Missing data or mapping" });
      }

      console.log(`Processing ${rows.length} rows from edited preview data`);

      // Create stock batch
      const batch = await storage.createStockBatch({
        fileName: batchName || "Stock Upload",
        uploadedBy: "admin",
        recordsTotal: rows.length,
        status: "processing"
      });

      let processed = 0;
      const errors: string[] = [];
      const results: any[] = [];

      // Process the edited preview rows (not the original file data)
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]; // This is a preview row with sku, color, size, newStock already extracted
        try {
          const sku = row.sku || '';
          const stock = parseInt(row.newStock) || 50; // Default to 50 if not provided
          const color = row.color || 'Default';
          const size = row.size || ''; // Empty size - sizes should come from Size Chart for carton products
          const barcode = row.barcode || '';

          if (!sku) {
            errors.push(`Row ${i + 1}: Missing SKU`);
            results.push({
              rowNumber: i + 1,
              sku: sku || 'N/A',
              productName: '',
              color,
              size,
              previousStock: 0,
              newStock: stock,
              difference: 0,
              status: 'error',
              message: 'Missing SKU'
            });
            continue;
          }

          // Find product by SKU or barcode
          const productResults = barcode 
            ? await db.select().from(products).where(
                sql`${products.sku} = ${sku} OR ${products.barcode} = ${barcode}`
              ).limit(1)
            : await db.select().from(products).where(eq(products.sku, sku)).limit(1);

          if (productResults.length === 0) {
            errors.push(`Row ${i + 1}: Product not found - SKU: ${sku}`);
            results.push({
              rowNumber: i + 1,
              sku,
              productName: '',
              color,
              size,
              previousStock: 0,
              newStock: stock,
              difference: 0,
              status: 'error',
              message: 'Product not found'
            });
            continue;
          }

          const product = productResults[0];
          const currentStock = product.availableSizes?.reduce((sum: number, s: any) => sum + s.stock, 0) || 0;

          // Create stock adjustment
          await storage.createStockAdjustment({
            batchId: batch.id,
            productId: product.id,
            sku: product.sku,
            color,
            size,
            previousStock: currentStock,
            newStock: stock,
            adjustmentType: 'upload',
            adjustedBy: 'admin',
            reason: 'Bulk upload'
          });

          results.push({
            rowNumber: i + 1,
            sku: product.sku,
            productName: product.name,
            color,
            size,
            previousStock: currentStock,
            newStock: stock,
            difference: stock - currentStock,
            status: 'success',
            message: 'Updated successfully'
          });

          processed++;
        } catch (error: any) {
          errors.push(`Row ${i + 1}: ${error.message}`);
          results.push({
            rowNumber: i + 1,
            sku: row.sku || 'N/A',
            productName: '',
            color: row.color || 'Default',
            size: row.size || '', // Empty size - sizes should come from Size Chart for carton products
            previousStock: 0,
            newStock: 0,
            difference: 0,
            status: 'error',
            message: error.message
          });
        }
      }

      // Update batch status
      await storage.updateStockBatch(batch.id, {
        status: errors.length > 0 ? 'completed_with_errors' : 'completed',
        recordsProcessed: processed,
        errorLog: errors
      });

      res.json({
        batchId: batch.id,
        processed,
        total: rows.length,
        errors: errors.slice(0, 10), // Return first 10 errors
        results // Return detailed results for each row
      });
    } catch (error) {
      console.error("Error processing upload:", error);
      res.status(500).json({ message: "Failed to process upload" });
    }
  });

  // ==================== STOCK UPLOAD V2 ENDPOINTS ====================
  // New unified workflow that mirrors PreOrderUploadV2

  // Stock Upload V2 - Start async upload job (returns job ID immediately)
  app.post("/api/stock/upload/start", uploadCSV.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const filePath = req.file.path;
      const fileName = req.file.originalname;
      const fileExt = path.extname(fileName).toLowerCase();
      
      if (!['.csv', '.xlsx', '.xls'].includes(fileExt)) {
        return res.status(400).json({ message: "Unsupported file type. Please upload CSV or Excel file." });
      }
      
      console.log(`📦 Stock V2 Upload: Starting job for ${fileName} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
      
      const jobId = jobManager.createJob(filePath, fileName, fileExt);
      
      res.json({ jobId, message: "Upload started. Processing in background." });
    } catch (error) {
      console.error("Error starting stock upload job:", error);
      res.status(500).json({ message: "Failed to start upload" });
    }
  });

  // Stock Upload V2 - Get job status for polling
  app.get("/api/stock/jobs/:id", async (req, res) => {
    try {
      const jobId = req.params.id;
      
      // First check jobManager (for upload jobs)
      const job = jobManager.getJob(jobId);
      
      if (job) {
        const progress = job.progress || {};
        const elapsed = Date.now() - (progress.startedAt || job.createdAt || Date.now());
        const payload = {
          id: job.id,
          status: job.status,
          progress: {
            stage: progress.stage,
            percent: progress.percent,
            message: progress.message,
            productsProcessed: progress.productsProcessed,
            totalProducts: progress.totalProducts,
            productsCreated: progress.productsCreated,
            productsUpdated: progress.productsUpdated,
            stockUpdated: (progress as any).stockUpdated,
            startedAt: progress.startedAt,
            completedAt: progress.completedAt,
          },
          elapsed,
          tempDataId: job.tempDataId,
          result: job.status === 'completed' ? job.result : undefined,
          processingResult: job.status === 'completed' ? job.processingResult : undefined,
          error: job.error
        };
        return res.json(payload);
      }
      
      // Check for file-based status (for V2 processing jobs)
      if (jobId.startsWith('stock_proc_') || jobId.startsWith('img_')) {
        const uploadDir = path.join(process.cwd(), 'uploads/temp');
        const statusPath = path.join(uploadDir, `${jobId}_status.json`);
        
        if (fs.existsSync(statusPath)) {
          const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
          // Normalize the response to match expected format
          return res.json({
            id: jobId,
            status: statusData.status,
            progress: {
              productsProcessed: statusData.productsProcessed || 0,
              totalProducts: statusData.totalProducts || 0,
              productsCreated: statusData.productsCreated || 0,
              productsUpdated: statusData.productsUpdated || 0,
              stockUpdated: statusData.stockUpdated || 0,
              percent: statusData.percent || 0,
              message: statusData.message || ''
            },
            elapsed: statusData.elapsed || 0,
            processingResult: statusData.result || statusData.processingResult,
            error: statusData.error
          });
        }
      }
      
      return res.status(404).json({ message: "Job not found" });
    } catch (error) {
      console.error("Error fetching stock job status:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to get job status" });
      }
    }
  });

  // Stock Upload V2 - Extract embedded images (async job)
  app.post("/api/stock/extract-images", async (req, res) => {
    try {
      const { tempDataId, headerRowIndex } = req.body;
      
      if (!tempDataId) {
        return res.status(400).json({ message: "Missing tempDataId" });
      }
      
      const uploadDir = path.join(process.cwd(), 'uploads/temp');
      const metadataPath = path.join(uploadDir, `${tempDataId}_meta.json`);
      
      if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ message: "Upload session not found" });
      }
      
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      const { originalFilePath, fileExt } = metadata;
      
      if (fileExt !== '.xlsx' && fileExt !== '.xls') {
        return res.status(400).json({ message: "Embedded images only supported for Excel files" });
      }
      
      if (!fs.existsSync(originalFilePath)) {
        return res.status(404).json({ message: "Original file not found" });
      }
      
      // Create a job for image extraction
      const jobId = `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Start async extraction
      (async () => {
        try {
          console.log(`📸 Stock V2: Starting image extraction for ${tempDataId}`);
          
          const ExcelJS = (await import('exceljs')).default;
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.readFile(originalFilePath);
          const worksheet = workbook.worksheets[0];
          
          const excelImages = worksheet?.getImages() || [];
          console.log(`📸 Found ${excelImages.length} embedded images`);
          
          if (excelImages.length === 0) {
            // No images to extract
            const resultPath = path.join(uploadDir, `${tempDataId}_images.json`);
            fs.writeFileSync(resultPath, JSON.stringify([]));
            
            const statusPath = path.join(uploadDir, `${jobId}_status.json`);
            fs.writeFileSync(statusPath, JSON.stringify({
              status: 'completed',
              percent: 100,
              message: 'No images found',
              imagesProcessed: 0,
              totalImages: 0
            }));
            return;
          }
          
          // Get Cloudinary credentials
          const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
          const apiKey = process.env.CLOUDINARY_API_KEY;
          const apiSecret = process.env.CLOUDINARY_API_SECRET;
          
          if (!cloudName || !apiKey || !apiSecret) {
            const statusPath = path.join(uploadDir, `${jobId}_status.json`);
            fs.writeFileSync(statusPath, JSON.stringify({
              status: 'failed',
              percent: 0,
              message: 'Cloudinary not configured',
              imagesProcessed: 0,
              totalImages: excelImages.length
            }));
            return;
          }
          
          const cloudinary = (await import('cloudinary')).default;
          cloudinary.v2.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret
          });
          
          // Create temp directory for image extraction
          const tempImgDir = path.join(uploadDir, `temp_images_${tempDataId}`);
          if (!fs.existsSync(tempImgDir)) {
            fs.mkdirSync(tempImgDir, { recursive: true });
          }
          
          const uploadedImages: { rowIndex: number; imageUrl: string }[] = [];
          const effectiveHeaderRow = headerRowIndex || 0;
          
          for (let i = 0; i < excelImages.length; i++) {
            const image = excelImages[i];
            const img = workbook.getImage(image.imageId);
            
            // Update progress
            const statusPath = path.join(uploadDir, `${jobId}_status.json`);
            fs.writeFileSync(statusPath, JSON.stringify({
              status: 'running',
              percent: Math.round((i / excelImages.length) * 100),
              message: `Processing image ${i + 1} of ${excelImages.length}`,
              imagesProcessed: i,
              totalImages: excelImages.length
            }));
            
            if (img && img.buffer) {
              const extension = img.extension || 'png';
              const range = image.range;
              let row = 0;
              
              if (typeof range === 'object' && 'tl' in range) {
                row = Math.floor((range as any).tl.row);
              }
              
              // Adjust row for header
              const dataRowIndex = row - (effectiveHeaderRow + 1);
              
              const tempFilePath = path.join(tempImgDir, `img_${i}.${extension}`);
              fs.writeFileSync(tempFilePath, Buffer.from(img.buffer));
              
              try {
                const result = await cloudinary.v2.uploader.upload(tempFilePath, {
                  folder: `stock/${tempDataId.substring(0, 20)}`,
                  public_id: `row_${dataRowIndex}_${i}`,
                  resource_type: 'image'
                });
                
                uploadedImages.push({
                  rowIndex: dataRowIndex,
                  imageUrl: result.secure_url
                });
                
                fs.unlinkSync(tempFilePath);
              } catch (uploadError) {
                console.error(`Failed to upload image at row ${row}:`, uploadError);
              }
            }
          }
          
          // Clean up temp directory
          if (fs.existsSync(tempImgDir)) {
            fs.rmSync(tempImgDir, { recursive: true });
          }
          
          // Save uploaded images
          const resultPath = path.join(uploadDir, `${tempDataId}_images.json`);
          fs.writeFileSync(resultPath, JSON.stringify(uploadedImages));
          
          // Mark job complete
          const statusPath = path.join(uploadDir, `${jobId}_status.json`);
          fs.writeFileSync(statusPath, JSON.stringify({
            status: 'completed',
            percent: 100,
            message: `Extracted ${uploadedImages.length} images`,
            imagesProcessed: uploadedImages.length,
            totalImages: excelImages.length
          }));
          
          console.log(`📸 Stock V2: Image extraction complete - ${uploadedImages.length} images uploaded`);
          
        } catch (error: any) {
          console.error('Stock V2 image extraction error:', error);
          const statusPath = path.join(uploadDir, `${jobId}_status.json`);
          fs.writeFileSync(statusPath, JSON.stringify({
            status: 'failed',
            percent: 0,
            message: error.message || 'Extraction failed',
            imagesProcessed: 0,
            totalImages: 0
          }));
        }
      })();
      
      res.json({ jobId });
    } catch (error) {
      console.error("Error starting image extraction:", error);
      res.status(500).json({ message: "Failed to start image extraction" });
    }
  });

  // Stock Upload V2 - Poll image extraction job status
  app.get("/api/stock/extract-images/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const uploadDir = path.join(process.cwd(), 'uploads/temp');
      const statusPath = path.join(uploadDir, `${jobId}_status.json`);
      
      if (!fs.existsSync(statusPath)) {
        return res.json({
          status: 'running',
          percent: 0,
          message: 'Starting...',
          imagesProcessed: 0,
          totalImages: 0
        });
      }
      
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      res.json(status);
    } catch (error) {
      console.error("Error fetching image extraction status:", error);
      res.status(500).json({ message: "Failed to get status" });
    }
  });

  // Stock Upload V2 - Process and create/update products with stock
  app.post("/api/stock/v2/process", async (req, res) => {
    try {
      const { 
        tempDataId, 
        brandId, 
        baseCurrency,
        mapping, 
        headerRowIndex, 
        categoryMappings, 
        genderNormalizationMap, 
        divisionMappings,
        sizeChartId, 
        sizeChartSizes,
        sizeChartMappingType,
        sizeChartMappingData,
        imageSource,
        mode
      } = req.body;
      
      console.log("🔍 Stock V2 process request:", {
        hasTempDataId: !!tempDataId,
        hasBrandId: !!brandId,
        hasMapping: !!mapping,
        headerRowIndex,
        imageSource: imageSource || 'none',
        mode: mode || 'individual',
        sizeChartMappingType: sizeChartMappingType || 'none',
        hasSizeChartMappingData: !!sizeChartMappingData
      });
      
      if (!tempDataId || !brandId || !mapping) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      if (!mapping.sku) {
        return res.status(400).json({ message: "SKU column mapping is required" });
      }
      
      if (!mapping.stock) {
        return res.status(400).json({ message: "Stock column mapping is required" });
      }
      
      // Create a processing job
      const jobId = `stock_proc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Start async processing
      (async () => {
        const uploadDir = path.join(process.cwd(), 'uploads/temp');
        const startTime = Date.now();
        
        try {
          // Load data from temp storage
          const metadataPath = path.join(uploadDir, `${tempDataId}_meta.json`);
          const rawDataPath = path.join(uploadDir, `${tempDataId}_raw.json`);
          
          if (!fs.existsSync(metadataPath)) {
            throw new Error("Upload session expired. Please upload again.");
          }
          
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          const { originalFilePath, fileExt, totalRowCount } = metadata;

          if (!fs.existsSync(originalFilePath)) {
            throw new Error("Original file not found. Please upload again.");
          }

          const stream = fileExt === '.csv'
            ? streamCsvRowsChunked(originalFilePath, headerRowIndex ?? 0, 1000)
            : streamExcelRowsChunked(originalFilePath, headerRowIndex ?? 0, 1000);

          const skuGroups = new Map<string, { rowIndex: number; data: Record<string, any> }[]>();
          let rowIndex = 0;
          let columns: string[] = [];

          for await (const chunk of stream) {
            for (const rowObj of chunk.rows) {
              const sku = String(rowObj[mapping.sku] || '').trim();
              if (!sku) continue;
              if (columns.length === 0) {
                columns = Object.keys(rowObj).filter((k) => !k.startsWith('_'));
              }
              if (!skuGroups.has(sku)) {
                skuGroups.set(sku, []);
              }
              skuGroups.get(sku)!.push({ rowIndex, data: rowObj });
              rowIndex++;
            }
          }

          const totalDataRows = rowIndex;
          console.log(`📦 Stock V2: Processing ${totalDataRows} data rows (${skuGroups.size} unique SKUs)`);
          
          // Load pre-uploaded images if available
          let preUploadedImages = new Map<number, string>();
          if (imageSource === 'embedded') {
            const imagesPath = path.join(uploadDir, `${tempDataId}_images.json`);
            if (fs.existsSync(imagesPath)) {
              const content = JSON.parse(fs.readFileSync(imagesPath, 'utf-8'));
              const images = Array.isArray(content) ? content : (content.uploaded || []);
              for (const img of images) {
                const rowIdx = img.rowIndex !== undefined ? img.rowIndex : img.row;
                if (rowIdx !== undefined && img.imageUrl) {
                  preUploadedImages.set(rowIdx, img.imageUrl);
                }
              }
              console.log(`📸 Loaded ${preUploadedImages.size} pre-uploaded images`);
            }
          }
          
          // Get brand info
          const brand = await storage.getBrand(brandId);
          const brandName = brand?.name || 'Unknown';
          
          const batch = await storage.createStockBatch({
            fileName: metadata.fileName || "Stock Upload V2",
            uploadedBy: "admin",
            recordsTotal: totalDataRows,
            status: "processing"
          });
          
          // BATCH OPTIMIZATION: Fetch all existing products in batches to avoid query size limits
          // PostgreSQL IN clause has practical limits (~1000-10000 items), so we batch the batch-check
          const allSKUs = Array.from(skuGroups.keys());
          const EXISTENCE_CHECK_BATCH_SIZE = 5000; // Safe batch size for IN clause
          const existingProductsMap = new Map<string, typeof products.$inferSelect>();
          
          console.log(`🔍 Batch-checking ${allSKUs.length} products for existence (in batches of ${EXISTENCE_CHECK_BATCH_SIZE})...`);
          
          for (let i = 0; i < allSKUs.length; i += EXISTENCE_CHECK_BATCH_SIZE) {
            const skuBatch = allSKUs.slice(i, i + EXISTENCE_CHECK_BATCH_SIZE);
            const batchProducts = await db.select().from(products)
              .where(inArray(products.sku, skuBatch));
            
            for (const product of batchProducts) {
              existingProductsMap.set(product.sku, product);
            }
            
            if ((i + EXISTENCE_CHECK_BATCH_SIZE) % 50000 === 0 || i + EXISTENCE_CHECK_BATCH_SIZE >= allSKUs.length) {
              console.log(`  ✓ Checked ${Math.min(i + EXISTENCE_CHECK_BATCH_SIZE, allSKUs.length)}/${allSKUs.length} SKUs, found ${existingProductsMap.size} existing`);
            }
          }
          
          console.log(`✅ Batch check complete: Found ${existingProductsMap.size} existing products out of ${allSKUs.length} SKUs`);
          
          let productsCreated = 0;
          let productsUpdated = 0;
          let stockUpdated = 0;
          const errors: string[] = [];
          const productIds: string[] = [];
          
          const skuEntries = Array.from(skuGroups.entries());
          
          for (let idx = 0; idx < skuEntries.length; idx++) {
            const [sku, rows] = skuEntries[idx];
            
            // Update progress periodically (every 50 products) to reduce file I/O overhead
            // For very large uploads, updating every product creates too much overhead
            if (idx % 50 === 0 || idx === skuEntries.length - 1) {
              const statusPath = path.join(uploadDir, `${jobId}_status.json`);
              fs.writeFileSync(statusPath, JSON.stringify({
                status: 'running',
                productsProcessed: idx + 1,
                totalProducts: skuEntries.length,
                productsCreated,
                productsUpdated,
                stockUpdated,
                percent: Math.round(((idx + 1) / skuEntries.length) * 100),
                message: `Processing product ${idx + 1} of ${skuEntries.length}...`,
                elapsed: Date.now() - startTime
              }));
            }
            
            try {
              const firstRow = rows[0].data;
              const firstRowIndex = rows[0].rowIndex;
              
              // Extract product data
              const name = mapping.name ? String(firstRow[mapping.name] || '').trim() : sku;
              const barcode = mapping.barcode ? String(firstRow[mapping.barcode] || '').trim() : '';
              const category = mapping.category ? String(firstRow[mapping.category] || '').trim() : '';
              const color = mapping.colourway ? String(firstRow[mapping.colourway] || '').trim() : '';
              const wholesalePrice = mapping.wholesalePrice ? String(firstRow[mapping.wholesalePrice] || '0').trim() : '0';
              const retailPrice = mapping.retailPrice ? String(firstRow[mapping.retailPrice] || '0').trim() : '0';
              const description = mapping.description ? String(firstRow[mapping.description] || '').trim() : '';
              
              // Handle gender normalization using three-layer category system
              let gender = mapping.gender ? String(firstRow[mapping.gender] || '').trim().toUpperCase() : '';
              let ageGroup = mapping.ageGroup ? String(firstRow[mapping.ageGroup] || '').trim() : '';
              let mainCategory = '';
              let kidsGender = '';
              let kidsAgeGroup = '';
              
              if (categoryMappings && gender) {
                const catMapping = categoryMappings[gender];
                if (catMapping) {
                  mainCategory = catMapping.mainCategory || '';
                  if (mainCategory === 'KIDS') {
                    kidsGender = catMapping.kidsGender || '';
                    kidsAgeGroup = catMapping.kidsAgeGroup || '';
                  }
                }
              }
              
              // Match product to carton size chart mapping based on gender + age group
              let productUnitsPerSize: Record<string, number> | null = null;
              let productSizesFromChart: string[] = [];
              
              if (mode === 'carton' && sizeChartMappingType === 'gender-based' && sizeChartMappingData?.mappings) {
                // Match products using mappedGender and mappedAgeGroup from carton config
                // Get product's normalized gender (after categoryMappings) and ageGroup
                const rawGender = gender || '';
                // For stock upload, gender is already normalized through categoryMappings
                // Use mainCategory/kidsGender if it's a KIDS product, otherwise use the raw gender
                const normalizedGender = mainCategory === 'KIDS' && kidsGender 
                  ? kidsGender 
                  : (rawGender || '');
                const rawAgeGroup = ageGroup || '';
                // For KIDS products, use kidsAgeGroup if available
                const effectiveAgeGroup = mainCategory === 'KIDS' && kidsAgeGroup 
                  ? kidsAgeGroup 
                  : rawAgeGroup;
                
                console.log(`🔍 Stock matching: rawGender=${rawGender}, normalizedGender=${normalizedGender}, rawAgeGroup=${rawAgeGroup}, effectiveAgeGroup=${effectiveAgeGroup}`);
                
                // Find matching size chart mapping by comparing product's normalized gender + ageGroup 
                // to carton config's mappedGender + mappedAgeGroup
                for (const mapping of sizeChartMappingData.mappings) {
                  const configMappedGender = mapping.mappedGender || '';
                  const configMappedAgeGroup = mapping.mappedAgeGroup || '';
                  
                  // Match normalized gender and ageGroup (case-insensitive)
                  const genderMatch = normalizedGender && configMappedGender 
                    ? normalizedGender.toLowerCase().trim() === configMappedGender.toLowerCase().trim()
                    : false;
                  
                  const ageGroupMatch = effectiveAgeGroup && configMappedAgeGroup
                    ? effectiveAgeGroup.toLowerCase().trim() === configMappedAgeGroup.toLowerCase().trim()
                    : (!effectiveAgeGroup && !configMappedAgeGroup); // Both empty = match
                  
                  // Both gender and ageGroup must match
                  if (genderMatch && ageGroupMatch) {
                    productUnitsPerSize = mapping.unitsPerSize || {};
                    productSizesFromChart = mapping.sizes || [];
                    const totalUnits = Object.values(productUnitsPerSize).reduce((sum: number, val: any) => sum + (val || 0), 0);
                    console.log(`📦 Matched carton config for SKU ${sku}: mappedGender="${configMappedGender}", mappedAgeGroup="${configMappedAgeGroup}" (product: normalizedGender="${normalizedGender}", effectiveAgeGroup="${effectiveAgeGroup}"), Total: ${totalUnits} units per carton`);
                    break;
                  }
                }
              }
              
              // Build stock matrix from all rows for this SKU and calculate total stock
              const stockMatrix: Record<string, Record<string, number>> = {};
              const sizeStockMap: Record<string, number> = {}; // Track stock per size
              let totalStock = 0; // Direct sum of stock values from mapping
              const hasSizeMapping = mapping.size && mapping.size !== 'none'; // Check if size column is mapped
              
              for (const { rowIndex, data } of rows) {
                // Only extract size if column is mapped AND has actual data
                // Empty/undefined sizes mean product should get sizes from Size Chart (for carton products)
                const rawSize = hasSizeMapping ? String(data[mapping.size] || '').trim() : '';
                const size = rawSize && rawSize !== '' ? rawSize : null; // null = no size data
                const rowColor = mapping.colourway ? String(data[mapping.colourway] || '').trim() : 'Default';
                const stockValue = parseInt(String(data[mapping.stock] || '0').replace(/[^0-9]/g, '')) || 0;
                
                // Add to total stock (direct from Stock/Quantity* column)
                totalStock += stockValue;
                
                // Only build size-based matrices if size data is actually available and non-empty
                if (size !== null) {
                  if (!stockMatrix[rowColor]) {
                    stockMatrix[rowColor] = {};
                  }
                  stockMatrix[rowColor][size] = (stockMatrix[rowColor][size] || 0) + stockValue;
                  
                  // Track stock per size (sum across all colors)
                  sizeStockMap[size] = (sizeStockMap[size] || 0) + stockValue;
                }
                
                stockUpdated++;
              }
              
              // Build availableSizes only if we have actual size data from Excel
              // If no size mapping, don't create availableSizes - let existing product keep its sizes
              // or for new products, sizes should come from Size Chart
              const hasSizeData = Object.keys(sizeStockMap).length > 0;
              // Also check stockMatrix has non-empty size keys
              const hasStockMatrixData = Object.values(stockMatrix).some(colorMap => 
                Object.keys(colorMap).some(size => size !== '' && size !== null)
              );
              const availableSizes = hasSizeData 
                ? Object.entries(sizeStockMap)
                    .filter(([size]) => size !== '') // Remove empty size entries
                    .sort(([a], [b]) => {
                      const numA = parseFloat(a);
                      const numB = parseFloat(b);
                      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                      return a.localeCompare(b);
                    })
                    .map(([size, stock]) => ({ size, stock }))
                : null; // null means don't update sizes
              
              // Get image
              let image1 = '';
              if (imageSource === 'embedded' && preUploadedImages.has(firstRowIndex)) {
                image1 = preUploadedImages.get(firstRowIndex) || '';
              } else if (imageSource === 'column' && mapping.image1) {
                image1 = String(firstRow[mapping.image1] || '').trim();
              }
              
              // Check if product already exists (using batch-fetched map)
              const existingProduct = existingProductsMap.get(sku);
              
              if (existingProduct) {
                // Update existing product - Stock Upload converts pre-order to in-stock
                
                // Helper function to clean price values (remove currency symbols, commas, etc.)
                const cleanPrice = (value: any): string => {
                  if (!value) return '0';
                  return String(value).replace(/[^0-9.]/g, '') || '0';
                };
                
                // Build update object - only include availableSizes/stockMatrix if we have actual size data
                const updateData: Record<string, any> = {
                  stock: totalStock, // Direct stock value from Stock/Quantity* mapping
                  inStock: totalStock > 0,
                  stockLevel: totalStock > 0 ? 'in_stock' : 'out_of_stock',
                  isPreOrder: false, // Stock Upload always sets to non-pre-order (converts pre-order to in-stock)
                };
                
                // Update all product properties if provided in the upload
                if (name && name !== sku) updateData.name = name;
                if (barcode) updateData.barcode = barcode;
                if (category) updateData.category = category;
                if (gender) updateData.gender = gender;
                if (description) updateData.description = description;
                if (wholesalePrice) updateData.wholesalePrice = cleanPrice(wholesalePrice);
                if (retailPrice) updateData.retailPrice = cleanPrice(retailPrice);
                if (color) updateData.colourway = color;
                if (ageGroup) updateData.ageGroup = ageGroup;
                
                // Update optional fields if mapped
                if (mapping.minOrder && firstRow[mapping.minOrder]) {
                  const minOrderVal = parseInt(String(firstRow[mapping.minOrder])) || 1;
                  updateData.minOrder = minOrderVal;
                }
                if (mapping.countryOfOrigin && firstRow[mapping.countryOfOrigin]) {
                  updateData.countryOfOrigin = String(firstRow[mapping.countryOfOrigin]).trim();
                }
                if (mapping.keyCategory && firstRow[mapping.keyCategory]) {
                  updateData.keyCategory = String(firstRow[mapping.keyCategory]).trim();
                }
                if (mapping.corporateMarketingLine && firstRow[mapping.corporateMarketingLine]) {
                  updateData.corporateMarketingLine = String(firstRow[mapping.corporateMarketingLine]).trim();
                }
                if (mapping.productLine && firstRow[mapping.productLine]) {
                  updateData.productLine = String(firstRow[mapping.productLine]).trim();
                }
                if (mapping.productType && firstRow[mapping.productType]) {
                  updateData.productType = String(firstRow[mapping.productType]).trim();
                }
                if (mapping.sportsCategory && firstRow[mapping.sportsCategory]) {
                  updateData.sportsCategory = String(firstRow[mapping.sportsCategory]).trim();
                }
                if (mapping.moq && firstRow[mapping.moq]) {
                  const moqVal = parseInt(String(firstRow[mapping.moq]));
                  if (!isNaN(moqVal)) updateData.moq = moqVal;
                }
                if (mapping.conditions && firstRow[mapping.conditions]) {
                  updateData.conditions = String(firstRow[mapping.conditions]).trim();
                }
                if (mapping.materialComposition && firstRow[mapping.materialComposition]) {
                  updateData.materialComposition = String(firstRow[mapping.materialComposition]).trim();
                }
                if (mapping.discount && firstRow[mapping.discount]) {
                  updateData.discount = cleanPrice(firstRow[mapping.discount]);
                }
                
                // Update division from Division column via divisionMappings (same logic as Pre-Order)
                const rawDivision = mapping.division && mapping.division !== 'none' ? firstRow[mapping.division] : undefined;
                if (divisionMappings && typeof divisionMappings === 'object') {
                  let matchedDivision: string | undefined;
                  if (rawDivision && String(rawDivision).trim()) {
                    const rawTrimmed = String(rawDivision).trim();
                    matchedDivision = divisionMappings[rawTrimmed];
                    if (!matchedDivision) {
                      const lowerRaw = rawTrimmed.toLowerCase();
                      const matchingKey = Object.keys(divisionMappings).find(k => k !== '__default' && k.toLowerCase().trim() === lowerRaw);
                      if (matchingKey) matchedDivision = divisionMappings[matchingKey];
                    }
                  }
                  if (!matchedDivision && divisionMappings['__default']) {
                    matchedDivision = divisionMappings['__default'];
                  }
                  if (matchedDivision) {
                    updateData.division = matchedDivision;
                  }
                }
                
                // Only update sizes if we have actual size data from Excel
                // Otherwise, preserve existing product sizes (important for carton products that got sizes from Size Chart)
                if (availableSizes !== null && hasSizeData && hasStockMatrixData) {
                  updateData.stockMatrix = stockMatrix;
                  updateData.availableSizes = availableSizes;
                }
                
                if (image1) updateData.image1 = image1;
                if (mainCategory) updateData.mainCategory = mainCategory;
                if (kidsGender) updateData.kidsGender = kidsGender;
                if (kidsAgeGroup) updateData.kidsAgeGroup = kidsAgeGroup;
                // Use row-level currency if mapped, otherwise fall back to brand-step selection
                const rowCurrency = mapping.currency ? String(firstRow[mapping.currency] || '').trim() : '';
                if (rowCurrency || baseCurrency) updateData.baseCurrency = rowCurrency || baseCurrency;
                
                // Set unitsPerSize from carton config mapping if matched
                if (productUnitsPerSize && Object.keys(productUnitsPerSize).length > 0) {
                  updateData.unitsPerSize = productUnitsPerSize;
                  // Also calculate and set unitsPerCarton as the sum of all units per size
                  const totalUnitsPerCarton = Object.values(productUnitsPerSize).reduce((sum, n) => sum + (n || 0), 0);
                  if (totalUnitsPerCarton > 0) {
                    updateData.unitsPerCarton = totalUnitsPerCarton;
                  }
                }
                
                await db.update(products)
                  .set(updateData)
                  .where(eq(products.id, existingProduct.id));
                
                productIds.push(existingProduct.id);
                productsUpdated++;
              } else {
                // Create new product - for new products without size data, use empty array
                // (sizes should come from Size Chart for carton products)
                // Resolve division from Division column + divisionMappings (same logic as Pre-Order)
                const rawDivision = mapping.division && mapping.division !== 'none' ? String(firstRow[mapping.division] || '').trim() : '';
                let resolvedDivision = '';
                if (divisionMappings && typeof divisionMappings === 'object') {
                  if (rawDivision) {
                    const exactMatch = divisionMappings[rawDivision];
                    if (exactMatch) {
                      resolvedDivision = exactMatch;
                    } else {
                      const lowerRaw = rawDivision.toLowerCase();
                      const matchingKey = Object.keys(divisionMappings).find(k => k !== '__default' && k.toLowerCase().trim() === lowerRaw);
                      if (matchingKey) resolvedDivision = divisionMappings[matchingKey] || '';
                    }
                  }
                  if (!resolvedDivision && divisionMappings['__default']) {
                    resolvedDivision = divisionMappings['__default'];
                  }
                }
                if (!resolvedDivision && rawDivision) resolvedDivision = rawDivision;

                const productData = {
                  sku,
                  barcode: barcode || null,
                  name: name || sku,
                  brand: brandId, // Use brandId (not brandName) - foreign key constraint requires brand ID
                  category: category || 'General',
                  gender: mainCategory || gender || 'ADULT UNISEX',
                  mainCategory: mainCategory || null,
                  kidsGender: kidsGender || null,
                  kidsAgeGroup: kidsAgeGroup || null,
                  division: resolvedDivision || null,
                  wholesalePrice: wholesalePrice || '0',
                  retailPrice: retailPrice || '0',
                  description: description || '',
                  colourway: color || '',
                  image1: image1 || 'https://via.placeholder.com/400x400?text=No+Image',
                  imageUrl: image1 || 'https://via.placeholder.com/400x400?text=No+Image',
                  imageUrls: image1 ? [image1] : [],
                  // For new products without size data, use empty array - sizes should come from Size Chart
                  availableSizes: availableSizes || [],
                  // Only include stockMatrix if we have actual size data with non-empty keys
                  stockMatrix: hasStockMatrixData ? stockMatrix : {},
                  stock: totalStock, // Direct stock value from Stock/Quantity* mapping
                  inStock: totalStock > 0,
                  stockLevel: totalStock > 0 ? 'in_stock' : 'out_of_stock',
                  collections: [],
                  minOrder: 1,
                  isPreOrder: false,
                  baseCurrency: (mapping.currency ? String(firstRow[mapping.currency] || '').trim() : '') || baseCurrency || 'USD',
                  // Set unitsPerSize from carton config mapping if matched
                  unitsPerSize: productUnitsPerSize || {},
                  // Calculate unitsPerCarton as sum of all units per size
                  unitsPerCarton: productUnitsPerSize 
                    ? Object.values(productUnitsPerSize).reduce((sum, n) => sum + (n || 0), 0) 
                    : undefined,
                };
                
                const newProduct = await storage.createProduct(productData);
                productIds.push(newProduct.id);
                productsCreated++;
              }
              
            } catch (err: any) {
              errors.push(`SKU ${sku}: ${err.message}`);
              if (errors.length > 100) break;
            }
          }
          
          // Update batch status (finalization - use async to avoid blocking)
          try {
            await storage.updateStockBatch(batch.id, {
              status: errors.length > 0 ? 'completed_with_errors' : 'completed',
              recordsProcessed: productsCreated + productsUpdated,
              errorLog: errors
            });
          } catch (batchErr: unknown) {
            console.error('Stock batch update failed:', batchErr);
            throw batchErr;
          }
          
          const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
          const statusPayload = {
            status: 'completed' as const,
            productsProcessed: skuEntries.length,
            totalProducts: skuEntries.length,
            productsCreated,
            productsUpdated,
            stockUpdated,
            percent: 100,
            message: 'Processing complete',
            elapsed: Date.now() - startTime,
            result: {
              success: true,
              productsCreated,
              productsUpdated,
              stockUpdated,
              errors: errors.slice(0, 20),
              processingTime: `${processingTime}s`
            }
          };
          const statusPath = path.join(uploadDir, `${jobId}_status.json`);
          await fsp.writeFile(statusPath, JSON.stringify(statusPayload), 'utf-8');
          
          console.log(`✅ Stock V2: Complete - Created: ${productsCreated}, Updated: ${productsUpdated}, Stock entries: ${stockUpdated} in ${processingTime}s`);
          
        } catch (error: unknown) {
          console.error('Stock V2 processing error:', error);
          const errMsg = error instanceof Error ? error.message : String(error ?? 'Processing failed');
          const statusPath = path.join(uploadDir, `${jobId}_status.json`);
          try {
            await fsp.writeFile(statusPath, JSON.stringify({
              status: 'failed',
              percent: 0,
              message: errMsg,
              productsProcessed: 0,
              totalProducts: 0,
              productsCreated: 0,
              productsUpdated: 0,
              stockUpdated: 0,
              elapsed: Date.now() - startTime
            }), 'utf-8');
          } catch (writeErr) {
            console.error('Failed to write error status file:', writeErr);
          }
        }
      })();
      
      res.json({ jobId });
    } catch (error) {
      console.error("Error starting stock V2 processing:", error);
      res.status(500).json({ message: "Failed to start processing" });
    }
  });

  // Stock Upload V2 - Poll processing job status
  app.get("/api/stock/v2/jobs/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const uploadDir = path.join(process.cwd(), 'uploads/temp');
      const statusPath = path.join(uploadDir, `${jobId}_status.json`);
      
      if (!fs.existsSync(statusPath)) {
        return res.json({
          status: 'running',
          percent: 0,
          message: 'Starting...',
          productsProcessed: 0,
          totalProducts: 0,
          productsCreated: 0,
          productsUpdated: 0,
          stockUpdated: 0,
          elapsed: 0
        });
      }
      
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      res.json(status);
    } catch (error) {
      console.error("Error fetching stock V2 job status:", error);
      res.status(500).json({ message: "Failed to get status" });
    }
  });

  // Get collections by type (preorder or stock) using efficient SQL aggregation
  app.get("/api/preorder/collections", async (req, res) => {
    try {
      const { type } = req.query; // 'preorder' or 'stock'
      const brands = await storage.getBrands();
      
      // Get collection settings from database to know collection types
      const allSettings = await db.select().from(preorderCollectionSettings);
      const settingsMap = new Map(allSettings.map(s => [s.collectionName, s]));
      
      // Use efficient SQL to get collection stats without loading all products
      // This query extracts collection names from JSONB arrays and counts products per collection
      const isPreOrderFilter = type === 'stock' ? false : true;
      
      const collectionStats = await db.execute(sql`
        SELECT 
          collection_name,
          COUNT(*) as product_count,
          (SELECT brand FROM products p2 
           WHERE p2.collections @> to_jsonb(collection_name::text)
           AND p2.is_pre_order = ${isPreOrderFilter}
           LIMIT 1) as sample_brand,
          (SELECT image1 FROM products p3 
           WHERE p3.collections @> to_jsonb(collection_name::text)
           AND p3.is_pre_order = ${isPreOrderFilter}
           AND p3.image1 IS NOT NULL AND p3.image1 != ''
           LIMIT 1) as sample_image
        FROM products,
        LATERAL jsonb_array_elements_text(collections) as collection_name
        WHERE is_pre_order = ${isPreOrderFilter}
        AND collections IS NOT NULL
        AND jsonb_array_length(collections) > 0
        GROUP BY collection_name
        ORDER BY collection_name
      `);
      
      const collectionsResult = (collectionStats.rows as any[]).map((row: any) => {
        const name = row.collection_name;
        const settings = settingsMap.get(name);
        
        // Determine collection type: use settings if available, otherwise infer from is_pre_order filter
        // If type filter is 'stock', then isPreOrderFilter is false, so these are stock products
        // If type filter is 'preorder' (or undefined), then isPreOrderFilter is true, so these are pre-order products
        const inferredType = isPreOrderFilter ? 'preorder' : 'stock';
        const collectionType = settings?.collectionType || inferredType;
        
        // Skip collections that don't match the requested type in settings (only if settings exist)
        // If no settings exist, use the inferred type from the query filter
        if (type && settings && settings.collectionType !== type) {
          return null;
        }
        
        // Also filter by inferred type if no settings exist and type is specified
        if (type && !settings && inferredType !== type) {
          return null;
        }
        
        // Get brand name from brand ID
        let brandName = "Unknown Brand";
        if (row.sample_brand) {
          const brand = brands.find((b: any) => b.id === row.sample_brand || b.name === row.sample_brand);
          if (brand) {
            brandName = brand.name;
          } else {
            // Try to extract from collection name if brand lookup fails
            const nameParts = name.split('-');
            if (nameParts.length > 0) {
              brandName = nameParts[0].trim();
            }
          }
        }
        
        return {
          id: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
          name: name,
          brandName: brandName,
          imageUrl: row.sample_image || null,
          productCount: parseInt(row.product_count) || 0,
          isActive: settings ? settings.isActive : true,
          collectionType: collectionType,
          createdAt: new Date().toISOString()
        };
      }).filter(Boolean);
      
      res.json(collectionsResult);
    } catch (error) {
      console.error("Error fetching collections:", error);
      res.status(500).json({ message: "Failed to fetch collections" });
    }
  });

  // Toggle pre-order collection active status
  app.post("/api/preorder/collections/:name/toggle", async (req, res) => {
    try {
      const collectionName = decodeURIComponent(req.params.name);
      
      // Check if setting exists in database
      const existing = await db.select().from(preorderCollectionSettings)
        .where(eq(preorderCollectionSettings.collectionName, collectionName));
      
      let isActive: boolean;
      if (existing.length > 0) {
        // Toggle the existing setting
        isActive = !existing[0].isActive;
        await db.update(preorderCollectionSettings)
          .set({ isActive, updatedAt: new Date().toISOString() })
          .where(eq(preorderCollectionSettings.collectionName, collectionName));
      } else {
        // Create new setting (default is active, so toggle to inactive)
        isActive = false;
        await db.insert(preorderCollectionSettings).values({
          collectionName,
          isActive,
          updatedAt: new Date().toISOString()
        });
      }
      
      res.json({ name: collectionName, isActive });
    } catch (error) {
      console.error("Error toggling collection status:", error);
      res.status(500).json({ message: "Failed to toggle collection status" });
    }
  });

  // Get list of inactive pre-order collections (for filtering)
  app.get("/api/preorder/collections/inactive", async (req, res) => {
    const inactiveCollections = await getInactivePreorderCollections();
    res.json(Array.from(inactiveCollections));
  });

  // Delete a collection - removes collection assignment from products, does NOT delete products
  // Products remain visible in All Products page after collection deletion
  app.delete("/api/preorder/collections/:name", async (req, res) => {
    try {
      const collectionName = decodeURIComponent(req.params.name);
      
      console.log(`🗑️ Delete collection request: "${collectionName}"`);
      
      // Remove collection from products' collections array (keep products, just unassign).
      // IMPORTANT: Do not force isPreOrder=false for products that still belong to other collections,
      // otherwise deleting one collection can make other shared collections appear empty.
      const updateResult = await db.execute(sql`
        UPDATE products 
        SET 
          collections = collections - ${collectionName},
          is_pre_order = CASE
            WHEN jsonb_array_length(collections - ${collectionName}) = 0 THEN false
            ELSE is_pre_order
          END
        WHERE collections @> ${JSON.stringify([collectionName])}::jsonb
      `);
      
      const updatedCount = updateResult.rowCount || 0;
      console.log(`🗑️ Removed collection "${collectionName}" from ${updatedCount} products (products preserved)`);
      
      // Remove collection settings from database
      await db.delete(preorderCollectionSettings)
        .where(eq(preorderCollectionSettings.collectionName, collectionName));
      
      res.json({ 
        message: `Removed collection "${collectionName}" from ${updatedCount} products. Products preserved in All Products.`,
        updatedCount 
      });
    } catch (error) {
      console.error("Error deleting collection:", error);
      res.status(500).json({ message: "Failed to delete collection" });
    }
  });

  // Get products for a specific collection (by collection name)
  // Works for both pre-order and stock collections
  app.get("/api/preorder/collections/:name/products", async (req, res) => {
    try {
      const collectionName = decodeURIComponent(req.params.name);
      
      // Use efficient SQL query with JSONB containment operator
      // This avoids loading all 138k+ products
      const collectionProducts = await db.execute(sql`
        SELECT * FROM products 
        WHERE collections @> ${JSON.stringify([collectionName])}::jsonb
        ORDER BY name
        LIMIT 5000
      `);
      
      // Map snake_case columns to camelCase for frontend compatibility
      const mappedProducts = (collectionProducts.rows as any[]).map((row: any) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        category: row.category,
        brand: row.brand,
        gender: row.gender,
        description: row.description,
        wholesalePrice: row.wholesale_price,
        retailPrice: row.retail_price,
        image1: row.image_url || row.image1,
        imageUrl: row.image_url,
        colors: row.colors,
        availableSizes: row.available_sizes,
        inStock: row.in_stock,
        stockLevel: row.stock_level,
        collections: row.collections,
        stockMatrix: row.stock_matrix,
        barcode: row.barcode,
        upc: row.upc,
        division: row.division,
        minOrder: row.min_order,
        countryOfOrigin: row.country_of_origin,
        isPreOrder: row.is_pre_order,
        imageUrls: row.image_urls,
        keyCategory: row.key_category,
        colourway: row.colourway,
        ageGroup: row.age_group,
        corporateMarketingLine: row.corporate_marketing_line,
        productLine: row.product_line,
        productType: row.product_type,
        sportsCategory: row.sports_category,
        moq: row.moq,
        conditions: row.conditions,
        materialComposition: row.material_composition,
        discount: row.discount,
        rawAttributes: row.raw_attributes,
        mainCategory: row.main_category,
        kidsGender: row.kids_gender,
        kidsAgeGroup: row.kids_age_group,
        unitsPerCarton: row.units_per_carton,
        currency: row.currency
      }));
      
      res.json(mappedProducts);
    } catch (error) {
      console.error("Error fetching collection products:", error);
      res.status(500).json({ message: "Failed to fetch collection products" });
    }
  });

  // ============================================
  // ASYNC UPLOAD ENDPOINTS (Background Processing)
  // ============================================

  // Helper function to normalize Excel cell values to strings
  const normalizeCellValue = (cell: any): any => {
    if (cell === null || cell === undefined) return '';
    if (cell instanceof Date) {
      return cell.toISOString().split('T')[0];
    }
    if (typeof cell === 'object') {
      if (cell.text !== undefined) return String(cell.text);
      if (cell.hyperlink !== undefined) return String(cell.hyperlink);
      if (cell.result !== undefined) return String(cell.result);
      if (cell.richText !== undefined) {
        return cell.richText.map((r: any) => r.text || '').join('');
      }
      if (cell.getTime && typeof cell.getTime === 'function') {
        return new Date(cell).toISOString().split('T')[0];
      }
      try {
        return JSON.stringify(cell);
      } catch {
        return String(cell);
      }
    }
    return cell;
  };

  // Set up background job processor
  jobManager.setProcessCallback(async (job: UploadJob) => {
    try {
      const filePath = job.filePath!;
      const fileName = job.fileName!;
      const fileExt = job.fileExt!;
      
      let rawRows: any[][] = [];
      let totalRowCount = 0;
      let detectedImageCount = 0;
      const PREVIEW_LIMIT = 50;
      
      console.log(`🔄 Processing job ${job.id}: ${fileName}`);
      
      jobManager.updateProgress(job.id, {
        stage: 'extracting',
        percent: 5,
        message: 'Reading Excel file...'
      });

      if (fileExt === '.csv') {
        jobManager.updateProgress(job.id, { stage: 'extracting', percent: 10, message: 'Reading CSV file...' });
        const csvResult = await streamCsvPreview(filePath, PREVIEW_LIMIT);
        totalRowCount = csvResult.totalRows;
        rawRows = csvResult.rows;
        jobManager.updateProgress(job.id, { stage: 'extracting', percent: 90, message: `Found ${totalRowCount.toLocaleString()} rows` });
      } else if (fileExt === '.xlsx' || fileExt === '.xls') {
        console.log(`📊 Using streaming Excel parser for memory efficiency...`);
        
        const previewResult = await streamExcelPreview(filePath, PREVIEW_LIMIT, (rowsRead, percent, message) => {
          jobManager.updateProgress(job.id, {
            stage: 'extracting',
            percent,
            message
          });
        });
        rawRows = previewResult.rows;
        totalRowCount = previewResult.totalRows;
        detectedImageCount = previewResult.imageCount;
        
        console.log(`📊 Excel: ${totalRowCount} rows, preview: ${rawRows.length} rows, images: ${detectedImageCount}`);
        
        jobManager.updateProgress(job.id, {
          stage: 'extracting',
          percent: 92,
          message: `Found ${totalRowCount.toLocaleString()} rows. Detecting images...`
        });

        if (detectedImageCount > 0) {
          const headerRow = rawRows[0] || [];
          let imageColIndex = headerRow.findIndex((h: any) => h && String(h).toLowerCase().includes('image'));
          if (imageColIndex === -1) {
            imageColIndex = headerRow.length;
            if (rawRows[0]) rawRows[0] = [...rawRows[0], 'Images'];
          }
          console.log(`📸 Job ${job.id}: Detected ${detectedImageCount} embedded images (deferred upload)`);
        }
      }

      jobManager.updateProgress(job.id, {
        stage: 'building-preview',
        percent: 95,
        message: 'Saving preview data...'
      });

      const tempDataId = `preorder_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const uploadDir = path.join(process.cwd(), 'uploads/temp');
      await fsp.mkdir(uploadDir, { recursive: true });
      
      const metadataPath = path.join(uploadDir, `${tempDataId}_meta.json`);
      const metadata = {
        originalFilePath: filePath,
        fileName,
        fileExt,
        totalRowCount: totalRowCount || rawRows.length,
        imageCount: detectedImageCount,
        createdAt: new Date().toISOString()
      };
      await fsp.writeFile(metadataPath, JSON.stringify(metadata), 'utf-8');
      
      const tempDataPath = path.join(uploadDir, `${tempDataId}_raw.json`);
      let rawJson: string;
      try {
        rawJson = JSON.stringify(rawRows);
      } catch (stringifyErr) {
        console.error('JSON.stringify failed, using simplified serialization:', stringifyErr);
        rawJson = JSON.stringify(rawRows.map(row => row.map(cell => {
          if (cell === null || cell === undefined) return '';
          if (typeof cell === 'object' && cell !== null) return String(cell);
          return cell;
        })));
      }
      await fsp.writeFile(tempDataPath, rawJson, 'utf-8');
      
      console.log(`✅ Job ${job.id} completing: tempDataId=${tempDataId}, rows=${totalRowCount || rawRows.length}, detectedImages=${detectedImageCount}`);

      jobManager.completeJob(job.id, {
        totalRows: totalRowCount || rawRows.length,
        rawRows: rawRows.slice(0, 20),
        imageColumnInfo: detectedImageCount > 0 ? { imageCount: detectedImageCount } : undefined
      }, tempDataId);
      
      console.log(`🎉 Job ${job.id} marked complete`);

    } catch (error: unknown) {
      console.error(`❌ Job ${job.id} failed:`, error);
      const message = error instanceof Error ? error.message : String(error ?? 'Unknown error during processing');
      jobManager.failJob(job.id, message);
    }
  });

  // Start async upload - returns job ID immediately
  app.post("/api/preorder/upload/start", uploadPreorder.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const filePath = req.file.path;
      const fileName = req.file.originalname;
      const fileExt = path.extname(fileName).toLowerCase();
      
      if (!['.csv', '.xlsx', '.xls'].includes(fileExt)) {
        return res.status(400).json({ message: "Unsupported file type. Please upload CSV or Excel file." });
      }
      
      console.log(`📦 Pre-Order Async Upload: Starting job for ${fileName} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
      
      const jobId = jobManager.createJob(filePath, fileName, fileExt);
      
      res.json({ jobId, message: "Upload started. Processing in background." });
    } catch (error) {
      console.error("Error starting upload job:", error);
      res.status(500).json({ message: "Failed to start upload" });
    }
  });

  // Get job status for polling
  app.get("/api/preorder/jobs/:id", async (req, res) => {
    try {
      const job = jobManager.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      const progress = job.progress || {};
      const elapsed = Date.now() - (progress.startedAt || job.createdAt || Date.now());
      const payload = {
        id: job.id,
        status: job.status,
        progress: {
          stage: progress.stage,
          percent: progress.percent,
          message: progress.message,
          productsProcessed: progress.productsProcessed,
          totalProducts: progress.totalProducts,
          productsCreated: progress.productsCreated,
          productsUpdated: progress.productsUpdated,
          startedAt: progress.startedAt,
          completedAt: progress.completedAt,
        },
        elapsed,
        tempDataId: job.tempDataId,
        result: job.status === 'completed' ? job.result : undefined,
        processingResult: job.status === 'completed' ? job.processingResult : undefined,
        error: job.error
      };
      res.json(payload);
    } catch (error) {
      console.error("Error fetching job status:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to get job status" });
      }
    }
  });

  // List all recent jobs
  app.get("/api/preorder/jobs", async (req, res) => {
    try {
      const jobs = jobManager.getAllJobs().slice(0, 10);
      res.json(jobs.map(job => ({
        id: job.id,
        status: job.status,
        fileName: job.fileName,
        progress: job.progress,
        createdAt: job.createdAt
      })));
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ message: "Failed to get jobs" });
    }
  });

  // Pre-Order Collection Upload - Preview file (raw data with row selection)
  // Uses uploadPreorder to support large files (up to 500MB)
  // Streams data for efficiency - only loads first N rows for preview
  app.post("/api/preorder/upload/preview", uploadPreorder.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const filePath = req.file.path;
      const fileName = req.file.originalname;
      const fileExt = path.extname(fileName).toLowerCase();
      let rawRows: any[][] = [];
      let totalRowCount = 0;
      let imageColumnInfo: { columnIndex: number; columnName: string; imageCount: number } | undefined;
      const PREVIEW_LIMIT = 50; // Only load first 50 rows for preview to save memory
      
      console.log(`📦 Pre-Order Upload: Processing ${fileName} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
      
      if (fileExt === '.csv') {
        const csvResult = await streamCsvPreview(filePath, PREVIEW_LIMIT);
        totalRowCount = csvResult.totalRows;
        rawRows = csvResult.rows;
        console.log(`📊 CSV: ${totalRowCount} total rows, showing ${rawRows.length} for preview (streaming)`);
      } else if (fileExt === '.xlsx' || fileExt === '.xls') {
        const excelResult = await streamExcelPreview(filePath, PREVIEW_LIMIT);
        totalRowCount = excelResult.totalRows;
        rawRows = excelResult.rows;
        if (excelResult.imageCount >= 0) {
          // Small file: we got image count from streaming path (not supported, use -1)
        }
        console.log(`📊 Excel: ${totalRowCount} total rows, showing ${rawRows.length} for preview (streaming)`);
        // Detect Images column by name (streaming cannot count embedded images without full load)
        if (rawRows.length > 0) {
          const headerRow = rawRows[0] || [];
          const imageColIndex = headerRow.findIndex((h: any) =>
            h && String(h).toLowerCase().includes('image')
          );
          if (imageColIndex >= 0) {
            imageColumnInfo = {
              columnIndex: imageColIndex,
              columnName: String(headerRow[imageColIndex] || 'Images'),
              imageCount: excelResult.imageCount >= 0 ? excelResult.imageCount : -1
            };
          }
        }
      } else {
        return res.status(400).json({ message: "Unsupported file type. Please upload CSV or Excel file." });
      }
      
      if (rawRows.length === 0 && totalRowCount === 0) {
        return res.status(400).json({ message: "File is empty or invalid" });
      }
      
      // Generate unique session ID
      const tempDataId = `preorder_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const uploadDir = path.join(process.cwd(), 'uploads/temp');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Save file metadata for later streaming (instead of loading all data)
      const metadataPath = path.join(uploadDir, `${tempDataId}_meta.json`);
      const metadata = {
        originalFilePath: filePath,
        fileName,
        fileExt,
        totalRowCount: totalRowCount || rawRows.length,
        createdAt: new Date().toISOString()
      };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata));
      
      // Also save preview rows for quick access
      const tempDataPath = path.join(uploadDir, `${tempDataId}_raw.json`);
      fs.writeFileSync(tempDataPath, JSON.stringify(rawRows));
      
      console.log(`✅ Pre-Order Upload: Saved metadata for ${totalRowCount || rawRows.length} rows, file kept at ${filePath}`);
      
      res.json({
        totalRows: totalRowCount || rawRows.length,
        rawRows: rawRows.slice(0, 20), // Show first 20 rows for preview
        fileName,
        tempDataId,
        imageColumnInfo
      });
    } catch (error) {
      console.error("Error previewing file:", error);
      res.status(500).json({ message: "Failed to preview file" });
    }
  });

  // Pre-Order Collection Upload - Set header row and get parsed data
  // Supports streaming from original file for large datasets
  app.post("/api/preorder/upload/set-header", async (req, res) => {
    try {
      const { tempDataId, headerRowIndex } = req.body;
      
      if (!tempDataId || headerRowIndex === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      const uploadDir = path.join(process.cwd(), 'uploads/temp');
      const metadataPath = path.join(uploadDir, `${tempDataId}_meta.json`);
      const tempDataPath = path.join(uploadDir, `${tempDataId}_raw.json`);
      
      // Check if we have metadata for streaming
      let rawRows: any[][] = [];
      let totalRowCount = 0;
      
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        const { originalFilePath, fileExt, totalRowCount: storedCount } = metadata;
        totalRowCount = storedCount;

        if (!fs.existsSync(originalFilePath)) {
          return res.status(400).json({ message: "Original file not found. Please upload again." });
        }

        console.log(`📖 Set-Header: Streaming from original file (${totalRowCount} total rows)`);

        const parsedDataPath = path.join(uploadDir, `${tempDataId}.ndjson`);
        const writeStream = fs.createWriteStream(parsedDataPath);

        const CHUNK_SIZE = 1000;
        const stream = fileExt === '.csv'
          ? streamCsvRowsChunked(originalFilePath, headerRowIndex, CHUNK_SIZE)
          : streamExcelRowsChunked(originalFilePath, headerRowIndex, CHUNK_SIZE);

        let rowCount = 0;
        let headers: string[] = [];
        const rawPreviewAccum: any[][] = [];
        const previewAccum: any[] = [];

        for await (const chunk of stream) {
          for (const row of chunk.rows) {
            if (rowCount === 0 && chunk.chunkIndex === 0) {
              headers = Object.keys(row).filter((k) => !k.startsWith('_'));
            }
            writeStream.write(JSON.stringify(row) + '\n');
            rowCount++;

            if (rawPreviewAccum.length < 20) {
              rawPreviewAccum.push(headers.map((h) => row[h] ?? ''));
            }
            if (previewAccum.length < 10 && Object.keys(row).some((k) => !k.startsWith('_') && row[k])) {
              previewAccum.push(row);
            }
          }
        }

        writeStream.end();
        await new Promise((resolve) => writeStream.on('finish', resolve));

        const columns = headers.filter((h: any) => h).map((h: any) => String(h));
        const rawPreviewRows = [headers, ...rawPreviewAccum].slice(0, 20);
        return res.json({
          totalRows: rowCount,
          previewRows: previewAccum,
          columns,
          tempDataId,
          rawPreviewRows
        });
      } else if (fs.existsSync(tempDataPath)) {
        // Fallback to preview data (smaller files - no metadata/originalFilePath)
        rawRows = JSON.parse(fs.readFileSync(tempDataPath, 'utf-8'));
        totalRowCount = rawRows.length;
      } else {
        return res.status(400).json({ message: "Upload session expired. Please upload again." });
      }

      if (headerRowIndex >= rawRows.length) {
        return res.status(400).json({ message: "Invalid header row index" });
      }

      const headers = rawRows[headerRowIndex];
      const dataRows = rawRows.slice(headerRowIndex + 1);
      const rows = dataRows.map((row: any[]) => {
        const obj: any = {};
        headers.forEach((header: any, index: number) => {
          if (header) obj[String(header)] = row[index];
        });
        return obj;
      }).filter((row: any) => Object.keys(row).length > 0);

      const parsedDataPath = path.join(uploadDir, `${tempDataId}.json`);
      fs.writeFileSync(parsedDataPath, JSON.stringify(rows));

      const columns = headers.filter((h: any) => h).map((h: any) => String(h));
      res.json({
        totalRows: rows.length,
        previewRows: rows.slice(0, 10),
        columns,
        tempDataId,
        rawPreviewRows: rawRows.slice(0, 20)
      });
    } catch (error) {
      console.error("Error setting header row:", error);
      res.status(500).json({ message: "Failed to process header row" });
    }
  });

  // Pre-Order Collection Upload - Analyze UPC status (new vs existing)
  // Uses streaming for NDJSON files to avoid OOM on large datasets
  app.post("/api/preorder/analyze", async (req, res) => {
    try {
      const { tempDataId, mapping, brandId } = req.body;

      if (!tempDataId || !mapping || !mapping.sku) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const uploadDir = path.join(process.cwd(), 'uploads/temp');
      const ndjsonPath = path.join(uploadDir, `${tempDataId}.ndjson`);
      const tempDataPath = path.join(uploadDir, `${tempDataId}.json`);

      const useStreaming = fs.existsSync(ndjsonPath);

      if (useStreaming) {
        // Stream-based analyze for large files (NDJSON from set-header)
        const UPC_BATCH = 2000;
        let upcBatch: string[] = [];
        const productMap = new Map<string, { id: number; name: string }>();

        async function fetchExistingBatch(upcs: string[]) {
          if (upcs.length === 0) return;
          const existing = await db.select().from(products)
            .where(sql`${products.sku} IN ${sql.raw(`(${upcs.map((s) => `'${String(s).replace(/'/g, "''")}'`).join(',')})`)}`);
          for (const p of existing) {
            productMap.set(p.sku, { id: p.id, name: p.name || '' });
          }
        }

        for await (const row of readNdjsonStream(ndjsonPath)) {
          const upc = row[mapping.sku]?.toString().trim();
          if (upc) {
            upcBatch.push(upc);
            if (upcBatch.length >= UPC_BATCH) {
              await fetchExistingBatch(upcBatch);
              upcBatch = [];
            }
          }
        }
        await fetchExistingBatch(upcBatch);

        const hasAgeGroupColumn = mapping.ageGroup && mapping.ageGroup !== 'none';
        const genderMap = new Map<string, string>();
        const compositeMap = new Map<string, string>();
        const divisionMap = new Map<string, string>();
        const divisionColumnName = mapping.division || null;

        const analyzedDataPath = path.join(uploadDir, `${tempDataId}_analyzed.ndjson`);
        const analyzedWrite = fs.createWriteStream(analyzedDataPath);
        const previewRows: any[] = [];
        let rowCount = 0;
        let newCount = 0;
        let existingCount = 0;

        for await (const row of readNdjsonStream(ndjsonPath)) {
          const upc = row[mapping.sku]?.toString().trim() || '';
          const existingProduct = upc ? productMap.get(upc) : undefined;
          const isNew = !existingProduct;
          if (isNew) newCount++; else existingCount++;
          rowCount++;

          const analyzedRow = {
            ...row,
            _upc: upc,
            _isNew: isNew,
            _existingProductId: existingProduct?.id ?? null,
            _existingProductName: existingProduct?.name ?? null,
          };
          analyzedWrite.write(JSON.stringify(analyzedRow) + '\n');

          if (mapping.gender && mapping.gender !== 'none') {
            const genderKey = Object.keys(row).find(k => !k.startsWith('_') && String(k).trim().toLowerCase() === String(mapping.gender).trim().toLowerCase()) || mapping.gender;
            const ageKey = hasAgeGroupColumn ? (Object.keys(row).find(k => !k.startsWith('_') && String(k).trim().toLowerCase() === String(mapping.ageGroup).trim().toLowerCase()) || mapping.ageGroup) : null;
            const rawGender = (row[genderKey] ?? row[mapping.gender])?.toString();
            const rawAgeGroup = hasAgeGroupColumn && ageKey ? row[ageKey]?.toString() : null;
            if (hasAgeGroupColumn) {
              const compositeKey = buildCategoryLookupKey(rawGender, rawAgeGroup);
              if (compositeKey && !compositeMap.has(compositeKey.toLowerCase())) {
                compositeMap.set(compositeKey.toLowerCase(), compositeKey);
              }
            } else if (rawGender) {
              const n = String(rawGender).trim().toLowerCase();
              if (n && !genderMap.has(n)) genderMap.set(n, String(rawGender).trim());
            }
          }
          if (divisionColumnName && divisionColumnName !== 'none') {
            const divKey = Object.keys(row).find(k => !k.startsWith('_') && String(k).trim().toLowerCase() === String(divisionColumnName).trim().toLowerCase()) || divisionColumnName;
            const rawDivision = row[divKey]?.toString().trim();
            if (rawDivision && !divisionMap.has(rawDivision.toLowerCase())) {
              divisionMap.set(rawDivision.toLowerCase(), rawDivision);
            }
          }
          if (previewRows.length < 100) previewRows.push(analyzedRow);
        }

        analyzedWrite.end();
        await new Promise((r) => analyzedWrite.on('finish', r));

        const detectedGenders = hasAgeGroupColumn ? Array.from(compositeMap.values()).sort() : Array.from(genderMap.values()).sort();
        const detectedDivisions = divisionColumnName ? Array.from(divisionMap.values()).sort() : [];

        const metadataPath = path.join(uploadDir, `${tempDataId}_meta.json`);
        try {
          let metadata: any = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) : {};
          metadata.detectedGenders = detectedGenders;
          metadata.hasAgeGroupColumn = hasAgeGroupColumn;
          fs.writeFileSync(metadataPath, JSON.stringify(metadata));
        } catch (e) {
          console.error('Failed to save detected genders to metadata:', e);
        }

        console.log(`📊 Analyze (streaming): ${rowCount} rows, ${newCount} new, ${existingCount} existing`);
        return res.json({
          totalRows: rowCount,
          newProducts: newCount,
          existingProducts: existingCount,
          analyzedRows: previewRows.slice(0, 100),
          previewRows: previewRows.slice(0, 10),
          isLargeFile: true,
          serverSideData: true,
          detectedGenders,
          detectedDivisions
        });
      }

      // Fallback: JSON array (small files)
      if (!fs.existsSync(tempDataPath)) {
        return res.status(400).json({ message: "Upload session expired. Please upload again." });
      }

      const rows = JSON.parse(fs.readFileSync(tempDataPath, 'utf-8'));
      console.log(`📊 Analyze: Processing ${rows.length} rows from temp data`);

      const upcsInFile: string[] = Array.from(new Set(rows.map((r: any) => r[mapping.sku]?.toString().trim()).filter(Boolean))) as string[];
      const existingProducts = upcsInFile.length > 0
        ? await db.select().from(products).where(sql`${products.sku} IN ${sql.raw(`(${upcsInFile.map((s) => `'${String(s).replace(/'/g, "''")}'`).join(',')})`)}`)
        : [];
      const existingUPCs = new Set(existingProducts.map((p: any) => p.sku));
      const productById = new Map(existingProducts.map((p: any) => [p.sku, p]));

      const analyzedRows = rows.map((row: any) => {
        const upc = row[mapping.sku]?.toString().trim() || '';
        const existingProduct = productById.get(upc);
        return {
          ...row,
          _upc: upc,
          _isNew: !existingUPCs.has(upc),
          _existingProductId: existingProduct?.id ?? null,
          _existingProductName: existingProduct?.name ?? null,
        };
      });

      const newCount = analyzedRows.filter((r: any) => r._isNew).length;
      const existingCount = analyzedRows.filter((r: any) => !r._isNew).length;
      const hasAgeGroupColumn = mapping.ageGroup && mapping.ageGroup !== 'none';
      let detectedGenders: string[] = [];
      let detectedDivisions: string[] = [];

      if (mapping.gender && mapping.gender !== 'none') {
        const genderKey = resolveColumnKey(rows[0] || {}, mapping.gender) || mapping.gender;
        const ageKey = hasAgeGroupColumn ? (resolveColumnKey(rows[0] || {}, mapping.ageGroup) || mapping.ageGroup) : null;
        if (hasAgeGroupColumn) {
          const compositeMap = new Map<string, string>();
          for (const row of rows) {
            const rawGender = row[genderKey]?.toString();
            const rawAgeGroup = ageKey ? row[ageKey]?.toString() : null;
            const compositeKey = buildCategoryLookupKey(rawGender, rawAgeGroup);
            if (compositeKey && !compositeMap.has(compositeKey.toLowerCase())) {
              compositeMap.set(compositeKey.toLowerCase(), compositeKey);
            }
          }
          detectedGenders = Array.from(compositeMap.values()).sort();
        } else {
          const genderMap = new Map<string, string>();
          for (const row of rows) {
            const raw = row[genderKey]?.toString().trim();
            if (raw && !genderMap.has(raw.toLowerCase())) genderMap.set(raw.toLowerCase(), raw);
          }
          detectedGenders = Array.from(genderMap.values()).sort();
        }
        const metadataPath = path.join(uploadDir, `${tempDataId}_meta.json`);
        try {
          let metadata: any = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) : {};
          metadata.detectedGenders = detectedGenders;
          metadata.hasAgeGroupColumn = hasAgeGroupColumn;
          fs.writeFileSync(metadataPath, JSON.stringify(metadata));
        } catch (e) {
          console.error('Failed to save detected genders to metadata:', e);
        }
      }
      if (mapping.division && mapping.division !== 'none') {
        const divKey = resolveColumnKey(rows[0] || {}, mapping.division) || mapping.division;
        const divisionMap = new Map<string, string>();
        for (const row of rows) {
          const raw = row[divKey]?.toString().trim();
          if (raw && !divisionMap.has(raw.toLowerCase())) divisionMap.set(raw.toLowerCase(), raw);
        }
        detectedDivisions = Array.from(divisionMap.values()).sort();
      }

      const isLargeFile = analyzedRows.length > 500;
      if (isLargeFile) {
        const analyzedDataPath = path.join(uploadDir, `${tempDataId}_analyzed.json`);
        fs.writeFileSync(analyzedDataPath, JSON.stringify(analyzedRows));
        return res.json({
          totalRows: analyzedRows.length,
          newProducts: newCount,
          existingProducts: existingCount,
          analyzedRows: analyzedRows.slice(0, 100),
          previewRows: analyzedRows.slice(0, 10),
          isLargeFile: true,
          serverSideData: true,
          detectedGenders,
          detectedDivisions
        });
      }

      return res.json({
        totalRows: analyzedRows.length,
        newProducts: newCount,
        existingProducts: existingCount,
        analyzedRows,
        previewRows: analyzedRows.slice(0, 10),
        isLargeFile: false,
        serverSideData: false,
        detectedGenders,
        detectedDivisions
      });
    } catch (error) {
      console.error("Error analyzing UPCs:", error);
      res.status(500).json({ message: "Failed to analyze UPCs" });
    }
  });

  // Pre-Order Carton Config - Parse Excel file with sizes and quantities per gender
  app.post("/api/preorder/parse-carton-config", uploadPreorder.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const filePath = req.file.path;
      const fileExt = path.extname(req.file.originalname).toLowerCase();
      
      let rows: any[][] = [];
      
      // Parse the file
      if (fileExt === '.csv') {
        const { parse } = await import('csv-parse/sync');
        const csvText = fs.readFileSync(filePath, 'utf-8');
        rows = parse(csvText, {
          columns: false,
          skip_empty_lines: true,
          trim: true
        });
      } else if (fileExt === '.xlsx' || fileExt === '.xls') {
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const firstSheet = workbook.worksheets[0];
        
        if (firstSheet) {
          firstSheet.eachRow({ includeEmpty: false }, (row) => {
            const rowValues = row.values as any[];
            const normalizedRow = rowValues.slice(1).map(cell => {
              if (cell === null || cell === undefined) return '';
              if (typeof cell === 'object' && cell.text) return cell.text;
              if (typeof cell === 'object' && cell.result !== undefined) return cell.result;
              return String(cell);
            });
            rows.push(normalizedRow);
          });
        }
      } else {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: "Unsupported file format. Use .xlsx, .xls, or .csv" });
      }
      
      // Clean up the temp file
      fs.unlinkSync(filePath);
      
      if (rows.length < 2) {
        return res.status(400).json({ message: "File must have at least 2 rows" });
      }
      
      console.log(`📦 Carton config parsing - ${rows.length} rows found`);
      
      // Detect format: Horizontal (sizes in columns) vs Vertical (Gender, Size, Units columns)
      const firstRowLabel = String(rows[0][0] || '').toLowerCase().trim();
      const isHorizontalFormat = firstRowLabel === 'size' || 
        rows.some(row => String(row[0] || '').toLowerCase().includes('units'));
      
      const genderConfigs: Record<string, { sizes: string[], unitsPerSize: Record<string, number> }> = {};
      
      if (isHorizontalFormat) {
        // HORIZONTAL FORMAT: 
        // Row pattern: "Size" row defines sizes, then one or more gender rows have quantities
        // Multiple genders can share the same size row
        // Gender labels can be "MEN Units", "WOMEN", "BOYS-J", etc (with or without "Units" suffix)
        // Example:
        //   Size      | 40 | 41 | 42 | 43
        //   MEN Units | 1  | 2  | 2  | 3
        //   Size      | 28 | 29 | 30 | 31
        //   GIRLS-L   | 1  | 2  | 2  | 3
        //   BOYS-L    | 1  | 2  | 2  | 3   <- shares sizes with GIRLS-L
        
        console.log(`📦 Detected HORIZONTAL format (sizes in columns)`);
        
        let currentSizes: string[] = [];
        
        for (const row of rows) {
          const label = String(row[0] || '').trim();
          const labelLower = label.toLowerCase();
          
          // Check if this is a size header row (case-insensitive)
          if (labelLower === 'size') {
            // This row defines sizes - extract from columns 1+
            currentSizes = row.slice(1)
              .map((cell: any) => String(cell || '').trim())
              .filter((s: string) => s !== '');
            console.log(`  Size row found: ${currentSizes.join(', ')}`);
          } else if (label && currentSizes.length > 0) {
            // Any non-empty row after a Size row is treated as a gender row
            // Check if it has numeric values (to distinguish from other header rows)
            const values = row.slice(1);
            const hasNumericValues = values.some((cell: any) => {
              const val = parseInt(String(cell || '').trim());
              return !isNaN(val) && val > 0;
            });
            
            if (!hasNumericValues) {
              // Skip rows without numeric values (could be another type of header)
              continue;
            }
            
            // Extract gender name by removing common suffixes
            // Handle: "MEN Units", "WOMEN Units", "BOYS-J Units", "GIRLS-L", "BOYS-N"
            const gender = label
              .replace(/[-_]?\s*(units?|qty|quantity|count|pcs|pieces)/i, '')
              .trim() || 'Default';
            
            // Extract units from columns 1+
            const units = values.map((cell: any) => {
              const val = parseInt(String(cell || '0').trim());
              return isNaN(val) ? 0 : val;
            });
            
            genderConfigs[gender] = { sizes: [], unitsPerSize: {} };
            
            // Map sizes to units (don't clear currentSizes - multiple genders can share)
            for (let i = 0; i < currentSizes.length; i++) {
              const size = currentSizes[i];
              const unitCount = units[i] || 0;
              if (size && unitCount > 0) {
                genderConfigs[gender].sizes.push(size);
                genderConfigs[gender].unitsPerSize[size] = unitCount;
              }
            }
            
            console.log(`  Gender "${gender}": ${genderConfigs[gender].sizes.length} sizes with units`);
          }
        }
      } else {
        // VERTICAL FORMAT: Traditional Gender, Size, Units columns
        console.log(`📦 Detected VERTICAL format (Gender, Size, Units columns)`);
        
        const headers = rows[0].map((h: any) => String(h).toLowerCase().trim());
        const dataRows = rows.slice(1);
        
        let genderCol = headers.findIndex((h: string) => h.includes('gender') || h === 'sex');
        let sizeCol = headers.findIndex((h: string) => h.includes('size') || h === 'sz');
        let unitsCol = headers.findIndex((h: string) => 
          h.includes('unit') || h.includes('qty') || h.includes('quantity') || 
          h.includes('count') || h.includes('pcs') || h.includes('pieces')
        );
        
        if (genderCol === -1 && headers.length >= 3) genderCol = 0;
        if (sizeCol === -1 && headers.length >= 3) sizeCol = 1;
        if (unitsCol === -1 && headers.length >= 3) unitsCol = 2;
        
        if (sizeCol === -1 || unitsCol === -1) {
          return res.status(400).json({ 
            message: "Could not detect Size and Units columns" 
          });
        }
        
        for (const row of dataRows) {
          const gender = genderCol >= 0 ? String(row[genderCol] || 'Default').trim() : 'Default';
          const size = String(row[sizeCol] || '').trim();
          const units = parseInt(String(row[unitsCol] || '0').trim()) || 0;
          
          if (!size || units <= 0) continue;
          
          if (!genderConfigs[gender]) {
            genderConfigs[gender] = { sizes: [], unitsPerSize: {} };
          }
          
          if (!genderConfigs[gender].sizes.includes(size)) {
            genderConfigs[gender].sizes.push(size);
          }
          genderConfigs[gender].unitsPerSize[size] = units;
        }
      }
      
      // Sort sizes within each gender (numeric sort)
      for (const gender of Object.keys(genderConfigs)) {
        genderConfigs[gender].sizes.sort((a, b) => {
          const numA = parseFloat(a);
          const numB = parseFloat(b);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.localeCompare(b);
        });
      }
      
      if (Object.keys(genderConfigs).length === 0) {
        return res.status(400).json({ 
          message: "No valid size/units data found. Check file format." 
        });
      }
      
      console.log(`✅ Parsed carton config for ${Object.keys(genderConfigs).length} gender(s):`, 
        Object.entries(genderConfigs).map(([g, c]) => `${g}: ${c.sizes.length} sizes`).join(', '));
      
      res.json({ genderConfigs });
    } catch (error) {
      console.error("Error parsing carton config:", error);
      res.status(500).json({ message: "Failed to parse carton configuration file" });
    }
  });

  // Pre-Order Collection Upload - Start processing job (async with progress tracking)
  app.post("/api/preorder/process-job", async (req, res) => {
    try {
      const { collectionName, totalProducts } = req.body;
      
      if (!collectionName || !totalProducts) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      const jobId = jobManager.createProcessingJob(collectionName, totalProducts);
      console.log(`📋 Created processing job ${jobId} for ${collectionName} with ${totalProducts} products`);
      
      res.json({ jobId });
    } catch (error) {
      console.error("Error creating processing job:", error);
      res.status(500).json({ message: "Failed to create processing job" });
    }
  });

  // Pre-Order Collection Upload - Process and create collection
  // Supports batch processing for large datasets (unlimited products)
  app.post("/api/preorder/process", async (req, res) => {
    try {
      const { tempDataId, mapping, editedRows, collectionName, collectionImage, brandId, baseCurrency, namingPattern, defaultBrand, defaultCategory, defaultGender, imageSource, urlPatternConfig, embeddedImageColumn, sizeChartId, sizeChartMappingType, sizeChartMappingData, genderNormalizationMap, categoryMappings, divisionMappings, jobId, collectionType } = req.body;
      
      console.log("🔍 Pre-order process request:", {
        hasTempDataId: !!tempDataId,
        hasMapping: !!mapping,
        hasCollectionName: !!collectionName,
        collectionName: collectionName || 'EMPTY',
        collectionType: collectionType || '(not provided - will default to preorder)',
        hasBrandId: !!brandId,
        hasNamingPattern: !!namingPattern,
        imageSource: imageSource || 'embedded',
        embeddedImageColumn: embeddedImageColumn || 'Images',
        sizeChartMappingType: sizeChartMappingType || 'uniform',
        hasSizeChartMappingData: !!sizeChartMappingData,
        hasGenderNormalization: !!genderNormalizationMap && Object.keys(genderNormalizationMap).length > 0,
        hasCategoryMappings: !!categoryMappings && Object.keys(categoryMappings).length > 0
      });
      
      // Log gender normalization map if provided
      if (genderNormalizationMap && Object.keys(genderNormalizationMap).length > 0) {
        console.log("👥 Gender normalization map:", genderNormalizationMap);
      }
      
      // Log three-layer category mappings if provided
      if (categoryMappings && Object.keys(categoryMappings).length > 0) {
        console.log("🏷️ Three-layer category mappings:", categoryMappings);
      }
      
      // Log division mappings if provided
      if (divisionMappings && Object.keys(divisionMappings).length > 0) {
        console.log("🏢 Division mappings:", divisionMappings);
      }
      
      if (!tempDataId || !mapping || !collectionName) {
        console.error("❌ Missing required fields:", { tempDataId: !!tempDataId, mapping: !!mapping, collectionName: !!collectionName });
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      if (!mapping.sku) {
        return res.status(400).json({ message: "UPC mapping is required" });
      }
      
      // Validate size chart mapping for non-uniform modes
      const effectiveSizeChartMappingType = sizeChartMappingType || 'uniform';
      if (effectiveSizeChartMappingType !== 'uniform') {
        if (!sizeChartMappingData || !sizeChartMappingData.mappings || sizeChartMappingData.mappings.length === 0) {
          console.error("❌ Size chart mapping data required for non-uniform mode");
          return res.status(400).json({ 
            message: "Size chart mapping required",
            detail: `You selected ${effectiveSizeChartMappingType} size chart mode but no mapping file was uploaded.`
          });
        }
        console.log(`📊 Using ${effectiveSizeChartMappingType} size chart with ${sizeChartMappingData.mappings.length} mappings`);
      }
      
      const effectiveImageSource = imageSource || 'embedded';
      
      // Log image source details for debugging
      console.log(`🖼️ Image Configuration:`, {
        requestedImageSource: imageSource,
        effectiveImageSource,
        hasUrlPatternConfig: !!urlPatternConfig,
        urlPatternConfig: urlPatternConfig || 'not provided',
        mappedImageColumns: {
          image1: mapping.image1 || 'not mapped',
          image2: mapping.image2 || 'not mapped',
          image3: mapping.image3 || 'not mapped',
          image4: mapping.image4 || 'not mapped',
          imageUrl: mapping.imageUrl || 'not mapped (legacy)'
        }
      });
      
      // Set upload directory path
      const uploadDir = path.join(process.cwd(), 'uploads/temp');
      
      // Note: For embedded images, we now support on-the-fly extraction during processing
      // so we don't need to require pre-uploaded images anymore
      
      // Only validate ZIP images since those must be uploaded separately
      if (effectiveImageSource === 'zip') {
        const zipImagesPath = path.join(uploadDir, `${tempDataId}_zip_images.json`);
        if (!fs.existsSync(zipImagesPath)) {
          console.error("❌ Server-side validation failed: ZIP images required but not uploaded");
          return res.status(400).json({ 
            message: "Image upload required",
            detail: "Please upload a ZIP file with images before processing."
          });
        }
      }
      
      // Load rows from server-side storage
      let rows: any[];
      const analyzedDataPathJson = path.join(uploadDir, `${tempDataId}_analyzed.json`);
      const analyzedDataPathNdjson = path.join(uploadDir, `${tempDataId}_analyzed.ndjson`);
      const tempDataPath = path.join(uploadDir, `${tempDataId}.json`);

      const loadAndMergeRows = (loaded: any[]) => {
        if (!editedRows || editedRows.length === 0) return loaded;
        const editedByUpc = new Map<string, any>();
        for (const r of editedRows) {
          const upc = r._upc || r[mapping.sku]?.toString().trim();
          if (upc) editedByUpc.set(upc, r);
        }
        return loaded.map((row: any) => {
          const upc = row._upc || row[mapping.sku]?.toString().trim();
          const ed = editedByUpc.get(upc);
          if (!ed) return row;
          return { ...row, _name: ed._name, _category: ed._category, _gender: ed._gender, _brand: ed._brand, _color: ed._color };
        });
      };

      if (fs.existsSync(analyzedDataPathNdjson)) {
        const loaded: any[] = [];
        for await (const row of readNdjsonStream(analyzedDataPathNdjson)) {
          loaded.push(row);
        }
        rows = loadAndMergeRows(loaded);
        console.log(`📂 Loaded ${rows.length} analyzed rows from NDJSON (streaming)`);
      } else if (fs.existsSync(analyzedDataPathJson)) {
        rows = loadAndMergeRows(JSON.parse(fs.readFileSync(analyzedDataPathJson, 'utf-8')));
        console.log(`📂 Loaded ${rows.length} analyzed rows from server-side storage`);
      } else if (editedRows && editedRows.length > 0) {
        rows = editedRows;
        console.log(`📂 Using ${rows.length} rows from client`);
      } else if (fs.existsSync(tempDataPath)) {
        // Fallback: read from temp data
        rows = JSON.parse(fs.readFileSync(tempDataPath, 'utf-8'));
        console.log(`📂 Loaded ${rows.length} rows from temp data file`);
      } else {
        return res.status(400).json({ message: "Upload session expired. Please upload again." });
      }
      
      // For large files (>1000 rows), process in background to avoid timeout
      const isLargeFile = rows.length > 1000;
      
      // For large files, return immediately and process in background
      const isBackgroundMode = isLargeFile && jobId;
      
      if (isBackgroundMode) {
        console.log(`📦 Large file detected (${rows.length} rows) - returning early, processing in background`);
        
        // Return immediately for large files
        res.json({ 
          message: 'Processing started in background',
          jobId,
          isBackground: true,
          totalRows: rows.length
        });
      }
      
      // Processing logic - runs either synchronously or in background
      const doProcessing = async () => {
      
      console.log(`📦 Pre-Order Process: Starting batch processing of ${rows.length} rows`);
      const startTime = Date.now();
      
      // Load pre-uploaded images from Cloudinary if available
      let preUploadedImages: Map<number, string> = new Map();
      let zipUploadedImages: Map<string, string> = new Map(); // filename -> URL mapping for ZIP images
      
      console.log(`🖼️ Image Source: ${effectiveImageSource}`);
      
      // Check for pre-uploaded embedded images
      const embeddedImagesPath = path.join(uploadDir, `${tempDataId}_images.json`);
      if (effectiveImageSource === 'embedded') {
        console.log(`🖼️ Checking for embedded images at: ${embeddedImagesPath}`);
        if (fs.existsSync(embeddedImagesPath)) {
          try {
            const content = JSON.parse(fs.readFileSync(embeddedImagesPath, 'utf-8'));
            const uploadedImages = Array.isArray(content) ? content : (content.uploaded || []);
            console.log(`🖼️ Found ${uploadedImages.length} entries in embedded images JSON`);
            for (const img of uploadedImages) {
              // Support both old 'row' field and new 'rowIndex' field for backward compatibility
              const rowIdx = img.rowIndex !== undefined ? img.rowIndex : img.row;
              if (rowIdx !== undefined && img.imageUrl) {
                preUploadedImages.set(rowIdx, img.imageUrl);
              }
            }
            console.log(`📸 Loaded ${preUploadedImages.size} pre-uploaded embedded images`);
            // Log first few entries for debugging
            if (preUploadedImages.size > 0) {
              const entries = Array.from(preUploadedImages.entries()).slice(0, 3);
              console.log(`📸 Sample entries: ${entries.map(([k, v]) => `row${k}=${v.substring(0, 50)}...`).join(', ')}`);
            }
          } catch (e) {
            console.log('❌ Could not load pre-uploaded embedded images:', e);
          }
        } else {
          console.log(`⚠️ Embedded images file not found at ${embeddedImagesPath}`);
        }
      }
      
      // On-the-fly embedded image extraction if not pre-uploaded
      if (effectiveImageSource === 'embedded' && preUploadedImages.size === 0) {
        // Find the original Excel file
        const uploadsDir = path.join(process.cwd(), 'uploads/preorder');
        const possibleExcelPaths = [
          path.join(uploadDir, `${tempDataId}.xlsx`),
          path.join(uploadDir, `${tempDataId}_original.xlsx`),
        ];
        
        // Also check for any recently uploaded xlsx file in preorder folder using metadata
        const metadataPath = path.join(uploadDir, `${tempDataId}_meta.json`);
        let metadata: any = {};
        if (fs.existsSync(metadataPath)) {
          try {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
            if (metadata.originalFilePath && fs.existsSync(metadata.originalFilePath)) {
              possibleExcelPaths.unshift(metadata.originalFilePath);
            }
          } catch (e) {}
        }
        
        let excelFilePath: string | null = null;
        for (const p of possibleExcelPaths) {
          if (fs.existsSync(p)) {
            excelFilePath = p;
            break;
          }
        }
        
        if (excelFilePath) {
          console.log(`📸 On-the-fly embedded image extraction from: ${excelFilePath}`);
          try {
            const ExcelJS = await import('exceljs');
            const workbook = new ExcelJS.default.Workbook();
            await workbook.xlsx.readFile(excelFilePath);
            const worksheet = workbook.worksheets[0];
            
            // Get embedded images
            const excelImages = (worksheet as any).getImages?.() || [];
            console.log(`📸 Found ${excelImages.length} embedded images to extract`);
            
            if (excelImages.length > 0) {
              // Get Cloudinary credentials
              const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
              const apiKey = process.env.CLOUDINARY_API_KEY;
              const apiSecret = process.env.CLOUDINARY_API_SECRET;
              
              if (cloudName && apiKey && apiSecret) {
                const cloudinary = (await import('cloudinary')).default;
                cloudinary.v2.config({
                  cloud_name: cloudName,
                  api_key: apiKey,
                  api_secret: apiSecret
                });
                
                // Create temp directory for image extraction
                const tempImgDir = path.join(uploadDir, `temp_images_${tempDataId}`);
                if (!fs.existsSync(tempImgDir)) {
                  fs.mkdirSync(tempImgDir, { recursive: true });
                }
                
                // Get header row index from metadata or default to 0
                const headerRowIndex = metadata.headerRowIndex !== undefined ? metadata.headerRowIndex : 0;
                
                // Process each image
                for (let i = 0; i < excelImages.length; i++) {
                  const image = excelImages[i];
                  const img = workbook.getImage(image.imageId);
                  
                  if (img && img.buffer) {
                    const extension = img.extension || 'png';
                    const range = image.range;
                    let row = 0;
                    
                    if (typeof range === 'object' && 'tl' in range) {
                      row = Math.floor(range.tl.row);
                    }
                    
                    // Adjust row for header
                    const dataRowIndex = row - (headerRowIndex + 1);
                    
                    const tempFilePath = path.join(tempImgDir, `img_${i}.${extension}`);
                    fs.writeFileSync(tempFilePath, Buffer.from(img.buffer));
                    
                    try {
                      const result = await cloudinary.v2.uploader.upload(tempFilePath, {
                        folder: `preorder/${collectionName.replace(/[^a-zA-Z0-9]/g, '_')}`,
                        public_id: `row_${dataRowIndex}_${i}`,
                        resource_type: 'image'
                      });
                      
                      preUploadedImages.set(dataRowIndex, result.secure_url);
                      fs.unlinkSync(tempFilePath);
                    } catch (uploadError) {
                      console.error(`Failed to upload image at row ${row}:`, uploadError);
                    }
                  }
                }
                
                // Clean up temp directory
                if (fs.existsSync(tempImgDir)) {
                  fs.rmdirSync(tempImgDir, { recursive: true });
                }
                
                console.log(`📸 Extracted and uploaded ${preUploadedImages.size} embedded images on-the-fly`);
              } else {
                console.log('⚠️ Cloudinary not configured, skipping embedded image extraction');
              }
            }
          } catch (e) {
            console.error('Error extracting embedded images:', e);
          }
        } else {
          console.log('⚠️ Original Excel file not found for embedded image extraction');
        }
      }
      
      // Check for pre-uploaded ZIP images
      const zipImagesPath = path.join(uploadDir, `${tempDataId}_zip_images.json`);
      if (effectiveImageSource === 'zip') {
        console.log(`🖼️ Checking for ZIP images at: ${zipImagesPath}`);
        if (fs.existsSync(zipImagesPath)) {
          try {
            const uploadedImages = JSON.parse(fs.readFileSync(zipImagesPath, 'utf-8'));
            console.log(`🖼️ Found ${uploadedImages.length} entries in ZIP images JSON`);
            for (const img of uploadedImages) {
              if (img.imageUrl) {
                // Use pre-computed normalized keys if available
                if (img.normalizedKeys && Array.isArray(img.normalizedKeys)) {
                  for (const key of img.normalizedKeys) {
                    zipUploadedImages.set(key, img.imageUrl);
                  }
                } else if (img.filename) {
                  // Fallback: create multiple normalized keys for better matching
                  const fn = img.filename;
                  zipUploadedImages.set(fn.toLowerCase(), img.imageUrl);
                  zipUploadedImages.set(fn.toLowerCase().replace(/[^a-z0-9]/g, ''), img.imageUrl);
                  zipUploadedImages.set(fn.toLowerCase().replace(/[^a-z0-9-]/g, ''), img.imageUrl);
                  zipUploadedImages.set(fn.toLowerCase().replace(/[^a-z0-9_]/g, ''), img.imageUrl);
                }
              }
            }
            console.log(`📸 Loaded ZIP images with ${zipUploadedImages.size} matching keys`);
            // Log first few keys for debugging
            if (zipUploadedImages.size > 0) {
              const sampleKeys = Array.from(zipUploadedImages.keys()).slice(0, 5);
              console.log(`📸 Sample ZIP keys: ${sampleKeys.join(', ')}`);
            }
          } catch (e) {
            console.log('❌ Could not load pre-uploaded ZIP images:', e);
          }
        } else {
          console.log(`⚠️ ZIP images file not found at ${zipImagesPath}`);
        }
      }
      
      // Get all brands for lookup
      const brands = await storage.getBrands();
      
      // Load uniform size chart if provided (for individual mode)
      let uniformSizeChartSizes: string[] = [];
      if (sizeChartMappingType === 'uniform' && sizeChartId) {
        try {
          const [sizeChart] = await db.select().from(sizeCharts).where(eq(sizeCharts.id, sizeChartId));
          if (sizeChart && sizeChart.sizes) {
            uniformSizeChartSizes = sizeChart.sizes;
            console.log(`📏 Loaded uniform size chart "${sizeChart.name}" with sizes: ${uniformSizeChartSizes.join(', ')}`);
          }
        } catch (e) {
          console.log(`⚠️ Could not load size chart ${sizeChartId}:`, e);
        }
      }
      
      const productIds: string[] = [];
      let productsCreated = 0;
      let productsUpdated = 0;
      let productsWithImages = 0;
      let productsWithoutImages = 0;
      let errors: string[] = [];
      
      // Batch processing configuration - OPTIMIZED for large uploads
      const BATCH_SIZE = 200; // Process 200 product groups at a time (increased from 50)
      
      // Helper function to generate product name from naming pattern
      const generateProductName = (row: any, brandName: string) => {
        if (!namingPattern || namingPattern.length === 0) {
          // Fallback: use name from row or Brand-UPC
          return row[mapping.name] || `${brandName}-${row[mapping.sku]}`;
        }
        
        // Build name from pattern tokens
        // Honor edited fields (_field) first, then mapped columns, then defaults
        const parts: string[] = [];
        for (const token of namingPattern) {
          if (token.type === 'field') {
            let value = '';
            switch (token.value) {
              case 'Brand':
                value = brandName;
                break;
              case 'UPC':
                value = row[mapping.sku] || '';
                break;
              case 'Category':
                value = row._category || (mapping.category && row[mapping.category]) || defaultCategory || '';
                break;
              case 'Name':
                value = row._name || (mapping.name && row[mapping.name]) || '';
                break;
              case 'Color':
                value = row._color || (mapping.color && row[mapping.color]) || '';
                break;
              case 'Size':
                value = row._size || (mapping.size && row[mapping.size]) || '';
                break;
              case 'Gender':
                value = row._gender || (mapping.gender && row[mapping.gender]) || defaultGender || '';
                break;
              default:
                value = '';
            }
            if (value) parts.push(value);
          } else if (token.type === 'text') {
            parts.push(token.value);
          }
        }
        return parts.join('');
      };
      
      // Helper function to clean price values - extract numeric portion from strings like "45.5 per piece"
      const cleanPrice = (value: any): string => {
        if (value === null || value === undefined) return '0';
        const str = String(value).trim();
        // Extract the first number (including decimals) from the string
        const match = str.match(/[\d]+\.?[\d]*/);
        return match ? match[0] : '0';
      };
      
      // Group rows by SKU to consolidate multiple size/color variants of the same product
      // Each unique SKU becomes one product in the database
      const productGroups = new Map<string, { row: any; rowIndex: number }[]>();
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        
        // Get SKU for grouping - each unique SKU = one product
        const sku = row._sku || (mapping.sku && row[mapping.sku]) || '';
        
        if (!sku) continue; // Skip rows without SKU
        
        // Use SKU as the grouping key (each SKU = one product)
        const groupKey = sku;
        
        if (!productGroups.has(groupKey)) {
          productGroups.set(groupKey, []);
        }
        productGroups.get(groupKey)!.push({ row, rowIndex });
      }
      
      // Convert product groups to array for batch processing
      const productGroupsArray = Array.from(productGroups.entries());
      const totalGroups = productGroupsArray.length;
      console.log(`📊 Pre-Order Process: ${totalGroups} unique products to process in batches of ${BATCH_SIZE}`);
      
      // Update job's totalProducts with actual consolidated count (fixes progress display mismatch)
      if (jobId) {
        jobManager.updateTotalProducts(jobId, totalGroups);
      }
      
      // BATCH OPTIMIZATION: Fetch all existing products in batches to avoid query size limits
      // PostgreSQL IN clause has practical limits (~1000-10000 items), so we batch the batch-check
      const allSKUs = Array.from(productGroups.keys());
      const EXISTENCE_CHECK_BATCH_SIZE = 5000; // Safe batch size for IN clause
      const existingProductsMap = new Map<string, typeof products.$inferSelect>();
      
      console.log(`🔍 Batch-checking ${allSKUs.length} products for existence (in batches of ${EXISTENCE_CHECK_BATCH_SIZE})...`);
      
      for (let i = 0; i < allSKUs.length; i += EXISTENCE_CHECK_BATCH_SIZE) {
        const skuBatch = allSKUs.slice(i, i + EXISTENCE_CHECK_BATCH_SIZE);
        const batchProducts = await db.select().from(products)
          .where(inArray(products.sku, skuBatch));
        
        for (const product of batchProducts) {
          existingProductsMap.set(product.sku, product);
        }
        
        if ((i + EXISTENCE_CHECK_BATCH_SIZE) % 50000 === 0 || i + EXISTENCE_CHECK_BATCH_SIZE >= allSKUs.length) {
          console.log(`  ✓ Checked ${Math.min(i + EXISTENCE_CHECK_BATCH_SIZE, allSKUs.length)}/${allSKUs.length} SKUs, found ${existingProductsMap.size} existing`);
        }
      }
      
      console.log(`✅ Batch check complete: Found ${existingProductsMap.size} existing products out of ${allSKUs.length} SKUs`);
      
      // Process in batches for better performance and memory management
      for (let batchStart = 0; batchStart < totalGroups; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, totalGroups);
        const batch = productGroupsArray.slice(batchStart, batchEnd);
        const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(totalGroups / BATCH_SIZE);
        
        // Track batch-specific counts
        const batchStartCreated = productsCreated;
        const batchStartUpdated = productsUpdated;
        const batchStartErrors = errors.length;
        
        console.log(`⚙️ Processing batch ${batchNumber}/${totalBatches} (products ${batchStart + 1}-${batchEnd} of ${totalGroups})`);
        
        // BATCH OPTIMIZATION: Collect products to create/update, then execute in batches
        const productsToCreate: Array<{
          productData: any;
          sku: string;
          productIds: string[];
        }> = [];
        const productsToUpdate: Array<{
          productId: string;
          updateData: any;
          sku: string;
        }> = [];
        
        // Process each product in the batch (collect data, don't insert/update yet)
        let batchProductIndex = 0;
        for (const [groupKey, groupRowsWithIndex] of batch) {
          try {
            // groupKey is now the SKU (each SKU = one product)
            const sku = groupKey;
            batchProductIndex++;
            
            // Update progress periodically (every 100 products or at batch end) for better performance
            // Reduced frequency to minimize overhead while maintaining good UX
            if (jobId && (batchProductIndex % 100 === 0 || batchProductIndex === batch.length)) {
              const currentProcessed = batchStart + batchProductIndex;
              jobManager.updateProcessingProgress(jobId, currentProcessed, productsCreated, productsUpdated);
            }
            
            // Use first row for main product data
            const firstRowData = groupRowsWithIndex[0];
            const firstRow = firstRowData.row;
            
            // Get name and colourway from the first row
            const groupName = firstRow._name || (mapping.name && firstRow[mapping.name]) || '';
            const groupColourway = firstRow._color || (mapping.color && firstRow[mapping.color]) || 'Default';
            
            // Check if product exists by SKU (using batch-fetched map)
            let product = existingProductsMap.get(sku) || null;
            
            // DEBUG: Log product processing status
            if (productsCreated + productsUpdated < 10) {
              console.log(`🔎 Processing SKU "${sku}": exists=${!!product}, rowCount=${groupRowsWithIndex.length}`);
            }
        
            if (!product) {
          // DEBUG: Log entering product creation block
          if (productsCreated < 5) {
            console.log(`📌 ENTERING CREATE BLOCK for SKU "${sku}" (product doesn't exist)`);
          }
          
          // Get brand/category/gender for this product - check edited fields first, then mapped columns, then defaults
          // IMPORTANT: Always provide a fallback for required fields - use explicit validation for empty strings
          // Category from Category column only - never use division (Footwear/Apparel/Accessories) as category
          const rawRowCategory = firstRow._category || (mapping.category && firstRow[mapping.category]) || defaultCategory;
          const rowCategory = (rawRowCategory && String(rawRowCategory).trim()) || 'General';
          
          // Get gender and normalize using the mapping if available
          const rawGenderValue = firstRow._gender || (mapping.gender && firstRow[mapping.gender]) || defaultGender;
          const rawGender = typeof rawGenderValue === 'string' ? rawGenderValue.trim() : rawGenderValue;
          const rowGender = genderNormalizationMap && rawGender && genderNormalizationMap[rawGender] 
            ? genderNormalizationMap[rawGender] 
            : rawGender;
          
          // Get age group if column is mapped (for two-column mode)
          const rawAgeGroupValue = (mapping.ageGroup && mapping.ageGroup !== 'none') 
            ? (firstRow._ageGroup || firstRow[mapping.ageGroup])?.toString() 
            : null;
          
          // Build category lookup key using shared helper for consistency with analyze endpoint
          const categoryLookupKey = buildCategoryLookupKey(rawGenderValue, rawAgeGroupValue);
          
          // Derive three-layer category fields from categoryMappings
          // Look up the key (single gender or composite) in categoryMappings
          // Try multiple key variants for robust matching
          let productMainCategory: string | null = null;
          let productKidsGender: string | null = null;
          let productKidsAgeGroup: string | null = null;
          let derivedAgeGroup: string | null = null; // NEW: Extract ageGroup from categoryMappings for carton matching
          
          if (categoryMappings && categoryLookupKey) {
            // Try exact match first
            let catMapping = categoryMappings[categoryLookupKey];
            
            // If no exact match, try trimmed version
            if (!catMapping && typeof categoryLookupKey === 'string') {
              catMapping = categoryMappings[categoryLookupKey.trim()];
            }
            
            // If still no match, try case-insensitive lookup
            if (!catMapping && typeof categoryLookupKey === 'string') {
              const lookupKeyLower = categoryLookupKey.toLowerCase().trim();
              const matchingKey = Object.keys(categoryMappings).find(
                key => key.toLowerCase().trim() === lookupKeyLower
              );
              if (matchingKey) {
                catMapping = categoryMappings[matchingKey];
              }
            }
            
            if (catMapping) {
              productMainCategory = catMapping.mainCategory || null;
              productKidsGender = catMapping.kidsGender || null;
              productKidsAgeGroup = catMapping.kidsAgeGroup || null;
              derivedAgeGroup = catMapping.ageGroup || null; // NEW: Extract ageGroup for carton config matching
              
              if (productsCreated < 3) {
                console.log(`🏷️ Category mapping for "${categoryLookupKey}": mainCategory=${productMainCategory}, kidsGender=${productKidsGender}, kidsAgeGroup=${productKidsAgeGroup}, ageGroup=${derivedAgeGroup}`);
              }
            } else if (productsCreated < 3) {
              console.log(`⚠️ No category mapping found for "${categoryLookupKey}". Available keys: ${Object.keys(categoryMappings).join(', ')}`);
            }
          }
          
          // Look up brand - prioritize brandId parameter, then row data, then defaults
          let brandRecord;
          if (brandId) {
            // Use brandId directly if provided (brand-first workflow)
            brandRecord = brands.find((b: any) => b.id === brandId);
          } else {
            // Fallback: look up by brand name from row data
            const rowBrand = firstRow._brand || (mapping.brand && firstRow[mapping.brand]) || defaultBrand;
            brandRecord = brands.find((b: any) => b.name === rowBrand);
          }
          
          if (!brandRecord) {
            console.error(`Brand not found for SKU ${sku}, skipping product. brandId=${brandId}, brands available=${brands.length}`);
            continue;
          }
          
          // DEBUG: Log brand found
          if (productsCreated < 10) {
            console.log(`✅ Brand found for SKU "${sku}": ${brandRecord.name} (id=${brandRecord.id})`);
          }
          
          // Generate product name using naming pattern
          const productName = generateProductName(firstRow, brandRecord.name);
          
          // Collect all unique sizes and colors from all rows with this UPC
          const sizes = new Set<string>();
          const colors = new Set<string>();
          
          for (const { row } of groupRowsWithIndex) {
            const size = row._size || (mapping.size && row[mapping.size]);
            const color = row._color || (mapping.color && row[mapping.color]);
            
            if (size) sizes.add(String(size));
            if (color) colors.add(String(color));
          }
          
          // Determine sizes based on size chart mapping type
          let finalSizes: string[] = [];
          let mappedUnitsPerSize: Record<string, number> | undefined = undefined;
          
          if (sizes.size > 0) {
            // Use sizes from Excel rows if available
            finalSizes = Array.from(sizes);
          } else if (sizeChartMappingType === 'product-specific' && sizeChartMappingData?.mappings) {
            // Product-specific: look up by SKU
            const skuLower = sku.toLowerCase();
            const skuSizeMapping = sizeChartMappingData.mappings.find((m: any) => 
              m.key.toLowerCase() === skuLower || 
              m.key.toLowerCase().includes(skuLower) ||
              skuLower.includes(m.key.toLowerCase())
            );
            if (skuSizeMapping && skuSizeMapping.sizes) {
              finalSizes = skuSizeMapping.sizes;
              if (skuSizeMapping.unitsPerSize) {
                mappedUnitsPerSize = skuSizeMapping.unitsPerSize;
              }
              console.log(`📏 Product-specific sizes for SKU ${sku}: ${finalSizes.join(', ')}`);
            }
          } else if (sizeChartMappingType === 'gender-based' && sizeChartMappingData?.mappings) {
            // Gender-based: Match products using mappedGender and mappedAgeGroup from carton config
            // Get product's normalized gender (after genderNormalizationMap) and ageGroup
            const rawGenderForLookup = firstRow._gender || (mapping.gender && firstRow[mapping.gender]) || '';
            const normalizedGenderForLookup = genderNormalizationMap && rawGenderForLookup && genderNormalizationMap[rawGenderForLookup] 
              ? genderNormalizationMap[rawGenderForLookup] 
              : rawGenderForLookup;
            // FIXED: Use derivedAgeGroup from categoryMappings (e.g., "MENS" → "Adult") instead of raw column value
            const effectiveAgeGroupForLookup = derivedAgeGroup || firstRow._ageGroup || (mapping.ageGroup && firstRow[mapping.ageGroup]) || '';
            
            console.log(`🔍 PreOrder matching: rawGender=${rawGenderForLookup}, normalizedGender=${normalizedGenderForLookup}, derivedAgeGroup=${derivedAgeGroup}, effectiveAgeGroup=${effectiveAgeGroupForLookup}`);
            
            // Find matching size chart mapping by comparing product's normalized gender + ageGroup 
            // to carton config's mappedGender + mappedAgeGroup
            let genderSizeMapping: any = null;
            for (const m of sizeChartMappingData.mappings) {
              const configMappedGender = m.mappedGender || '';
              const configMappedAgeGroup = m.mappedAgeGroup || '';
              const configKey = String(m.key || '').trim();
              
              // Support both mapping formats:
              // 1) Carton format: { mappedGender, mappedAgeGroup, sizes, unitsPerSize }
              // 2) Individual gender-based format: { key, sizes }
              let genderMatch = false;
              let ageGroupMatch = false;
              if (configMappedGender) {
                // Carton format (existing behavior)
                genderMatch = normalizedGenderForLookup
                  ? normalizedGenderForLookup.toLowerCase().trim() === configMappedGender.toLowerCase().trim()
                  : false;
                ageGroupMatch = effectiveAgeGroupForLookup && configMappedAgeGroup
                  ? effectiveAgeGroupForLookup.toLowerCase().trim() === configMappedAgeGroup.toLowerCase().trim()
                  : (!effectiveAgeGroupForLookup && !configMappedAgeGroup); // Both empty = match
              } else if (configKey) {
                // Individual format: match by key against raw or normalized gender
                const keyLower = configKey.toLowerCase().trim();
                const rawLower = String(rawGenderForLookup || '').toLowerCase().trim();
                const normalizedLower = String(normalizedGenderForLookup || '').toLowerCase().trim();
                genderMatch = keyLower === rawLower || keyLower === normalizedLower;
                ageGroupMatch = true; // No age-group constraint for key-based individual mappings
              }
              
              // Both gender and ageGroup must match
              if (genderMatch && ageGroupMatch) {
                genderSizeMapping = m;
                console.log(`✅ PreOrder matched carton config: mappedGender="${configMappedGender}", mappedAgeGroup="${configMappedAgeGroup}" for product (normalizedGender="${normalizedGenderForLookup}", effectiveAgeGroup="${effectiveAgeGroupForLookup}")`);
                break;
              }
            }
            
            if (genderSizeMapping && genderSizeMapping.sizes) {
              finalSizes = genderSizeMapping.sizes;
              if (genderSizeMapping.unitsPerSize) {
                mappedUnitsPerSize = genderSizeMapping.unitsPerSize;
                const totalUnits = mappedUnitsPerSize ? Object.values(mappedUnitsPerSize).reduce((sum: number, val: any) => sum + (val || 0), 0) : 0;
                console.log(`📦 Gender-based unitsPerSize (matched by mappedGender="${genderSizeMapping.mappedGender}", mappedAgeGroup="${genderSizeMapping.mappedAgeGroup}"):`, mappedUnitsPerSize, `Total: ${totalUnits} units per carton`);
              }
              console.log(`📏 Gender-based sizes (matched by mappedGender="${genderSizeMapping.mappedGender}", mappedAgeGroup="${genderSizeMapping.mappedAgeGroup}"): ${finalSizes.join(', ')}`);
            } else {
              console.log(`⚠️ No carton config match found for: normalizedGender="${normalizedGenderForLookup}", ageGroup="${effectiveAgeGroupForLookup}"`);
            }
          } else if (sizeChartMappingType === 'uniform' && uniformSizeChartSizes.length > 0) {
            // Uniform mode: use the same size chart for all products
            finalSizes = uniformSizeChartSizes;
            if (productsCreated < 3) {
              console.log(`📏 Uniform size chart sizes applied: ${finalSizes.join(', ')}`);
            }
          }
          
          // No default sizes fallback - only use sizes from Excel or size chart mapping
          
          // Calculate total units per carton from mapped unitsPerSize (sum of all size units)
          let calculatedUnitsPerCarton: number | null = null;
          if (mappedUnitsPerSize && Object.keys(mappedUnitsPerSize).length > 0) {
            calculatedUnitsPerCarton = Object.values(mappedUnitsPerSize).reduce((sum, val) => sum + (val || 0), 0);
            if (calculatedUnitsPerCarton > 0) {
              console.log(`📦 Calculated unitsPerCarton from size mapping: ${calculatedUnitsPerCarton}`);
            } else {
              calculatedUnitsPerCarton = null;
            }
          }
          
          // Convert sizes to the required format: {size: string, stock: number}[]
          // For pre-order products: stock is always 0 (no inventory yet)
          // For stock uploads: use the mapped stock column from Excel
          const isStockUpload = collectionType === 'stock';
          const sizesFromExcel = sizes.size > 0; // Whether sizes came from Excel or size chart
          
          // For carton products using size chart: calculate total cartons from Excel
          let totalCartons = 0;
          if (isStockUpload && mapping.stock && !sizesFromExcel && mappedUnitsPerSize) {
            // Sum all stock values (carton counts) from Excel rows for this SKU
            for (const { row } of groupRowsWithIndex) {
              const stockValue = parseInt(String(row[mapping.stock] || '0').replace(/[^0-9]/g, '')) || 0;
              totalCartons += stockValue;
            }
            console.log(`📦 Carton product: ${totalCartons} total cartons for SKU ${sku}`);
          }
          
          const availableSizes = finalSizes.map(size => {
            const sizeStr = String(size);
            let limitOrderForSize: number | undefined;
            if (isStockUpload && mapping.stock) {
              // Stock upload - get stock from Excel
              let totalStockForSize = 0;
              
              if (sizesFromExcel) {
                // Sizes from Excel - match by size to get stock and limitOrder per size
                for (const { row } of groupRowsWithIndex) {
                  const rowSize = row[mapping.size];
                  if (String(rowSize) === sizeStr) {
                    const stockValue = parseInt(String(row[mapping.stock] || '0').replace(/[^0-9]/g, '')) || 0;
                    totalStockForSize += stockValue;
                    if (mapping.limitOrder) {
                      const raw = row._limitOrder ?? row[mapping.limitOrder];
                      if (raw !== null && raw !== undefined && raw !== '') {
                        const val = parseInt(String(raw));
                        if (!isNaN(val) && val >= 1) limitOrderForSize = val;
                      }
                    }
                  }
                }
              } else if (mappedUnitsPerSize) {
                // Sizes from size chart (carton product)
                const unitsOfThisSizePerCarton = mappedUnitsPerSize[sizeStr] || 0;
                totalStockForSize = totalCartons * unitsOfThisSizePerCarton;
                console.log(`📏 Size ${sizeStr}: ${totalCartons} cartons × ${unitsOfThisSizePerCarton} units/carton = ${totalStockForSize} units`);
              }
              return limitOrderForSize != null ? { size: sizeStr, stock: totalStockForSize, limitOrder: limitOrderForSize } : { size: sizeStr, stock: totalStockForSize };
            }
            // Pre-order with sizes from Excel - get limitOrder per size
            if (sizesFromExcel && mapping.limitOrder) {
              for (const { row } of groupRowsWithIndex) {
                const rowSize = row[mapping.size];
                if (String(rowSize) === sizeStr) {
                  const raw = row._limitOrder ?? row[mapping.limitOrder];
                  if (raw !== null && raw !== undefined && raw !== '') {
                    const val = parseInt(String(raw));
                    if (!isNaN(val) && val >= 1) limitOrderForSize = val;
                  }
                  break;
                }
              }
            }
            return limitOrderForSize != null ? { size: sizeStr, stock: 0, limitOrder: limitOrderForSize } : { size: sizeStr, stock: 0 };
          });
          
          // Build rawAttributes object with ALL Excel column values from the row
          const rawAttributes: Record<string, string> = {};
          for (const [columnName, value] of Object.entries(firstRow)) {
            // Skip internal fields (starting with _) and empty values
            if (!columnName.startsWith('_') && value !== null && value !== undefined && value !== '') {
              rawAttributes[columnName] = String(value);
            }
          }
          
          // Aggregate ALL image URLs from ALL rows for this SKU based on imageSource selection
          const imageUrlsSet = new Set<string>();
          let imageSourceUsed = 'none';
          
          if (effectiveImageSource === 'none') {
            // User chose to skip images - use placeholder
            imageSourceUsed = 'none (user choice)';
          } else if (effectiveImageSource === 'column') {
            // Use image URLs from mapped image columns (image1, image2, etc.)
            // Check for image1, image2, image3, image4 or legacy imageUrl column
            const imageColumns = [
              mapping.image1,
              mapping.image2,
              mapping.image3,
              mapping.image4,
              mapping.imageUrl // Legacy fallback
            ].filter(Boolean);
            
            if (imageColumns.length > 0) {
              // Check if only image1 is mapped (auto-generate B, C, D variants)
              const hasOnlyImage1 = mapping.image1 && !mapping.image2 && !mapping.image3 && !mapping.image4;
              
              if (hasOnlyImage1) {
                // Auto-generate image sequence from the first image URL
                // Use custom pattern if provided, otherwise fall back to A→B→C→D pattern
                if (urlPatternConfig && urlPatternConfig.findPattern) {
                  // Custom URL pattern replacement provided by user
                  // Use ordered array to preserve image1, image2, image3, image4 sequence
                  imageSourceUsed = `column:${mapping.image1} (custom-pattern: ${urlPatternConfig.findPattern})`;
                  for (const { row } of groupRowsWithIndex) {
                    const imgUrl = row[mapping.image1];
                    if (imgUrl && typeof imgUrl === 'string' && imgUrl.trim() && 
                        imgUrl.startsWith('http') && 
                        imgUrl !== 'https://via.placeholder.com/400x400?text=No+Image') {
                      const baseUrl = imgUrl.trim();
                      // Build ordered array: [image1, image2, image3, image4]
                      const orderedUrls: string[] = [baseUrl]; // image1 stays as is
                      
                      // Generate image2, image3, image4 using pattern replacement
                      if (urlPatternConfig.replaceImage2) {
                        orderedUrls.push(baseUrl.replace(urlPatternConfig.findPattern, urlPatternConfig.replaceImage2));
                      }
                      if (urlPatternConfig.replaceImage3) {
                        orderedUrls.push(baseUrl.replace(urlPatternConfig.findPattern, urlPatternConfig.replaceImage3));
                      }
                      if (urlPatternConfig.replaceImage4) {
                        orderedUrls.push(baseUrl.replace(urlPatternConfig.findPattern, urlPatternConfig.replaceImage4));
                      }
                      
                      // Add to set in order (Set preserves insertion order in modern JS)
                      for (const url of orderedUrls) {
                        imageUrlsSet.add(url);
                      }
                      
                      // Log for debugging (first few products)
                      if (productsCreated < 3) {
                        console.log(`🔄 Custom pattern for SKU ${sku}: find="${urlPatternConfig.findPattern}", generated ${orderedUrls.length} URLs`);
                      }
                      
                      break; // Only need to process first row for this SKU
                    }
                  }
                } else {
                  // Default: Auto-generate image sequence from the first image URL (A→B→C→D pattern)
                  imageSourceUsed = `column:${mapping.image1} (auto-generate)`;
                  for (const { row } of groupRowsWithIndex) {
                    const imgUrl = row[mapping.image1];
                    if (imgUrl && typeof imgUrl === 'string' && imgUrl.trim() && 
                        imgUrl.startsWith('http') && 
                        imgUrl !== 'https://via.placeholder.com/400x400?text=No+Image') {
                      // Generate A, B, C, D variants from the base URL
                      const generatedUrls = generateImageUrlSequence(imgUrl.trim());
                      for (const url of generatedUrls) {
                        imageUrlsSet.add(url);
                      }
                      break; // Only need to process first row for this SKU
                    }
                  }
                }
              } else {
                // Standard behavior: use all mapped image columns
                imageSourceUsed = `column:${imageColumns.join(',')}`;
                for (const { row } of groupRowsWithIndex) {
                  for (const colName of imageColumns) {
                    const imgUrl = row[colName];
                    if (imgUrl && typeof imgUrl === 'string' && imgUrl.trim() && 
                        imgUrl.startsWith('http') && 
                        imgUrl !== 'https://via.placeholder.com/400x400?text=No+Image') {
                      imageUrlsSet.add(imgUrl.trim());
                    }
                  }
                }
              }
            } else {
              imageSourceUsed = 'column (no image columns mapped)';
            }
          } else if (effectiveImageSource === 'embedded') {
            // Check for pre-uploaded images first (Cloudinary)
            if (preUploadedImages.size > 0) {
              imageSourceUsed = 'embedded (pre-uploaded)';
              for (const { rowIndex } of groupRowsWithIndex) {
                const imgUrl = preUploadedImages.get(rowIndex);
                if (imgUrl) {
                  imageUrlsSet.add(imgUrl);
                }
              }
            } else {
              // Fallback: Use embedded images from the specific column passed by frontend
              imageSourceUsed = `embedded (column fallback: ${embeddedImageColumn || 'Images'})`;
              const effectiveImageColumn = embeddedImageColumn || 'Images';
              for (const { row } of groupRowsWithIndex) {
                const imgUrl = row[effectiveImageColumn];
                if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http') && imgUrl !== 'https://via.placeholder.com/400x400?text=No+Image') {
                  imageUrlsSet.add(imgUrl);
                }
              }
            }
          } else if (effectiveImageSource === 'zip') {
            imageSourceUsed = 'zip';
            // Match ZIP images by SKU only (various normalizations)
            const skuStr = sku.toString();
            const skuClean = skuStr.toLowerCase().replace(/[^a-z0-9]/g, '');
            const skuWithDashes = skuStr.toLowerCase().replace(/[^a-z0-9-]/g, '');
            const skuWithUnderscores = skuStr.toLowerCase().replace(/[^a-z0-9_]/g, '');
            const tryMatches: { key: string; desc: string }[] = [
              { key: skuClean, desc: 'clean' },
              { key: skuWithDashes, desc: 'dashes' },
              { key: skuWithUnderscores, desc: 'underscores' },
              { key: skuStr.toLowerCase(), desc: 'lowercase' },
              { key: skuStr.toLowerCase().trim(), desc: 'trimmed' },
              { key: skuStr, desc: 'original' }
            ];
            for (const { key, desc } of tryMatches) {
              const imgUrl = zipUploadedImages.get(key);
              if (imgUrl) {
                imageUrlsSet.add(imgUrl);
                if (productsCreated < 3) {
                  console.log(`🖼️ ZIP match for SKU ${sku} using ${desc} key: ${key}`);
                }
                break;
              }
            }
            if (imageUrlsSet.size === 0 && productsCreated < 5) {
              console.log(`⚠️ ZIP no match for SKU ${sku}. Tried keys: ${tryMatches.map(t => t.key).slice(0, 5).join(', ')}...`);
            }
          }
          
          const imageUrls = imageUrlsSet.size > 0 ? Array.from(imageUrlsSet) : [];
          // Use placeholder image if no images available (database requires NOT NULL for image_url)
          const placeholderImage = 'https://placehold.co/400x400/e2e8f0/64748b?text=No+Image';
          const primaryImageUrl = imageUrls[0] || placeholderImage;
          
          // Track image statistics
          if (primaryImageUrl) {
            productsWithImages++;
          } else {
            productsWithoutImages++;
          }
          
          // Log image resolution for first few products
          if (productsCreated < 3) {
            console.log(`🖼️ SKU ${sku}: source=${imageSourceUsed}, found=${imageUrlsSet.size} images, primary=${primaryImageUrl ? 'YES' : 'NO'}`);
          }
          
          // Calculate total stock from availableSizes (sum of all per-size stocks)
          const totalStock = availableSizes.reduce((sum, s) => sum + (s.stock || 0), 0);
          
          // BATCH OPTIMIZATION: Collect product data instead of immediately creating
          // Build product data object with all collected sizes, colors, and ALL mapped attributes
          // Check for edited values (prefixed with _) first, then mapped columns, then defaults
          const productData = {
            sku,
            barcode: firstRow._barcode || (mapping.barcode && firstRow[mapping.barcode]) || '',
            name: productName,
            brand: brandRecord.id,
            category: rowCategory,
            gender: rowGender,
            wholesalePrice: cleanPrice(firstRow._wholesalePrice || (mapping.wholesalePrice && firstRow[mapping.wholesalePrice]) || '0'),
            retailPrice: cleanPrice(firstRow._retailPrice || (mapping.retailPrice && firstRow[mapping.retailPrice]) || '0'),
            minOrder: parseInt(firstRow._minOrder || (mapping.minOrder && firstRow[mapping.minOrder])) || 1,
            availableSizes: availableSizes,
            stock: totalStock, // Total units across all sizes
            inStock: totalStock > 0,
            stockLevel: totalStock > 0 ? 'in_stock' : 'out_of_stock',
            imageUrl: primaryImageUrl, // Backward compatibility with existing database
            image1: primaryImageUrl,
            image2: imageUrls[1] || null,
            image3: imageUrls[2] || null,
            image4: imageUrls[3] || null,
            description: firstRow._description || (mapping.description && firstRow[mapping.description]) || '',
            collections: collectionType === 'catalogue' ? [] : [collectionName],
            division: (() => {
              // Division column mapped: get raw value from row, then apply user's mapping to system division
              const rawDivision = firstRow._division || (mapping.division && mapping.division !== 'none' && firstRow[mapping.division]);
              if (divisionMappings) {
                if (rawDivision && String(rawDivision).trim()) {
                  const rawTrimmed = String(rawDivision).trim();
                  const exactMatch = divisionMappings[rawTrimmed];
                  if (exactMatch) return exactMatch;
                  const lowerRaw = rawTrimmed.toLowerCase();
                  const matchingKey = Object.keys(divisionMappings).find(k => k !== '__default' && k.toLowerCase().trim() === lowerRaw);
                  if (matchingKey) return divisionMappings[matchingKey];
                }
                if (divisionMappings['__default']) return divisionMappings['__default'];
              }
              return rawDivision ? String(rawDivision).trim() : '';
            })(),
            countryOfOrigin: firstRow._countryOfOrigin || (mapping.countryOfOrigin && firstRow[mapping.countryOfOrigin]) || '',
            isPreOrder: collectionType === 'preorder',
            keyCategory: firstRow._keyCategory || (mapping.keyCategory && firstRow[mapping.keyCategory]) || null,
            colourway: firstRow._colourway || (mapping.colourway && firstRow[mapping.colourway]) || null,
            // FIXED: Use derivedAgeGroup from categoryMappings (e.g., "MENS" → "Adult") for proper carton matching
            ageGroup: derivedAgeGroup || firstRow._ageGroup || (mapping.ageGroup && firstRow[mapping.ageGroup]) || null,
            corporateMarketingLine: firstRow._corporateMarketingLine || (mapping.corporateMarketingLine && firstRow[mapping.corporateMarketingLine]) || null,
            productLine: firstRow._productLine || (mapping.productLine && firstRow[mapping.productLine]) || null,
            productType: firstRow._productType || (mapping.productType && firstRow[mapping.productType]) || null,
            sportsCategory: firstRow._sportsCategory || (mapping.sportsCategory && firstRow[mapping.sportsCategory]) || null,
            moq: parseInt(firstRow._moq || (mapping.moq && firstRow[mapping.moq])) || null,
            // Product-level limitOrder only when no per-size data (fallback for older data)
            limitOrder: (() => {
              const hasPerSize = availableSizes.some((s: any) => s.limitOrder != null && s.limitOrder >= 1);
              if (hasPerSize) return null; // Prefer per-size from availableSizes
              const val = parseInt(firstRow._limitOrder || (mapping.limitOrder && firstRow[mapping.limitOrder]));
              return val >= 1 ? val : null;
            })(),
            conditions: firstRow._conditions || (mapping.conditions && firstRow[mapping.conditions]) || null,
            materialComposition: firstRow._materialComposition || (mapping.materialComposition && firstRow[mapping.materialComposition]) || null,
            discount: cleanPrice(firstRow._discount || (mapping.discount && firstRow[mapping.discount]) || '0'),
            // Only use mapping.unitsPerCarton if explicitly mapped by user (not auto-detected)
            // For carton products, always prioritize calculatedUnitsPerCarton from size chart config
            // Never use Excel column values for unitsPerCarton unless explicitly mapped
            unitsPerCarton: calculatedUnitsPerCarton || (firstRow._unitsPerCarton ? parseInt(firstRow._unitsPerCarton) : null) || null,
            // For catalogue uploads, don't set unitsPerSize (force individual mode display)
            // unitsPerSize should ONLY come from carton config (mappedUnitsPerSize), never from Excel columns
            unitsPerSize: collectionType === 'catalogue' ? {} : (mappedUnitsPerSize || {}),
            rawAttributes,
            mainCategory: productMainCategory,
            kidsGender: productKidsGender,
            kidsAgeGroup: productKidsAgeGroup,
            baseCurrency: firstRow._currency || (mapping.currency && firstRow[mapping.currency]) || baseCurrency || 'USD',
          };
          
          // Add to batch create queue
          productsToCreate.push({
            productData,
            sku,
            productIds: [] // Will be populated after batch insert
          });
          
          // Note: product will be set after batch insert
          if (productsCreated + productsToCreate.length <= 5) {
            console.log(`📝 Queued product for batch create #${productsCreated + productsToCreate.length}: SKU="${sku}"`);
          }
        } else {
          // DEBUG: Log when product already exists
          if (productsUpdated < 5) {
            console.log(`📝 Product exists SKU="${sku}", id=${product.id} - will update`);
          }
          // Product exists - add collection and apply size chart sizes
          const currentCollections = product.collections || [];
          const firstRowData = groupRowsWithIndex[0];
          const firstRow = firstRowData.row;
          
          // Calculate images for existing products (same logic as new products)
          // Aggregate ALL image URLs from ALL rows for this SKU based on imageSource selection
          const imageUrlsSet = new Set<string>();
          let imageSourceUsed = 'none';
          
          if (effectiveImageSource === 'none') {
            // User chose to skip images - use placeholder
            imageSourceUsed = 'none (user choice)';
          } else if (effectiveImageSource === 'column') {
            // Use image URLs from mapped image columns (image1, image2, etc.)
            // Check for image1, image2, image3, image4 or legacy imageUrl column
            const imageColumns = [
              mapping.image1,
              mapping.image2,
              mapping.image3,
              mapping.image4,
              mapping.imageUrl // Legacy fallback
            ].filter(Boolean);
            
            if (imageColumns.length > 0) {
              // Check if only image1 is mapped (auto-generate B, C, D variants)
              const hasOnlyImage1 = mapping.image1 && !mapping.image2 && !mapping.image3 && !mapping.image4;
              
              if (hasOnlyImage1) {
                // Auto-generate image sequence from the first image URL
                // Use custom pattern if provided, otherwise fall back to A→B→C→D pattern
                if (urlPatternConfig && urlPatternConfig.findPattern) {
                  // Custom URL pattern replacement provided by user
                  imageSourceUsed = `column:${mapping.image1} (custom-pattern: ${urlPatternConfig.findPattern})`;
                  for (const { row } of groupRowsWithIndex) {
                    const imgUrl = row[mapping.image1];
                    if (imgUrl && typeof imgUrl === 'string' && imgUrl.trim() && 
                        imgUrl.startsWith('http') && 
                        imgUrl !== 'https://via.placeholder.com/400x400?text=No+Image') {
                      const baseUrl = imgUrl.trim();
                      const orderedUrls: string[] = [baseUrl];
                      if (urlPatternConfig.replaceImage2) {
                        orderedUrls.push(baseUrl.replace(urlPatternConfig.findPattern, urlPatternConfig.replaceImage2));
                      }
                      if (urlPatternConfig.replaceImage3) {
                        orderedUrls.push(baseUrl.replace(urlPatternConfig.findPattern, urlPatternConfig.replaceImage3));
                      }
                      if (urlPatternConfig.replaceImage4) {
                        orderedUrls.push(baseUrl.replace(urlPatternConfig.findPattern, urlPatternConfig.replaceImage4));
                      }
                      for (const url of orderedUrls) {
                        imageUrlsSet.add(url);
                      }
                      break;
                    }
                  }
                } else {
                  // Default: Auto-generate image sequence from the first image URL (A→B→C→D pattern)
                  imageSourceUsed = `column:${mapping.image1} (auto-generate)`;
                  for (const { row } of groupRowsWithIndex) {
                    const imgUrl = row[mapping.image1];
                    if (imgUrl && typeof imgUrl === 'string' && imgUrl.trim() && 
                        imgUrl.startsWith('http') && 
                        imgUrl !== 'https://via.placeholder.com/400x400?text=No+Image') {
                      const generatedUrls = generateImageUrlSequence(imgUrl.trim());
                      for (const url of generatedUrls) {
                        imageUrlsSet.add(url);
                      }
                      break;
                    }
                  }
                }
              } else {
                // Standard behavior: use all mapped image columns
                imageSourceUsed = `column:${imageColumns.join(',')}`;
                for (const { row } of groupRowsWithIndex) {
                  for (const colName of imageColumns) {
                    const imgUrl = row[colName];
                    if (imgUrl && typeof imgUrl === 'string' && imgUrl.trim() && 
                        imgUrl.startsWith('http') && 
                        imgUrl !== 'https://via.placeholder.com/400x400?text=No+Image') {
                      imageUrlsSet.add(imgUrl.trim());
                    }
                  }
                }
              }
            } else {
              imageSourceUsed = 'column (no image columns mapped)';
            }
          } else if (effectiveImageSource === 'embedded') {
            // Check for pre-uploaded images first (Cloudinary)
            if (preUploadedImages.size > 0) {
              imageSourceUsed = 'embedded (pre-uploaded)';
              for (const { rowIndex } of groupRowsWithIndex) {
                const imgUrl = preUploadedImages.get(rowIndex);
                if (imgUrl) {
                  imageUrlsSet.add(imgUrl);
                }
              }
            } else {
              // Fallback: Use embedded images from the specific column passed by frontend
              imageSourceUsed = `embedded (column fallback: ${embeddedImageColumn || 'Images'})`;
              const effectiveImageColumn = embeddedImageColumn || 'Images';
              for (const { row } of groupRowsWithIndex) {
                const imgUrl = row[effectiveImageColumn];
                if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http') && imgUrl !== 'https://via.placeholder.com/400x400?text=No+Image') {
                  imageUrlsSet.add(imgUrl);
                }
              }
            }
          } else if (effectiveImageSource === 'zip') {
            imageSourceUsed = 'zip';
            // Match ZIP images by SKU only (various normalizations)
            const skuStr = sku.toString();
            const skuClean = skuStr.toLowerCase().replace(/[^a-z0-9]/g, '');
            const skuWithDashes = skuStr.toLowerCase().replace(/[^a-z0-9-]/g, '');
            const skuWithUnderscores = skuStr.toLowerCase().replace(/[^a-z0-9_]/g, '');
            const tryMatches: { key: string; desc: string }[] = [
              { key: skuClean, desc: 'clean' },
              { key: skuWithDashes, desc: 'dashes' },
              { key: skuWithUnderscores, desc: 'underscores' },
              { key: skuStr.toLowerCase(), desc: 'lowercase' },
              { key: skuStr.toLowerCase().trim(), desc: 'trimmed' },
              { key: skuStr, desc: 'original' }
            ];
            for (const { key, desc } of tryMatches) {
              const imgUrl = zipUploadedImages.get(key);
              if (imgUrl) {
                imageUrlsSet.add(imgUrl);
                if (productsUpdated < 3) {
                  console.log(`🖼️ ZIP match for SKU ${sku} using ${desc} key: ${key}`);
                }
                break;
              }
            }
            if (imageUrlsSet.size === 0 && productsUpdated < 5) {
              console.log(`⚠️ ZIP no match for SKU ${sku} (update). Tried keys: ${tryMatches.map(t => t.key).slice(0, 5).join(', ')}...`);
            }
          }
          
          const imageUrls = imageUrlsSet.size > 0 ? Array.from(imageUrlsSet) : [];
          // Use placeholder image if no images available (database requires NOT NULL for image_url)
          const placeholderImage = 'https://placehold.co/400x400/e2e8f0/64748b?text=No+Image';
          const primaryImageUrl = imageUrls[0] || placeholderImage;
          
          // Get gender for size chart lookup - apply normalization if available
          const rawGender = firstRow._gender || (mapping.gender && firstRow[mapping.gender]) || product.gender;
          const rowGender = genderNormalizationMap && rawGender && genderNormalizationMap[rawGender] 
            ? genderNormalizationMap[rawGender] 
            : rawGender;
          
          // Determine sizes from size chart mapping (same logic as create)
          let updateFinalSizes: string[] = [];
          let updateMappedUnitsPerSize: Record<string, number> | undefined = undefined;
          
          // Collect sizes from Excel rows first
          const rowSizes = new Set<string>();
          for (const { row } of groupRowsWithIndex) {
            const size = row._size || (mapping.size && row[mapping.size]);
            if (size) rowSizes.add(String(size));
          }
          
          if (rowSizes.size > 0) {
            updateFinalSizes = Array.from(rowSizes);
          } else if (sizeChartMappingType === 'gender-based' && sizeChartMappingData?.mappings) {
            // Gender-based: Match products using mappedGender and mappedAgeGroup from carton config
            // Get product's normalized gender (after genderNormalizationMap) and ageGroup
            const rawGenderForUpdate = firstRow._gender || (mapping.gender && firstRow[mapping.gender]) || '';
            const normalizedGenderForUpdate = genderNormalizationMap && rawGenderForUpdate && genderNormalizationMap[rawGenderForUpdate] 
              ? genderNormalizationMap[rawGenderForUpdate] 
              : rawGenderForUpdate;
            
            // FIXED: Derive ageGroup from categoryMappings for update path too
            // Use the RAW gender value (from Excel) not the normalized value for category lookup
            const rawGenderValueForUpdate = firstRow._gender || (mapping.gender && firstRow[mapping.gender]) || '';
            const categoryLookupKeyForUpdate = buildCategoryLookupKey(rawGenderValueForUpdate, null);
            let derivedAgeGroupForUpdate: string | null = null;
            if (categoryMappings && categoryLookupKeyForUpdate) {
              let catMapping = categoryMappings[categoryLookupKeyForUpdate] || categoryMappings[categoryLookupKeyForUpdate.trim()];
              if (!catMapping) {
                const lookupKeyLower = categoryLookupKeyForUpdate.toLowerCase().trim();
                const matchingKey = Object.keys(categoryMappings).find(key => key.toLowerCase().trim() === lookupKeyLower);
                if (matchingKey) catMapping = categoryMappings[matchingKey];
              }
              if (catMapping) {
                derivedAgeGroupForUpdate = catMapping.ageGroup || null;
              }
            }
            const effectiveAgeGroupForUpdate = derivedAgeGroupForUpdate || firstRow._ageGroup || (mapping.ageGroup && firstRow[mapping.ageGroup]) || '';
            
            console.log(`🔍 [Update] PreOrder matching: rawGender=${rawGenderForUpdate}, normalizedGender=${normalizedGenderForUpdate}, derivedAgeGroup=${derivedAgeGroupForUpdate}, effectiveAgeGroup=${effectiveAgeGroupForUpdate}`);
            
            // Find matching size chart mapping by comparing product's normalized gender + ageGroup 
            // to carton config's mappedGender + mappedAgeGroup
            let genderSizeMapping: any = null;
            for (const m of sizeChartMappingData.mappings) {
              const configMappedGender = m.mappedGender || '';
              const configMappedAgeGroup = m.mappedAgeGroup || '';
              const configKey = String(m.key || '').trim();
              
              // Support both mapping formats:
              // 1) Carton format: { mappedGender, mappedAgeGroup, sizes, unitsPerSize }
              // 2) Individual gender-based format: { key, sizes }
              let genderMatch = false;
              let ageGroupMatch = false;
              if (configMappedGender) {
                // Carton format (existing behavior)
                genderMatch = normalizedGenderForUpdate
                  ? normalizedGenderForUpdate.toLowerCase().trim() === configMappedGender.toLowerCase().trim()
                  : false;
                ageGroupMatch = effectiveAgeGroupForUpdate && configMappedAgeGroup
                  ? effectiveAgeGroupForUpdate.toLowerCase().trim() === configMappedAgeGroup.toLowerCase().trim()
                  : (!effectiveAgeGroupForUpdate && !configMappedAgeGroup); // Both empty = match
              } else if (configKey) {
                // Individual format: match by key against raw or normalized gender
                const keyLower = configKey.toLowerCase().trim();
                const rawLower = String(rawGenderForUpdate || '').toLowerCase().trim();
                const normalizedLower = String(normalizedGenderForUpdate || '').toLowerCase().trim();
                genderMatch = keyLower === rawLower || keyLower === normalizedLower;
                ageGroupMatch = true; // No age-group constraint for key-based individual mappings
              }
              
              // Both gender and ageGroup must match
              if (genderMatch && ageGroupMatch) {
                genderSizeMapping = m;
                console.log(`✅ [Update] PreOrder matched carton config: mappedGender="${configMappedGender}", mappedAgeGroup="${configMappedAgeGroup}" for product (normalizedGender="${normalizedGenderForUpdate}", effectiveAgeGroup="${effectiveAgeGroupForUpdate}")`);
                break;
              }
            }
            
            if (genderSizeMapping && genderSizeMapping.sizes) {
              updateFinalSizes = genderSizeMapping.sizes;
              if (genderSizeMapping.unitsPerSize) {
                updateMappedUnitsPerSize = genderSizeMapping.unitsPerSize;
                const totalUnits = updateMappedUnitsPerSize ? Object.values(updateMappedUnitsPerSize).reduce((sum: number, val: any) => sum + (val || 0), 0) : 0;
                console.log(`📦 [Update] Gender-based unitsPerSize (matched by mappedGender="${genderSizeMapping.mappedGender}", mappedAgeGroup="${genderSizeMapping.mappedAgeGroup}"):`, updateMappedUnitsPerSize, `Total: ${totalUnits} units per carton`);
              }
              console.log(`📏 [Update] Gender-based sizes (matched by mappedGender="${genderSizeMapping.mappedGender}", mappedAgeGroup="${genderSizeMapping.mappedAgeGroup}"): ${updateFinalSizes.join(', ')}`);
            } else {
              console.log(`⚠️ [Update] No carton config match found for: normalizedGender="${normalizedGenderForUpdate}", ageGroup="${effectiveAgeGroupForUpdate}"`);
            }
          }
          
          // Build availableSizes - for pre-order products, stock is always 0
          // For stock uploads: use the mapped stock column from Excel
          const hasUnitsMapping = updateMappedUnitsPerSize && Object.keys(updateMappedUnitsPerSize).length > 0;
          const isStockUploadUpdate = collectionType === 'stock';
          const updateSizesFromExcel = rowSizes.size > 0; // Whether sizes came from Excel or size chart
          
          // For carton products using size chart: calculate total cartons from Excel
          let updateTotalCartons = 0;
          if (isStockUploadUpdate && mapping.stock && !updateSizesFromExcel && updateMappedUnitsPerSize) {
            // Sum all stock values (carton counts) from Excel rows for this SKU
            for (const { row } of groupRowsWithIndex) {
              const stockValue = parseInt(String(row[mapping.stock] || '0').replace(/[^0-9]/g, '')) || 0;
              updateTotalCartons += stockValue;
            }
            console.log(`📦 [Update] Carton product: ${updateTotalCartons} total cartons for SKU ${sku}`);
          }
          
          const updatedAvailableSizes = updateFinalSizes.map(size => {
            const sizeStr = String(size);
            let limitOrderForSize: number | undefined;
            if (isStockUploadUpdate && mapping.stock) {
              // Stock upload - get stock from Excel
              let totalStockForSize = 0;
              
              if (updateSizesFromExcel) {
                for (const { row } of groupRowsWithIndex) {
                  const rowSize = row[mapping.size];
                  if (String(rowSize) === sizeStr) {
                    const stockValue = parseInt(String(row[mapping.stock] || '0').replace(/[^0-9]/g, '')) || 0;
                    totalStockForSize += stockValue;
                    if (mapping.limitOrder) {
                      const raw = row._limitOrder ?? row[mapping.limitOrder];
                      if (raw !== null && raw !== undefined && raw !== '') {
                        const val = parseInt(String(raw));
                        if (!isNaN(val) && val >= 1) limitOrderForSize = val;
                      }
                    }
                  }
                }
              } else if (updateMappedUnitsPerSize) {
                const unitsOfThisSizePerCarton = updateMappedUnitsPerSize[sizeStr] || 0;
                totalStockForSize = updateTotalCartons * unitsOfThisSizePerCarton;
                console.log(`📏 [Update] Size ${sizeStr}: ${updateTotalCartons} cartons × ${unitsOfThisSizePerCarton} units/carton = ${totalStockForSize} units`);
              }
              return limitOrderForSize != null ? { size: sizeStr, stock: totalStockForSize, limitOrder: limitOrderForSize } : { size: sizeStr, stock: totalStockForSize };
            }
            // Pre-order with sizes from Excel - get limitOrder per size
            if (updateSizesFromExcel && mapping.limitOrder) {
              for (const { row } of groupRowsWithIndex) {
                const rowSize = row[mapping.size];
                if (String(rowSize) === sizeStr) {
                  const raw = row._limitOrder ?? row[mapping.limitOrder];
                  if (raw !== null && raw !== undefined && raw !== '') {
                    const val = parseInt(String(raw));
                    if (!isNaN(val) && val >= 1) limitOrderForSize = val;
                  }
                  break;
                }
              }
            }
            return limitOrderForSize != null ? { size: sizeStr, stock: 0, limitOrder: limitOrderForSize } : { size: sizeStr, stock: 0 };
          });
          
          // Calculate unitsPerCarton from mapped values
          let calculatedUnitsPerCarton: number | null = null;
          if (hasUnitsMapping && updateMappedUnitsPerSize) {
            calculatedUnitsPerCarton = Object.values(updateMappedUnitsPerSize).reduce((sum, val) => sum + (val || 0), 0);
          }
          
          // Check if sizes are different from current
          const currentSizesStr = (product.availableSizes || []).map((s: any) => s.size).sort().join(',');
          const newSizesStr = updatedAvailableSizes.map(s => s.size).sort().join(',');
          const sizesChanged = currentSizesStr !== newSizesStr && updatedAvailableSizes.length > 0;
          
          // Derive three-layer category fields from categoryMappings for existing products
          // Use same robust matching logic as for new products
          let updateMainCategory: string | null = null;
          let updateKidsGender: string | null = null;
          let updateKidsAgeGroup: string | null = null;
          // Get gender for category lookup
          const rawGenderForCategory = firstRow._gender || (mapping.gender && firstRow[mapping.gender]) || '';
          
          // Get age group for composite key (same as new product logic)
          const rawAgeGroupForUpdate = (mapping.ageGroup && mapping.ageGroup !== 'none') 
            ? (firstRow._ageGroup || firstRow[mapping.ageGroup])?.toString() 
            : null;
          
          // Build category lookup key using shared helper for consistency with analyze endpoint
          const categoryLookupKeyForUpdate = buildCategoryLookupKey(rawGenderForCategory, rawAgeGroupForUpdate);
          
          if (categoryMappings && categoryLookupKeyForUpdate) {
            // Try exact match first
            let catMapping = categoryMappings[categoryLookupKeyForUpdate];
            
            // If no exact match, try trimmed version
            if (!catMapping && typeof categoryLookupKeyForUpdate === 'string') {
              catMapping = categoryMappings[categoryLookupKeyForUpdate.trim()];
            }
            
            // If still no match, try case-insensitive lookup
            if (!catMapping && typeof categoryLookupKeyForUpdate === 'string') {
              const lookupKeyLower = categoryLookupKeyForUpdate.toLowerCase().trim();
              const matchingKey = Object.keys(categoryMappings).find(
                key => key.toLowerCase().trim() === lookupKeyLower
              );
              if (matchingKey) {
                catMapping = categoryMappings[matchingKey];
              }
            }
            
            if (catMapping) {
              updateMainCategory = catMapping.mainCategory || null;
              updateKidsGender = catMapping.kidsGender || null;
              updateKidsAgeGroup = catMapping.kidsAgeGroup || null;
            }
          }
          
          // Check if category fields need updating (missing or different)
          const needsCategoryUpdate = categoryMappings && categoryLookupKeyForUpdate && (
            (updateMainCategory && product.mainCategory !== updateMainCategory) ||
            (updateKidsGender && product.kidsGender !== updateKidsGender) ||
            (updateKidsAgeGroup && product.kidsAgeGroup !== updateKidsAgeGroup)
          );
          
          // Check if images have changed (for all upload types)
          const imagesChanged = primaryImageUrl && 
            primaryImageUrl !== placeholderImage && 
            primaryImageUrl !== product.image1;
          
          // Update product if collection changed, sizes changed, not marked as pre-order, category fields need updating, or images changed
          // For catalogue uploads, we only update product data but don't add to any collection
          const shouldUpdate = collectionType === 'catalogue' 
            ? (sizesChanged || needsCategoryUpdate || imagesChanged) 
            : (!currentCollections.includes(collectionName) || sizesChanged || (collectionType === 'preorder' && !product.isPreOrder) || needsCategoryUpdate || imagesChanged);
          
          // DEBUG: Log when products are skipped
          if (!shouldUpdate && productsUpdated < 5) {
            console.log(`⏭️ Skipping update for SKU "${sku}" - no changes needed (sizesChanged=${sizesChanged}, needsCategoryUpdate=${needsCategoryUpdate}, collectionType=${collectionType})`);
          }
          
          if (shouldUpdate) {
            const updateData: any = {
              // For catalogue, keep existing collections; for others, add the new collection
              collections: collectionType === 'catalogue' 
                ? currentCollections 
                : (currentCollections.includes(collectionName) ? currentCollections : [...currentCollections, collectionName]),
              isPreOrder: collectionType === 'preorder'
            };
            
            // Only update sizes if we have new ones from size chart
            if (updatedAvailableSizes.length > 0) {
              updateData.availableSizes = updatedAvailableSizes;
              
              // Calculate total stock from availableSizes (sum of all per-size stocks)
              const updateTotalStock = updatedAvailableSizes.reduce((sum, s) => sum + (s.stock || 0), 0);
              updateData.stock = updateTotalStock;
              updateData.inStock = updateTotalStock > 0;
              updateData.stockLevel = updateTotalStock > 0 ? 'in_stock' : 'out_of_stock';
            }
            
            // Update unitsPerCarton if calculated
            if (calculatedUnitsPerCarton) {
              updateData.unitsPerCarton = calculatedUnitsPerCarton;
            }
            
            // Update unitsPerSize if mapped from carton config
            if (updateMappedUnitsPerSize && Object.keys(updateMappedUnitsPerSize).length > 0) {
              updateData.unitsPerSize = updateMappedUnitsPerSize;
              console.log(`📦 [Update] Setting unitsPerSize on product:`, updateMappedUnitsPerSize);
            }
            
            // Update three-layer category fields if available
            if (updateMainCategory) {
              updateData.mainCategory = updateMainCategory;
            }
            if (updateKidsGender) {
              updateData.kidsGender = updateKidsGender;
            }
            if (updateKidsAgeGroup) {
              updateData.kidsAgeGroup = updateKidsAgeGroup;
            }
            
            // Update division from Division column via divisionMappings (not from Category)
            const rawDivision = firstRow._division || (mapping.division && mapping.division !== 'none' && firstRow[mapping.division]);
            if (divisionMappings) {
              let matchedDivision: string | undefined;
              if (rawDivision && String(rawDivision).trim()) {
                const rawTrimmed = String(rawDivision).trim();
                matchedDivision = divisionMappings[rawTrimmed];
                if (!matchedDivision) {
                  const lowerRaw = rawTrimmed.toLowerCase();
                  const matchingKey = Object.keys(divisionMappings).find(k => k !== '__default' && k.toLowerCase().trim() === lowerRaw);
                  if (matchingKey) matchedDivision = divisionMappings[matchingKey];
                }
              }
              if (!matchedDivision && divisionMappings['__default']) {
                matchedDivision = divisionMappings['__default'];
              }
              if (matchedDivision) {
                updateData.division = matchedDivision;
              }
            }
            
            // Update baseCurrency - prefer row-level value from Excel, fallback to brand-step selection
            const rowCurrency = firstRow._currency || (mapping.currency && firstRow[mapping.currency]);
            if (rowCurrency || baseCurrency) {
              updateData.baseCurrency = rowCurrency || baseCurrency;
            }
            
            // Update limitOrder - null when we have per-size limits in availableSizes
            const hasPerSizeLimit = updatedAvailableSizes.some((s: any) => s.limitOrder != null && s.limitOrder >= 1);
            if (hasPerSizeLimit) {
              updateData.limitOrder = null;
            } else {
              const updateLimitOrderVal = parseInt(firstRow._limitOrder || (mapping.limitOrder && firstRow[mapping.limitOrder]));
              if (updateLimitOrderVal >= 1) {
                updateData.limitOrder = updateLimitOrderVal;
              } else if (mapping.limitOrder) {
                updateData.limitOrder = null;
              }
            }
            
            // Update images if new ones are provided (for all collection types including catalogue, pre-order, and stock)
            // This ensures images are updated when re-uploading products with the same UPC
            if (primaryImageUrl && primaryImageUrl !== placeholderImage) {
              updateData.image1 = primaryImageUrl;
              updateData.imageUrl = primaryImageUrl; // Backward compatibility
              if (imageUrls[1]) updateData.image2 = imageUrls[1];
              if (imageUrls[2]) updateData.image3 = imageUrls[2];
              if (imageUrls[3]) updateData.image4 = imageUrls[3];
            }
            
            // Update all product properties if provided in the upload
            // Check for edited values (prefixed with _) first, then mapped columns
            const updateName = firstRow._name || (mapping.name && firstRow[mapping.name]);
            if (updateName) {
              // Get brand name for product name generation
              const existingBrand = brands.find((b: any) => b.id === product.brand);
              const brandName = existingBrand?.name || 'Brand';
              updateData.name = generateProductName(firstRow, brandName);
            }
            
            const updateBarcode = firstRow._barcode || (mapping.barcode && firstRow[mapping.barcode]);
            if (updateBarcode) {
              updateData.barcode = String(updateBarcode).trim();
            }
            
            const updateCategoryVal = firstRow._category || (mapping.category && firstRow[mapping.category]);
            if (updateCategoryVal) {
              updateData.category = String(updateCategoryVal).trim();
            }
            
            const updateGender = firstRow._gender || (mapping.gender && firstRow[mapping.gender]);
            if (updateGender) {
              updateData.gender = rowGender; // Use normalized gender
            }
            
            const updateWholesalePrice = firstRow._wholesalePrice || (mapping.wholesalePrice && firstRow[mapping.wholesalePrice]);
            if (updateWholesalePrice) {
              updateData.wholesalePrice = cleanPrice(updateWholesalePrice);
            }
            
            const updateRetailPrice = firstRow._retailPrice || (mapping.retailPrice && firstRow[mapping.retailPrice]);
            if (updateRetailPrice) {
              updateData.retailPrice = cleanPrice(updateRetailPrice);
            }
            
            const updateMinOrder = firstRow._minOrder || (mapping.minOrder && firstRow[mapping.minOrder]);
            if (updateMinOrder) {
              const minOrderVal = parseInt(String(updateMinOrder)) || 1;
              updateData.minOrder = minOrderVal;
            }
            
            const updateDescription = firstRow._description || (mapping.description && firstRow[mapping.description]);
            if (updateDescription) {
              updateData.description = String(updateDescription).trim();
            }
            
            const updateColourway = firstRow._colourway || (mapping.colourway && firstRow[mapping.colourway]);
            if (updateColourway) {
              updateData.colourway = String(updateColourway).trim();
            }
            
            const updateAgeGroup = firstRow._ageGroup || (mapping.ageGroup && mapping.ageGroup !== 'none' && firstRow[mapping.ageGroup]);
            if (updateAgeGroup) {
              // Derive ageGroup from categoryMappings if available, otherwise use the value from Excel
              const rawGenderForAgeGroup = firstRow._gender || (mapping.gender && firstRow[mapping.gender]) || '';
              const categoryLookupKeyForAgeGroup = buildCategoryLookupKey(rawGenderForAgeGroup, null);
              let derivedAgeGroup: string | null = null;
              if (categoryMappings && categoryLookupKeyForAgeGroup) {
                let catMapping = categoryMappings[categoryLookupKeyForAgeGroup] || categoryMappings[categoryLookupKeyForAgeGroup.trim()];
                if (!catMapping) {
                  const lookupKeyLower = categoryLookupKeyForAgeGroup.toLowerCase().trim();
                  const matchingKey = Object.keys(categoryMappings).find(key => key.toLowerCase().trim() === lookupKeyLower);
                  if (matchingKey) catMapping = categoryMappings[matchingKey];
                }
                if (catMapping) {
                  derivedAgeGroup = catMapping.ageGroup || null;
                }
              }
              const effectiveAgeGroup = derivedAgeGroup || String(updateAgeGroup).trim();
              updateData.ageGroup = effectiveAgeGroup || null;
            }
            
            const updateCountryOfOrigin = firstRow._countryOfOrigin || (mapping.countryOfOrigin && firstRow[mapping.countryOfOrigin]);
            if (updateCountryOfOrigin) {
              updateData.countryOfOrigin = String(updateCountryOfOrigin).trim();
            }
            
            const updateKeyCategory = firstRow._keyCategory || (mapping.keyCategory && firstRow[mapping.keyCategory]);
            if (updateKeyCategory) {
              updateData.keyCategory = String(updateKeyCategory).trim();
            }
            
            const updateCorporateMarketingLine = firstRow._corporateMarketingLine || (mapping.corporateMarketingLine && firstRow[mapping.corporateMarketingLine]);
            if (updateCorporateMarketingLine) {
              updateData.corporateMarketingLine = String(updateCorporateMarketingLine).trim();
            }
            
            const updateProductLine = firstRow._productLine || (mapping.productLine && firstRow[mapping.productLine]);
            if (updateProductLine) {
              updateData.productLine = String(updateProductLine).trim();
            }
            
            const updateProductType = firstRow._productType || (mapping.productType && firstRow[mapping.productType]);
            if (updateProductType) {
              updateData.productType = String(updateProductType).trim();
            }
            
            const updateSportsCategory = firstRow._sportsCategory || (mapping.sportsCategory && firstRow[mapping.sportsCategory]);
            if (updateSportsCategory) {
              updateData.sportsCategory = String(updateSportsCategory).trim();
            }
            
            const updateMoq = firstRow._moq || (mapping.moq && firstRow[mapping.moq]);
            if (updateMoq) {
              const moqVal = parseInt(String(updateMoq));
              if (!isNaN(moqVal)) updateData.moq = moqVal;
            }
            
            const updateConditions = firstRow._conditions || (mapping.conditions && firstRow[mapping.conditions]);
            if (updateConditions) {
              updateData.conditions = String(updateConditions).trim();
            }
            
            const updateMaterialComposition = firstRow._materialComposition || (mapping.materialComposition && firstRow[mapping.materialComposition]);
            if (updateMaterialComposition) {
              updateData.materialComposition = String(updateMaterialComposition).trim();
            }
            
            const updateDiscount = firstRow._discount || (mapping.discount && firstRow[mapping.discount]);
            if (updateDiscount) {
              updateData.discount = cleanPrice(updateDiscount);
            }
            
            // Update rawAttributes - build from all Excel column values
            const rawAttributes: Record<string, string> = {};
            for (const [columnName, value] of Object.entries(firstRow)) {
              // Skip internal fields (starting with _) and empty values
              if (!columnName.startsWith('_') && value !== null && value !== undefined && value !== '') {
                rawAttributes[columnName] = String(value);
              }
            }
            if (Object.keys(rawAttributes).length > 0) {
              updateData.rawAttributes = rawAttributes;
            }
            
            // BATCH OPTIMIZATION: Collect update instead of immediately executing
            productsToUpdate.push({
              productId: product.id,
              updateData,
              sku: product.sku
            });
            
            if (productsUpdated + productsToUpdate.length <= 5) {
              console.log(`📝 Queued product for batch update #${productsUpdated + productsToUpdate.length}: SKU="${product.sku}"`);
            }
          }
          
          // Note: For existing products, we already have the ID and can add it now
          // For new products, we'll add the ID after batch insert
          if (product && product.id) {
            productIds.push(product.id);
          }
        }
        } catch (productError) {
          // Log error but continue processing other products
          const productSku = groupKey;
          console.error(`❌ Error processing SKU ${productSku}:`, productError);
          errors.push(`SKU ${productSku}: ${productError instanceof Error ? productError.message : 'Unknown error'}`);
        }
        } // End of batch loop
        
        // BATCH OPTIMIZATION: Execute batch INSERT and UPDATE operations
        console.log(`🚀 Executing batch operations: ${productsToCreate.length} creates, ${productsToUpdate.length} updates`);
        
        // Batch INSERT: Create all new products in chunks for stability
        if (productsToCreate.length > 0) {
          try {
            const batchInsertStartTime = Date.now();
            const INSERT_CHUNK_SIZE = 100; // Insert 100 products at a time for stability
            
            const productsToInsert = productsToCreate.map(({ productData }) => {
              // Auto-detect primaryColor from colourway if not provided (same logic as storage.createProduct)
              return {
                ...productData,
                primaryColor: productData.primaryColor || detectPrimaryColor(productData.colourway),
              };
            });
            
            // Execute batch insert in chunks
            const allInsertedProducts: any[] = [];
            for (let i = 0; i < productsToInsert.length; i += INSERT_CHUNK_SIZE) {
              const chunk = productsToInsert.slice(i, i + INSERT_CHUNK_SIZE);
              const insertedChunk = await db.insert(products).values(chunk as any).returning();
              allInsertedProducts.push(...insertedChunk);
            }
            
            // Map inserted products back to their SKUs and update productIds
            const insertedProductsMap = new Map(allInsertedProducts.map(p => [p.sku, p]));
            for (const createItem of productsToCreate) {
              const insertedProduct = insertedProductsMap.get(createItem.sku);
              if (insertedProduct) {
                productIds.push(insertedProduct.id);
                createItem.productIds.push(insertedProduct.id);
                productsCreated++;
                if (productsCreated <= 5) {
                  console.log(`🆕 Created product #${productsCreated}: SKU="${createItem.sku}", id=${insertedProduct.id}`);
                }
              }
            }
            
            const batchInsertTime = Date.now() - batchInsertStartTime;
            const msPerProduct = allInsertedProducts.length > 0 ? (batchInsertTime / allInsertedProducts.length).toFixed(2) : '0';
            console.log(`✅ Batch INSERT complete: ${allInsertedProducts.length} products created in ${batchInsertTime}ms (${msPerProduct}ms per product)`);
          } catch (insertError) {
            console.error(`❌ Batch INSERT error:`, insertError);
            errors.push(`Batch INSERT failed: ${insertError instanceof Error ? insertError.message : 'Unknown error'}`);
            // Fall back to individual inserts for this batch
            console.log(`⚠️ Falling back to individual inserts for ${productsToCreate.length} products...`);
            for (const { productData, sku } of productsToCreate) {
              try {
                const newProduct = await storage.createProduct(productData);
                productIds.push(newProduct.id);
                productsCreated++;
              } catch (err) {
                errors.push(`SKU ${sku}: ${err instanceof Error ? err.message : 'Unknown error'}`);
              }
            }
          }
        }
        
        // Batch UPDATE: Update all existing products using parallel chunks (no transaction - neon-http doesn't support it)
        if (productsToUpdate.length > 0) {
          try {
            const batchUpdateStartTime = Date.now();
            
            // Process updates in parallel chunks of 50 for optimal performance
            // Note: neon-http driver doesn't support transactions, so we use direct parallel updates
            const UPDATE_CHUNK_SIZE = 50;
            for (let i = 0; i < productsToUpdate.length; i += UPDATE_CHUNK_SIZE) {
              const chunk = productsToUpdate.slice(i, i + UPDATE_CHUNK_SIZE);
              const updatePromises = chunk.map(({ productId, updateData }) =>
                db.update(products)
                  .set(updateData)
                  .where(eq(products.id, productId))
              );
              await Promise.all(updatePromises);
            }
            
            // Update counters
            productsUpdated += productsToUpdate.length;
            for (const updateItem of productsToUpdate) {
              if (productsUpdated <= 5) {
                console.log(`✏️ Updated product ${updateItem.sku}: id=${updateItem.productId}`);
              }
            }
            
            const batchUpdateTime = Date.now() - batchUpdateStartTime;
            const updateMsPerProduct = productsToUpdate.length > 0 ? (batchUpdateTime / productsToUpdate.length).toFixed(2) : '0';
            console.log(`✅ Batch UPDATE complete: ${productsToUpdate.length} products updated in ${batchUpdateTime}ms (${updateMsPerProduct}ms per product)`);
          } catch (updateError) {
            console.error(`❌ Batch UPDATE error:`, updateError);
            errors.push(`Batch UPDATE failed: ${updateError instanceof Error ? updateError.message : 'Unknown error'}`);
            // Fall back to individual updates for this batch
            console.log(`⚠️ Falling back to individual updates for ${productsToUpdate.length} products...`);
            for (const { productId, updateData, sku } of productsToUpdate) {
              try {
                await storage.updateProduct(productId, updateData);
                productsUpdated++;
              } catch (err) {
                errors.push(`SKU ${sku}: ${err instanceof Error ? err.message : 'Unknown error'}`);
              }
            }
          }
        }
        
        // Calculate batch-specific results
        const batchCreated = productsCreated - batchStartCreated;
        const batchUpdated = productsUpdated - batchStartUpdated;
        const batchErrors = errors.length - batchStartErrors;
        
        // Log batch completion with batch-specific and cumulative results
        console.log(`✅ Batch ${batchNumber}/${totalBatches} complete - This batch: ${batchCreated} created, ${batchUpdated} updated, ${batchErrors} errors | Total: ${productsCreated} created, ${productsUpdated} updated, ${errors.length} errors`);
        
        if (jobId) {
          jobManager.updateProcessingProgress(jobId, batchEnd, productsCreated, productsUpdated);
        }
        
        // Memory cleanup after each batch - hint to garbage collector
        if (typeof global.gc === 'function') {
          try { global.gc(); } catch (e) { /* GC not exposed */ }
        }
        
        // Small delay between batches to prevent database overload and allow GC (skip on last batch)
        if (batchEnd < totalGroups) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } // End of outer batch loop
      
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`🎉 Pre-Order Process: Complete in ${elapsedTime}s - ${productsCreated} created, ${productsUpdated} updated, ${errors.length} errors`);
      console.log(`🖼️ Image Summary: ${productsWithImages} products with images, ${productsWithoutImages} without images (source: ${effectiveImageSource})`);
      
      // Create the collection with size chart reference
      // For carton uploads with sizeChartMappingData, create a size chart from the config
      let effectiveSizeChartId = sizeChartId || null;
      
      if (!effectiveSizeChartId && sizeChartMappingData?.mappings?.length > 0) {
        // Build combined sizes and unitsPerSize from all gender mappings
        const allSizes: string[] = [];
        const combinedUnitsPerSize: Record<string, number> = {};
        
        for (const mapping of sizeChartMappingData.mappings) {
          if (mapping.sizes) {
            for (const size of mapping.sizes) {
              if (!allSizes.includes(size)) {
                allSizes.push(size);
              }
            }
          }
          if (mapping?.unitsPerSize && typeof mapping.unitsPerSize === 'object') {
            for (const [size, units] of Object.entries(mapping.unitsPerSize)) {
              // Use the first value found for each size, or add if new
              if (!combinedUnitsPerSize[size]) {
                combinedUnitsPerSize[size] = units as number;
              }
            }
          }
        }
        
        if (allSizes.length > 0) {
          console.log(`📏 Creating size chart from carton config: ${allSizes.length} sizes, ${Object.keys(combinedUnitsPerSize).length} units mappings`);
          
          const [newSizeChart] = await db.insert(sizeCharts).values({
            name: `${collectionName} Size Chart`,
            description: `Auto-generated from carton upload for ${collectionName}`,
            isActive: true,
            sizes: allSizes,
            unitsPerSize: combinedUnitsPerSize
          }).returning();
          
          effectiveSizeChartId = newSizeChart?.id ?? null;
          console.log(`✅ Created size chart ${effectiveSizeChartId} for collection ${collectionName}`);
        }
      }
      
      // Skip collection creation for catalogue uploads - products remain hidden
      let collection: any = null;
      if (collectionType !== 'catalogue') {
        const collectionSlug = collectionName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        collection = await storage.createCollection({
          name: collectionName,
          slug: collectionSlug,
          description: `${collectionType === 'stock' ? 'Stock' : 'Pre-order'} collection: ${collectionName}`,
          discount: '0',
          productIds,
          isActive: true,
          featured: true,
          imageUrl: collectionImage,
          priority: 100,
          sizeChartId: effectiveSizeChartId
        });
        
        // Create preorderCollectionSettings record with collectionType
        await db.insert(preorderCollectionSettings).values({
          collectionName,
          isActive: true,
          collectionType: collectionType || 'preorder',
          updatedAt: new Date().toISOString()
        }).onConflictDoUpdate({
          target: preorderCollectionSettings.collectionName,
          set: { collectionType: collectionType || 'preorder', updatedAt: new Date().toISOString() }
        });
      }
      
      // Clean up all temp files (parsed data, analyzed data, raw preview, metadata, images, and original file)
      const cleanupTempDataPath = path.join(uploadDir, `${tempDataId}.json`);
      const cleanupNdjsonPath = path.join(uploadDir, `${tempDataId}.ndjson`);
      const analyzedCleanupPath = path.join(uploadDir, `${tempDataId}_analyzed.json`);
      const analyzedNdjsonCleanupPath = path.join(uploadDir, `${tempDataId}_analyzed.ndjson`);
      const rawDataPath = path.join(uploadDir, `${tempDataId}_raw.json`);
      const metadataPath = path.join(uploadDir, `${tempDataId}_meta.json`);
      const embeddedImagesCleanupPath = path.join(uploadDir, `${tempDataId}_images.json`);
      const zipImagesCleanupPath = path.join(uploadDir, `${tempDataId}_zip_images.json`);
      
      // Try to get original file path from metadata before deleting
      let originalFilePath: string | null = null;
      if (fs.existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          originalFilePath = metadata.originalFilePath;
        } catch (e) {
          console.log('Could not read metadata for cleanup');
        }
      }
      
      // Delete temp files (each wrapped to prevent one failure from aborting cleanup)
      let cleanedCount = 0;
      const safeUnlink = (p: string) => { try { if (fs.existsSync(p)) { fs.unlinkSync(p); return 1; } } catch (e) { console.warn(`Cleanup skip ${p}:`, (e as Error).message); } return 0; };
      cleanedCount += safeUnlink(cleanupTempDataPath);
      cleanedCount += safeUnlink(cleanupNdjsonPath);
      cleanedCount += safeUnlink(analyzedCleanupPath);
      cleanedCount += safeUnlink(analyzedNdjsonCleanupPath);
      cleanedCount += safeUnlink(rawDataPath);
      cleanedCount += safeUnlink(metadataPath);
      cleanedCount += safeUnlink(embeddedImagesCleanupPath);
      cleanedCount += safeUnlink(zipImagesCleanupPath);
      if (originalFilePath) {
        const n = safeUnlink(originalFilePath);
        cleanedCount += n;
        if (n) console.log(`🧹 Cleaned up original upload file: ${originalFilePath}`);
      }
      console.log(`🧹 Cleaned up ${cleanedCount} temp files for session ${tempDataId}`);
      
      const result = {
        collectionId: collection?.id || null,
        collectionName: collection?.name || (collectionType === 'catalogue' ? 'Catalogue Upload' : collectionName),
        productCount: productIds.length,
        productsCreated,
        productsUpdated,
        errors: errors.length > 0 ? errors.slice(0, 10) : [],
        totalErrors: errors.length,
        processingTime: `${elapsedTime}s`,
        isCatalogueUpload: collectionType === 'catalogue'
      };
      
      // Complete the job if tracking
      if (jobId) {
        jobManager.completeProcessingJob(jobId, result);
      }
      
      return result;
      }; // End of doProcessing function
      
      // Execute processing - either in background or synchronously
      if (isBackgroundMode) {
        // Background mode - run async without awaiting
        doProcessing().catch((err: unknown) => {
          console.error('Background processing error:', err);
          if (jobId) {
            const message = err instanceof Error ? err.message : String(err ?? 'Processing failed');
            jobManager.failJob(jobId, message);
          }
        });
        // Response already sent above
      } else {
        // Synchronous mode - await and send response
        const result = await doProcessing();
        res.json(result);
      }
    } catch (error) {
      console.error("Error processing pre-order collection:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to process pre-order collection" });
      }
    }
  });

  // ==================== SITE SETTINGS ENDPOINTS ====================

  // Get a site setting by key (public)
  app.get("/api/site-settings/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const [setting] = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
      if (!setting) {
        return res.json({ key, value: null });
      }
      res.json(setting);
    } catch (error) {
      console.error("Error fetching site setting:", error);
      res.status(500).json({ message: "Failed to fetch setting" });
    }
  });

  // Update a site setting (admin only)
  app.put("/api/site-settings/:key", requireAdmin, async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      if (typeof value !== "string") {
        return res.status(400).json({ message: "value must be a string" });
      }
      const [existing] = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
      if (existing) {
        const [updated] = await db.update(siteSettings)
          .set({ value, updatedAt: new Date().toISOString() })
          .where(eq(siteSettings.key, key))
          .returning();
        return res.json(updated);
      } else {
        const [created] = await db.insert(siteSettings)
          .values({ key, value, updatedAt: new Date().toISOString() })
          .returning();
        return res.json(created);
      }
    } catch (error) {
      console.error("Error updating site setting:", error);
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // Upload hero image to Cloudinary (admin only)
  app.post("/api/site-settings/hero-image/upload", requireAdmin, uploadSingle.single('photo'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;

      if (cloudName && apiKey && apiSecret) {
        try {
          const cloudinary = (await import('cloudinary')).default;
          cloudinary.v2.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret
          });

          const filePath = req.file.path;
          const result = await cloudinary.v2.uploader.upload(filePath, {
            folder: 'site-assets',
            public_id: `hero_image_${Date.now()}`,
            overwrite: true,
            resource_type: 'image'
          });

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          // Save to site_settings
          const [existing] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'heroImage'));
          if (existing) {
            await db.update(siteSettings)
              .set({ value: result.secure_url, updatedAt: new Date().toISOString() })
              .where(eq(siteSettings.key, 'heroImage'));
          } else {
            await db.insert(siteSettings)
              .values({ key: 'heroImage', value: result.secure_url, updatedAt: new Date().toISOString() });
          }

          console.log(`✅ Hero image uploaded to Cloudinary: ${result.secure_url}`);
          return res.json({ message: "Hero image uploaded", imageUrl: result.secure_url });
        } catch (cloudinaryError) {
          console.error("Cloudinary upload failed:", cloudinaryError);
        }
      }

      // Fallback to local
      const photoUrl = getFileUrl('hero', req.file.filename);
      const [existing] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'heroImage'));
      if (existing) {
        await db.update(siteSettings)
          .set({ value: photoUrl, updatedAt: new Date().toISOString() })
          .where(eq(siteSettings.key, 'heroImage'));
      } else {
        await db.insert(siteSettings)
          .values({ key: 'heroImage', value: photoUrl, updatedAt: new Date().toISOString() });
      }

      res.json({ message: "Hero image saved locally", imageUrl: photoUrl });
    } catch (error) {
      console.error("Error uploading hero image:", error);
      res.status(500).json({ message: "Failed to upload hero image" });
    }
  });

  // ==================== IMAGE UPLOAD ENDPOINTS ====================
  
  // Extract embedded images from Excel and upload to Cloudinary
  // This runs as a background job with progress tracking
  app.post("/api/preorder/extract-images", requireAdmin, async (req, res) => {
    try {
      const { tempDataId, headerRowIndex } = req.body;
      
      if (!tempDataId) {
        return res.status(400).json({ message: "tempDataId is required" });
      }
      
      const uploadDir = path.join(process.cwd(), 'uploads/temp');
      const metadataPath = path.join(uploadDir, `${tempDataId}_meta.json`);
      
      if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ message: "Upload session not found" });
      }
      
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      const originalFilePath = metadata.originalFilePath;
      
      if (!originalFilePath || !fs.existsSync(originalFilePath)) {
        return res.status(404).json({ message: "Original Excel file not found" });
      }
      
      // Create a background job for image extraction
      const jobId = `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Store job status in memory
      const imageJobs = (global as any).__imageJobs = (global as any).__imageJobs || {};
      imageJobs[jobId] = {
        id: jobId,
        status: 'running',
        progress: {
          stage: 'extracting',
          percent: 0,
          message: 'Starting image extraction...',
          imagesProcessed: 0,
          totalImages: 0,
          startedAt: Date.now()
        },
        uploadedImages: [] as { row: number; imageUrl: string }[]
      };
      
      // Return job ID immediately
      res.json({ jobId, message: 'Image extraction started' });
      
      // Run extraction in background
      (async () => {
        try {
          const ExcelJS = await import('exceljs');
          const workbook = new ExcelJS.default.Workbook();
          await workbook.xlsx.readFile(originalFilePath);
          
          const worksheet = workbook.worksheets[0];
          const excelImages = worksheet.getImages();
          
          // Check for partial results (resume from previous run when user went back)
          let uploadedImages: { row: number; imageUrl: string }[] = [];
          let skipCount = 0;
          const imageMappingPath = path.join(uploadDir, `${tempDataId}_images.json`);
          if (fs.existsSync(imageMappingPath)) {
            try {
              const content = JSON.parse(fs.readFileSync(imageMappingPath, 'utf-8'));
              const existing = Array.isArray(content) ? content : (content.uploaded || []);
              if (existing.length > 0 && existing.length < excelImages.length) {
                uploadedImages = [...existing];
                skipCount = existing.length;
                console.log(`Resuming image upload from ${skipCount}/${excelImages.length}`);
              }
            } catch (e) {
              console.warn('Could not load partial image results for resume:', e);
            }
          }
          
          imageJobs[jobId].progress.totalImages = excelImages.length;
          imageJobs[jobId].progress.imagesProcessed = skipCount;
          imageJobs[jobId].uploadedImages = uploadedImages;
          imageJobs[jobId].progress.message = skipCount > 0
            ? `Resuming from ${skipCount}/${excelImages.length} images`
            : `Found ${excelImages.length} embedded images`;
          
          if (excelImages.length === 0) {
            imageJobs[jobId].status = 'completed';
            imageJobs[jobId].progress.stage = 'completed';
            imageJobs[jobId].progress.percent = 100;
            imageJobs[jobId].progress.message = 'No embedded images found';
            return;
          }
          
          if (skipCount >= excelImages.length) {
            imageJobs[jobId].status = 'completed';
            imageJobs[jobId].progress.stage = 'completed';
            imageJobs[jobId].progress.percent = 100;
            imageJobs[jobId].progress.message = `All ${uploadedImages.length} images already uploaded`;
            fs.writeFileSync(imageMappingPath, JSON.stringify({ uploaded: uploadedImages, totalInExcel: excelImages.length }));
            return;
          }
          
          // Get Cloudinary credentials
          const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
          const apiKey = process.env.CLOUDINARY_API_KEY;
          const apiSecret = process.env.CLOUDINARY_API_SECRET;
          
          if (!cloudName || !apiKey || !apiSecret) {
            imageJobs[jobId].status = 'failed';
            imageJobs[jobId].progress.stage = 'failed';
            imageJobs[jobId].error = 'Cloudinary credentials not configured';
            return;
          }
          
          const cloudinary = (await import('cloudinary')).default;
          cloudinary.v2.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
          
          const tempImgDir = path.join(uploadDir, `${tempDataId}_images`);
          
          if (!fs.existsSync(tempImgDir)) {
            fs.mkdirSync(tempImgDir, { recursive: true });
          }
          
          imageJobs[jobId].progress.stage = 'processing-images';
          
          // BATCH UPLOAD: Process images in parallel batches (start from skipCount when resuming)
          const BATCH_SIZE = 15; // Upload 15 images in parallel at a time
          let processedCount = skipCount;
          
          for (let batchStart = skipCount; batchStart < excelImages.length; batchStart += BATCH_SIZE) {
            // Check if job was cancelled/stopped
            if (imageJobs[jobId].status === 'stopped' || imageJobs[jobId].status === 'cancelled') {
              console.log(`Image upload job ${jobId} was stopped by user`);
              break;
            }
            
            const batchEnd = Math.min(batchStart + BATCH_SIZE, excelImages.length);
            const batch = excelImages.slice(batchStart, batchEnd);
            
            // Process batch in parallel
            const batchPromises = batch.map(async (image, batchIndex) => {
              const globalIndex = batchStart + batchIndex;
              const imageId = image.imageId;
              const img = workbook.getImage(Number(imageId));
              
              if (img && img.buffer) {
                const extension = img.extension || 'png';
                const range = image.range;
                let row = 0;
                
                if (typeof range === 'object' && 'tl' in range) {
                  row = Math.floor(range.tl.row);
                }
                
                // Adjust row for header + header row itself to align with data row indexing (0-based)
                const dataRowIndex = row - ((headerRowIndex || 0) + 1);
                
                const tempFilePath = path.join(tempImgDir, `img_${globalIndex}.${extension}`);
                fs.writeFileSync(tempFilePath, Buffer.from(img.buffer));
                
                try {
                  const result = await cloudinary.v2.uploader.upload(tempFilePath, {
                    folder: `preorder/${tempDataId}`,
                    public_id: `row_${dataRowIndex}_${globalIndex}`,
                    resource_type: 'image'
                  });
                  
                  // Clean up temp file immediately after successful upload
                  try { fs.unlinkSync(tempFilePath); } catch {}
                  
                  return {
                    row: dataRowIndex,
                    imageUrl: result.secure_url
                  };
                } catch (uploadError) {
                  console.error(`Failed to upload image at row ${row}:`, uploadError);
                  try { fs.unlinkSync(tempFilePath); } catch {}
                  return null;
                }
              }
              return null;
            });
            
            // Wait for entire batch to complete
            const batchResults = await Promise.all(batchPromises);
            
            // Add successful uploads to results
            for (const result of batchResults) {
              if (result) {
                uploadedImages.push(result);
              }
            }
            
            // Update progress after each batch
            processedCount = batchEnd;
            imageJobs[jobId].progress.imagesProcessed = processedCount;
            imageJobs[jobId].progress.percent = Math.round((processedCount / excelImages.length) * 100);
            imageJobs[jobId].progress.message = `Uploaded ${processedCount}/${excelImages.length} images`;
            imageJobs[jobId].uploadedImages = uploadedImages; // Update partial results
          }
          
          // Clean up temp image directory
          if (fs.existsSync(tempImgDir)) {
            fs.rmdirSync(tempImgDir, { recursive: true });
          }
          
          // Check if job was stopped/cancelled - if so, don't mark as completed
          if (imageJobs[jobId].status === 'stopped' || imageJobs[jobId].status === 'cancelled') {
            // Save partial results for stopped jobs (include totalInExcel for "already uploaded" detection)
            fs.writeFileSync(imageMappingPath, JSON.stringify({ uploaded: uploadedImages, totalInExcel: excelImages.length }));
            imageJobs[jobId].uploadedImages = uploadedImages;
            imageJobs[jobId].progress.message = `Stopped - ${uploadedImages.length} of ${excelImages.length} images uploaded`;
            console.log(`Image upload job ${jobId} stopped. ${uploadedImages.length} images were uploaded before cancellation.`);
            return; // Don't override the stopped status
          }
          
          // Save uploaded images mapping (include totalInExcel for "already uploaded" detection)
          fs.writeFileSync(imageMappingPath, JSON.stringify({ uploaded: uploadedImages, totalInExcel: excelImages.length }));
          
          imageJobs[jobId].status = 'completed';
          imageJobs[jobId].progress.stage = 'completed';
          imageJobs[jobId].progress.percent = 100;
          imageJobs[jobId].progress.message = `Uploaded ${uploadedImages.length} images to Cloudinary`;
          imageJobs[jobId].uploadedImages = uploadedImages;
          
        } catch (error) {
          console.error('Image extraction error:', error);
          imageJobs[jobId].status = 'failed';
          imageJobs[jobId].progress.stage = 'failed';
          imageJobs[jobId].error = error instanceof Error ? error.message : 'Unknown error';
        }
      })();
      
    } catch (error) {
      console.error("Error starting image extraction:", error);
      res.status(500).json({ message: "Failed to start image extraction" });
    }
  });
  
  // Get image extraction job status
  app.get("/api/preorder/extract-images/:jobId", requireAdmin, async (req, res) => {
    const { jobId } = req.params;
    const imageJobs = (global as any).__imageJobs || {};
    
    if (!imageJobs[jobId]) {
      return res.status(404).json({ message: "Job not found" });
    }
    
    res.json(imageJobs[jobId]);
  });
  
  // Check if embedded images already exist for a tempDataId (e.g. after user went back and returns)
  app.get("/api/preorder/embedded-images-status", requireAdmin, async (req, res) => {
    try {
      const tempDataId = req.query.tempDataId as string;
      if (!tempDataId) {
        return res.status(400).json({ message: "tempDataId is required" });
      }
      const uploadDir = path.join(process.cwd(), 'uploads/temp');
      const imageMappingPath = path.join(uploadDir, `${tempDataId}_images.json`);
      if (!fs.existsSync(imageMappingPath)) {
        return res.json({ exists: false, uploadedCount: 0, totalInExcel: null });
      }
      const content = JSON.parse(fs.readFileSync(imageMappingPath, 'utf-8'));
      // Support both formats: array (legacy) or { uploaded, totalInExcel }
      const uploaded = Array.isArray(content) ? content : (content.uploaded || []);
      const totalInExcel = Array.isArray(content) ? null : (content.totalInExcel ?? null);
      return res.json({
        exists: true,
        uploadedCount: uploaded.length,
        totalInExcel
      });
    } catch (error) {
      console.error("Error checking embedded images status:", error);
      res.status(500).json({ message: "Failed to check status" });
    }
  });

  // Stop/cancel image extraction job
  app.post("/api/preorder/extract-images/:jobId/stop", requireAdmin, async (req, res) => {
    const { jobId } = req.params;
    const imageJobs = (global as any).__imageJobs || {};
    
    if (!imageJobs[jobId]) {
      return res.status(404).json({ message: "Job not found" });
    }
    
    // Mark job as stopped - the background process will check this and stop
    imageJobs[jobId].status = 'stopped';
    imageJobs[jobId].progress.message = 'Upload stopped by user';
    imageJobs[jobId].progress.stage = 'stopped';
    
    console.log(`Image upload job ${jobId} stopped by user. ${imageJobs[jobId].uploadedImages?.length || 0} images were uploaded.`);
    
    res.json({ 
      message: 'Job stopped', 
      uploadedImages: imageJobs[jobId].uploadedImages || [],
      imagesProcessed: imageJobs[jobId].progress.imagesProcessed
    });
  });
  
  // Upload ZIP file containing images and match them to rows
  app.post("/api/preorder/upload-images-zip", requireAdmin, uploadZip.single('file'), async (req, res) => {
    try {
      const file = req.file;
      const { tempDataId, matchColumn } = req.body;
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      if (!tempDataId) {
        return res.status(400).json({ message: "tempDataId is required" });
      }
      
      const uploadDir = path.join(process.cwd(), 'uploads/temp');
      
      // Create job for progress tracking
      const jobId = `zip_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const imageJobs = (global as any).__imageJobs = (global as any).__imageJobs || {};
      imageJobs[jobId] = {
        id: jobId,
        status: 'running',
        progress: {
          stage: 'extracting',
          percent: 0,
          message: 'Extracting ZIP file...',
          imagesProcessed: 0,
          totalImages: 0,
          startedAt: Date.now()
        },
        uploadedImages: [] as { filename: string; imageUrl: string }[]
      };
      
      res.json({ jobId, message: 'ZIP processing started' });
      
      // Process ZIP in background
      (async () => {
        try {
          const AdmZipModule = await import('adm-zip');
          const AdmZip = AdmZipModule.default;
          const zip = new AdmZip(file.path);
          const zipEntries = zip.getEntries();
          
          // Filter for image files
          const imageEntries = zipEntries.filter((entry: any) => {
            const name = entry.entryName.toLowerCase();
            return !entry.isDirectory && 
                   (name.endsWith('.jpg') || name.endsWith('.jpeg') || 
                    name.endsWith('.png') || name.endsWith('.gif') || 
                    name.endsWith('.webp'));
          });
          
          imageJobs[jobId].progress.totalImages = imageEntries.length;
          imageJobs[jobId].progress.message = `Found ${imageEntries.length} images in ZIP`;
          
          if (imageEntries.length === 0) {
            imageJobs[jobId].status = 'completed';
            imageJobs[jobId].progress.stage = 'completed';
            imageJobs[jobId].progress.percent = 100;
            imageJobs[jobId].progress.message = 'No images found in ZIP file';
            fs.unlinkSync(file.path);
            return;
          }
          
          // Get Cloudinary credentials
          const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
          const apiKey = process.env.CLOUDINARY_API_KEY;
          const apiSecret = process.env.CLOUDINARY_API_SECRET;
          
          if (!cloudName || !apiKey || !apiSecret) {
            const errMsg = 'Cloudinary credentials not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env';
            imageJobs[jobId].status = 'failed';
            imageJobs[jobId].progress.stage = 'failed';
            imageJobs[jobId].progress.error = errMsg;
            imageJobs[jobId].error = errMsg;
            fs.unlinkSync(file.path);
            return;
          }
          
          const cloudinary = (await import('cloudinary')).default;
          cloudinary.v2.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
          
          const uploadedImages: { filename: string; normalizedKeys: string[]; imageUrl: string }[] = [];
          const tempExtractDir = path.join(uploadDir, `${tempDataId}_zip`);
          
          if (!fs.existsSync(tempExtractDir)) {
            fs.mkdirSync(tempExtractDir, { recursive: true });
          }
          
          imageJobs[jobId].progress.stage = 'processing-images';
          
          // Extract all image files first, then upload in parallel batches of 10
          const BATCH_SIZE = 10;
          let totalProcessed = 0;
          
          for (let batchStart = 0; batchStart < imageEntries.length; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, imageEntries.length);
            const batch = imageEntries.slice(batchStart, batchEnd);
            
            // Extract all files in this batch
            const batchItems: { entry: any; originalFilename: string; filenameWithoutExt: string; tempFilePath: string }[] = [];
            for (const entry of batch) {
              const originalFilename = path.basename(entry.entryName);
              const filenameWithoutExt = path.parse(originalFilename).name;
              const tempFilePath = path.join(tempExtractDir, originalFilename);
              zip.extractEntryTo(entry.entryName, tempExtractDir, false, true);
              batchItems.push({ entry, originalFilename, filenameWithoutExt, tempFilePath });
            }
            
            // Upload all images in this batch in parallel
            const batchResults = await Promise.allSettled(
              batchItems.map(async ({ originalFilename, filenameWithoutExt, tempFilePath }) => {
                try {
                  const result = await cloudinary.v2.uploader.upload(tempFilePath, {
                    folder: `preorder/${tempDataId}/zip`,
                    public_id: filenameWithoutExt,
                    resource_type: 'image'
                  });
                  
                  // Store with multiple normalization keys for better matching
                  const normalizedFilename = filenameWithoutExt.toLowerCase().replace(/[^a-z0-9]/g, '');
                  const normalizedWithDashes = filenameWithoutExt.toLowerCase().replace(/[^a-z0-9-]/g, '');
                  const normalizedWithUnderscores = filenameWithoutExt.toLowerCase().replace(/[^a-z0-9_]/g, '');
                  
                  return {
                    filename: filenameWithoutExt,
                    normalizedKeys: [
                      normalizedFilename,
                      normalizedWithDashes,
                      normalizedWithUnderscores,
                      filenameWithoutExt.toLowerCase(),
                      filenameWithoutExt.toLowerCase().trim()
                    ],
                    imageUrl: result.secure_url
                  };
                } catch (uploadError) {
                  console.error(`Failed to upload ${originalFilename}:`, uploadError);
                  return null;
                } finally {
                  // Clean up temp file regardless of success/failure
                  if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                  }
                }
              })
            );
            
            // Collect successful uploads from this batch
            for (const result of batchResults) {
              if (result.status === 'fulfilled' && result.value) {
                uploadedImages.push(result.value);
              }
            }
            
            totalProcessed += batch.length;
            imageJobs[jobId].progress.imagesProcessed = totalProcessed;
            imageJobs[jobId].progress.percent = Math.round((totalProcessed / imageEntries.length) * 100);
            imageJobs[jobId].progress.message = `Uploaded ${totalProcessed}/${imageEntries.length} images`;
          }
          
          // Clean up
          if (fs.existsSync(tempExtractDir)) {
            fs.rmdirSync(tempExtractDir, { recursive: true });
          }
          fs.unlinkSync(file.path);
          
          // Save uploaded images for later matching
          const zipImageMappingPath = path.join(uploadDir, `${tempDataId}_zip_images.json`);
          fs.writeFileSync(zipImageMappingPath, JSON.stringify(uploadedImages));
          
          imageJobs[jobId].status = 'completed';
          imageJobs[jobId].progress.stage = 'completed';
          imageJobs[jobId].progress.percent = 100;
          imageJobs[jobId].progress.message = `Uploaded ${uploadedImages.length} images from ZIP`;
          imageJobs[jobId].uploadedImages = uploadedImages;
          
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error('ZIP processing error:', error);
          imageJobs[jobId].status = 'failed';
          imageJobs[jobId].progress.stage = 'failed';
          imageJobs[jobId].progress.error = errMsg;
          imageJobs[jobId].error = errMsg;
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      })();
      
    } catch (error) {
      console.error("Error processing ZIP upload:", error);
      res.status(500).json({ message: "Failed to process ZIP upload" });
    }
  });
  
  // Get uploaded images for a session (embedded or ZIP)
  app.get("/api/preorder/uploaded-images/:tempDataId", requireAdmin, async (req, res) => {
    try {
      const { tempDataId } = req.params;
      const { source } = req.query; // 'embedded' or 'zip'
      
      const uploadDir = path.join(process.cwd(), 'uploads/temp');
      const filename = source === 'zip' 
        ? `${tempDataId}_zip_images.json` 
        : `${tempDataId}_images.json`;
      const imagePath = path.join(uploadDir, filename);
      
      if (!fs.existsSync(imagePath)) {
        return res.json({ images: [] });
      }
      
      const content = JSON.parse(fs.readFileSync(imagePath, 'utf-8'));
      const images = Array.isArray(content) ? content : (content.uploaded || []);
      res.json({ images });
    } catch (error) {
      console.error("Error fetching uploaded images:", error);
      res.status(500).json({ message: "Failed to fetch uploaded images" });
    }
  });

  // ==================== GOOGLE AGENT INTEGRATION ====================
  // Proxy endpoint to communicate with the Python ADK agent
  app.post("/api/agent/upload-image", requireAdmin, async (req, res) => {
    try {
      const { imageUrl, sku } = req.body;
      
      if (!sku || !imageUrl) {
        return res.status(400).json({ message: "SKU and imageUrl are required" });
      }
      
      // Update product with the image URL from the agent
      const products = await storage.getProductsBySKU(sku);
      
      if (!products || products.length === 0) {
        return res.status(404).json({ message: `Product with SKU ${sku} not found` });
      }
      
      const product = products[0];
      await storage.updateProduct(product.id, {
        image1: imageUrl
      });
      
      res.json({
        success: true,
        sku,
        productId: product.id,
        image1: imageUrl
      });
      
    } catch (error) {
      console.error("Error updating product image:", error);
      res.status(500).json({ message: "Failed to update product image" });
    }
  });
  
  // Batch update product images from agent results
  app.post("/api/agent/batch-update-images", requireAdmin, async (req, res) => {
    try {
      const { products } = req.body;
      
      if (!Array.isArray(products)) {
        return res.status(400).json({ message: "Products array is required" });
      }
      
      const results = {
        updated: 0,
        failed: 0,
        errors: [] as string[]
      };
      
      for (const item of products) {
        try {
          const existingProducts = await storage.getProductsBySKU(item.sku);
          
          if (existingProducts && existingProducts.length > 0) {
            await storage.updateProduct(existingProducts[0].id, {
              image1: item.image_url
            });
            results.updated++;
          } else {
            results.failed++;
            results.errors.push(`SKU ${item.sku} not found`);
          }
        } catch (error) {
          results.failed++;
          results.errors.push(`Failed to update ${item.sku}: ${error}`);
        }
      }
      
      res.json(results);
      
    } catch (error) {
      console.error("Error batch updating images:", error);
      res.status(500).json({ message: "Failed to batch update images" });
    }
  });

  // ==================== CLOUDFLARE IMAGES INTEGRATION ====================
  
  // Helper function to upload a single image to Cloudflare Images
  async function uploadToCloudflareImages(imageBuffer: Buffer, fileName: string): Promise<string | null> {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    
    if (!accountId || !apiToken) {
      console.error('Cloudflare credentials not configured');
      return null;
    }
    
    try {
      const formData = new FormData();
      const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('file', blob, fileName);
      
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
          },
          body: formData,
        }
      );
      
      const result = await response.json();
      
      if (result.success && result.result?.variants?.[0]) {
        console.log(`✅ Uploaded ${fileName} to Cloudflare Images`);
        return result.result.variants[0];
      } else {
        console.error(`❌ Failed to upload ${fileName}:`, result.errors);
        return null;
      }
    } catch (error) {
      console.error(`Error uploading ${fileName} to Cloudflare:`, error);
      return null;
    }
  }
  
  // List all images in the local extracted folder
  app.get("/api/cloudflare/local-images", requireAdmin, async (req, res) => {
    try {
      const extractedImagesDir = path.join(process.cwd(), 'attached_assets', 'excel_extracted_images');
      
      if (!fs.existsSync(extractedImagesDir)) {
        return res.json({ images: [], count: 0 });
      }
      
      const files = fs.readdirSync(extractedImagesDir)
        .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
      
      res.json({
        images: files,
        count: files.length,
        directory: extractedImagesDir
      });
    } catch (error) {
      console.error("Error listing local images:", error);
      res.status(500).json({ message: "Failed to list local images" });
    }
  });
  
  // Upload all local extracted images to Cloudflare Images
  app.post("/api/cloudflare/upload-all", requireAdmin, async (req, res) => {
    try {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      
      if (!accountId || !apiToken) {
        return res.status(500).json({ 
          message: "Cloudflare credentials not configured. Please add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN secrets." 
        });
      }
      
      const extractedImagesDir = path.join(process.cwd(), 'attached_assets', 'excel_extracted_images');
      
      if (!fs.existsSync(extractedImagesDir)) {
        return res.status(404).json({ message: "No extracted images folder found" });
      }
      
      const files = fs.readdirSync(extractedImagesDir)
        .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
      
      if (files.length === 0) {
        return res.status(404).json({ message: "No images found in the extracted folder" });
      }
      
      console.log(`📤 Starting upload of ${files.length} images to Cloudflare Images...`);
      
      const results = {
        total: files.length,
        uploaded: 0,
        failed: 0,
        urls: {} as Record<string, string>,
        errors: [] as string[]
      };
      
      // Process images in batches of 5 to avoid rate limits
      const batchSize = 5;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        
        const uploadPromises = batch.map(async (fileName) => {
          try {
            const filePath = path.join(extractedImagesDir, fileName);
            const imageBuffer = fs.readFileSync(filePath);
            
            const cloudflareUrl = await uploadToCloudflareImages(imageBuffer, fileName);
            
            if (cloudflareUrl) {
              results.uploaded++;
              const sku = path.basename(fileName, path.extname(fileName));
              results.urls[sku] = cloudflareUrl;
            } else {
              results.failed++;
              results.errors.push(`Failed to upload ${fileName}`);
            }
          } catch (error) {
            results.failed++;
            results.errors.push(`Error processing ${fileName}: ${error}`);
          }
        });
        
        await Promise.all(uploadPromises);
        
        // Small delay between batches to avoid rate limits
        if (i + batchSize < files.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log(`✅ Upload complete: ${results.uploaded}/${results.total} images uploaded`);
      
      res.json(results);
    } catch (error) {
      console.error("Error uploading images to Cloudflare:", error);
      res.status(500).json({ message: "Failed to upload images to Cloudflare" });
    }
  });
  
  // Upload a single image to Cloudflare and update product
  app.post("/api/cloudflare/upload-single", requireAdmin, async (req, res) => {
    try {
      const { sku } = req.body;
      
      if (!sku) {
        return res.status(400).json({ message: "SKU is required" });
      }
      
      const extractedImagesDir = path.join(process.cwd(), 'attached_assets', 'excel_extracted_images');
      
      // Try different extensions
      const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      let imagePath: string | null = null;
      let imageFileName: string | null = null;
      
      for (const ext of extensions) {
        const testPath = path.join(extractedImagesDir, `${sku}${ext}`);
        if (fs.existsSync(testPath)) {
          imagePath = testPath;
          imageFileName = `${sku}${ext}`;
          break;
        }
      }
      
      if (!imagePath || !imageFileName) {
        return res.status(404).json({ message: `No image found for SKU: ${sku}` });
      }
      
      const imageBuffer = fs.readFileSync(imagePath);
      const cloudflareUrl = await uploadToCloudflareImages(imageBuffer, imageFileName);
      
      if (!cloudflareUrl) {
        return res.status(500).json({ message: "Failed to upload to Cloudflare" });
      }
      
      // Update product with new Cloudflare URL
      const existingProducts = await storage.getProductsBySKU(sku);
      
      if (existingProducts && existingProducts.length > 0) {
        await storage.updateProduct(existingProducts[0].id, {
          image1: cloudflareUrl
        });
      }
      
      res.json({
        success: true,
        sku,
        cloudflareUrl
      });
    } catch (error) {
      console.error("Error uploading single image:", error);
      res.status(500).json({ message: "Failed to upload image" });
    }
  });
  
  // Upload all images and update all matching products
  app.post("/api/cloudflare/upload-and-update-products", requireAdmin, async (req, res) => {
    try {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      
      if (!accountId || !apiToken) {
        return res.status(500).json({ 
          message: "Cloudflare credentials not configured" 
        });
      }
      
      const extractedImagesDir = path.join(process.cwd(), 'attached_assets', 'excel_extracted_images');
      
      if (!fs.existsSync(extractedImagesDir)) {
        return res.status(404).json({ message: "No extracted images folder found" });
      }
      
      const files = fs.readdirSync(extractedImagesDir)
        .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
      
      if (files.length === 0) {
        return res.status(404).json({ message: "No images found" });
      }
      
      console.log(`📤 Uploading ${files.length} images and updating products...`);
      
      const results = {
        total: files.length,
        uploaded: 0,
        productsUpdated: 0,
        failed: 0,
        details: [] as Array<{ sku: string; cloudflareUrl?: string; productUpdated: boolean; error?: string }>
      };
      
      // Process in smaller batches
      const batchSize = 5;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        
        for (const fileName of batch) {
          const sku = path.basename(fileName, path.extname(fileName));
          
          try {
            const filePath = path.join(extractedImagesDir, fileName);
            const imageBuffer = fs.readFileSync(filePath);
            
            const cloudflareUrl = await uploadToCloudflareImages(imageBuffer, fileName);
            
            if (cloudflareUrl) {
              results.uploaded++;
              
              // Update product
              const existingProducts = await storage.getProductsBySKU(sku);
              
              if (existingProducts && existingProducts.length > 0) {
                await storage.updateProduct(existingProducts[0].id, {
                  image1: cloudflareUrl
                });
                results.productsUpdated++;
                results.details.push({ sku, cloudflareUrl, productUpdated: true });
              } else {
                results.details.push({ sku, cloudflareUrl, productUpdated: false });
              }
            } else {
              results.failed++;
              results.details.push({ sku, productUpdated: false, error: 'Upload failed' });
            }
          } catch (error) {
            results.failed++;
            results.details.push({ sku, productUpdated: false, error: String(error) });
          }
        }
        
        // Delay between batches
        if (i + batchSize < files.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log(`✅ Complete: ${results.uploaded} uploaded, ${results.productsUpdated} products updated`);
      
      res.json(results);
    } catch (error) {
      console.error("Error in upload and update:", error);
      res.status(500).json({ message: "Failed to process images" });
    }
  });
  
  // Test Cloudflare connection
  app.get("/api/cloudflare/test", requireAdmin, async (req, res) => {
    try {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      
      if (!accountId || !apiToken) {
        return res.json({ 
          connected: false, 
          message: "Cloudflare credentials not configured" 
        });
      }
      
      // Test the connection by listing images
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1?per_page=1`,
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
          },
        }
      );
      
      const result = await response.json();
      
      if (result.success) {
        res.json({ 
          connected: true, 
          message: "Cloudflare Images connection successful",
          imagesCount: result.result?.images?.length || 0
        });
      } else {
        res.json({ 
          connected: false, 
          message: "Cloudflare API error",
          errors: result.errors
        });
      }
    } catch (error) {
      console.error("Error testing Cloudflare connection:", error);
      res.json({ 
        connected: false, 
        message: `Connection error: ${error}` 
      });
    }
  });

  // Currency Management Routes
  app.get("/api/currencies", async (req, res) => {
    try {
      const currencies = await storage.getCurrencies();
      res.json(currencies);
    } catch (error) {
      console.error("Error fetching currencies:", error);
      res.status(500).json({ message: "Failed to fetch currencies" });
    }
  });

  app.get("/api/currencies/:id", async (req, res) => {
    try {
      const currency = await storage.getCurrency(req.params.id);
      if (!currency) {
        return res.status(404).json({ message: "Currency not found" });
      }
      res.json(currency);
    } catch (error) {
      console.error("Error fetching currency:", error);
      res.status(500).json({ message: "Failed to fetch currency" });
    }
  });

  app.post("/api/currencies", requireAdmin, async (req, res) => {
    try {
      const { code, name, symbol, isDefault, isActive } = req.body;
      if (!code || !name || !symbol) {
        return res.status(400).json({ message: "Code, name, and symbol are required" });
      }
      const existing = await storage.getCurrencyByCode(code);
      if (existing) {
        return res.status(400).json({ message: "Currency code already exists" });
      }
      const currency = await storage.createCurrency({
        code: code.toUpperCase(),
        name,
        symbol,
        isDefault: isDefault ?? false,
        isActive: isActive ?? true,
      });
      res.status(201).json(currency);
    } catch (error) {
      console.error("Error creating currency:", error);
      res.status(500).json({ message: "Failed to create currency" });
    }
  });

  app.patch("/api/currencies/:id", requireAdmin, async (req, res) => {
    try {
      const { name, symbol, isDefault, isActive } = req.body;
      const updated = await storage.updateCurrency(req.params.id, {
        ...(name && { name }),
        ...(symbol && { symbol }),
        ...(isDefault !== undefined && { isDefault }),
        ...(isActive !== undefined && { isActive }),
      });
      if (!updated) {
        return res.status(404).json({ message: "Currency not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating currency:", error);
      res.status(500).json({ message: "Failed to update currency" });
    }
  });

  app.delete("/api/currencies/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteCurrency(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Currency not found" });
      }
      res.json({ message: "Currency deleted successfully" });
    } catch (error) {
      console.error("Error deleting currency:", error);
      res.status(500).json({ message: "Failed to delete currency" });
    }
  });

  // Exchange Rate Routes
  app.get("/api/exchange-rates", async (req, res) => {
    try {
      const rates = await storage.getExchangeRates();
      res.json(rates);
    } catch (error) {
      console.error("Error fetching exchange rates:", error);
      res.status(500).json({ message: "Failed to fetch exchange rates" });
    }
  });

  app.post("/api/exchange-rates", requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { fromCurrency, toCurrency, rate } = req.body;
      if (!fromCurrency || !toCurrency || rate === undefined) {
        return res.status(400).json({ message: "fromCurrency, toCurrency, and rate are required" });
      }
      if (fromCurrency === toCurrency) {
        return res.status(400).json({ message: "From and to currencies must be different" });
      }
      const exchangeRate = await storage.setExchangeRate({
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        rate: rate.toString(),
        updatedBy: req.user?.id || null,
      });
      res.status(201).json(exchangeRate);
    } catch (error) {
      console.error("Error setting exchange rate:", error);
      res.status(500).json({ message: "Failed to set exchange rate" });
    }
  });

  app.delete("/api/exchange-rates/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteExchangeRate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Exchange rate not found" });
      }
      res.json({ message: "Exchange rate deleted successfully" });
    } catch (error) {
      console.error("Error deleting exchange rate:", error);
      res.status(500).json({ message: "Failed to delete exchange rate" });
    }
  });

  // Fetch live exchange rates from external API
  app.post("/api/exchange-rates/fetch-live", requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { baseCurrency } = req.body;
      if (!baseCurrency) {
        return res.status(400).json({ message: "baseCurrency is required" });
      }

      // Fetch rates from exchangerate-api.com (free tier)
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${baseCurrency.toUpperCase()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch exchange rates from external API");
      }

      const data = await response.json();
      const rates = data.rates;
      
      // Get all active currencies
      const currencies = await storage.getCurrencies();
      const activeCurrencies = currencies.filter(c => c.isActive);
      const updatedRates: any[] = [];

      // Update rates for all active currency pairs
      for (const fromCurrency of activeCurrencies) {
        for (const toCurrency of activeCurrencies) {
          if (fromCurrency.code === toCurrency.code) continue;
          
          let rate: number;
          if (fromCurrency.code === baseCurrency.toUpperCase()) {
            // Direct rate from base currency
            rate = rates[toCurrency.code];
          } else if (toCurrency.code === baseCurrency.toUpperCase()) {
            // Inverse rate to base currency
            rate = 1 / rates[fromCurrency.code];
          } else {
            // Cross rate through base currency
            const fromRate = rates[fromCurrency.code];
            const toRate = rates[toCurrency.code];
            if (fromRate && toRate) {
              rate = toRate / fromRate;
            } else {
              continue;
            }
          }

          if (rate && !isNaN(rate)) {
            const savedRate = await storage.setExchangeRate({
              fromCurrency: fromCurrency.code,
              toCurrency: toCurrency.code,
              rate: rate.toFixed(6),
              updatedBy: req.user?.id || null,
            });
            updatedRates.push(savedRate);
          }
        }
      }

      res.json({ 
        message: "Exchange rates updated successfully", 
        baseCurrency: baseCurrency.toUpperCase(),
        updatedCount: updatedRates.length,
        rates: updatedRates
      });
    } catch (error: any) {
      console.error("Error fetching live exchange rates:", error);
      res.status(500).json({ message: error.message || "Failed to fetch live exchange rates" });
    }
  });

  // Price conversion endpoint
  app.get("/api/convert-price", async (req, res) => {
    try {
      const { amount, from, to } = req.query;
      if (!amount || !from || !to) {
        return res.status(400).json({ message: "amount, from, and to are required query parameters" });
      }
      const converted = await storage.convertPrice(
        parseFloat(amount as string),
        (from as string).toUpperCase(),
        (to as string).toUpperCase()
      );
      res.json({ 
        originalAmount: parseFloat(amount as string),
        fromCurrency: from,
        toCurrency: to,
        convertedAmount: converted
      });
    } catch (error) {
      console.error("Error converting price:", error);
      res.status(500).json({ message: "Failed to convert price" });
    }
  });

  // ===== PRE-ORDER FULFILLMENT & WAREHOUSE MANAGEMENT =====

  // Get all pre-order orders (completed workflow orders that contain pre-order items)
  app.get("/api/admin/preorder-management/orders", requireAdmin, async (req, res) => {
    try {
      const allOrders = await db.select().from(orders).execute();
      const preOrders = allOrders.filter(o =>
        o.orderType === "pre-order" || o.orderType === "preorder" ||
        (o.items as any[])?.some?.((item: any) => item.sourceType === "preorder")
      );

      // For each pre-order, compute fulfillment summary
      const fulfillmentRecords = await db.select().from(preorderFulfillment).execute();
      const fulfillmentByOrder = new Map<string, any[]>();
      for (const f of fulfillmentRecords) {
        if (!fulfillmentByOrder.has(f.orderId)) fulfillmentByOrder.set(f.orderId, []);
        fulfillmentByOrder.get(f.orderId)!.push(f);
      }

      const enriched = await Promise.all(
        preOrders.map(async (order) => {
          let customerUsername: string | undefined;
          const existingName = (order.customerName && String(order.customerName).trim()) || "";
          let resolvedCustomerName = existingName;
          if (order.userId) {
            const user = await storage.getUser(order.userId);
            if (user?.username) customerUsername = user.username;
            if (!resolvedCustomerName) {
              resolvedCustomerName =
                (user?.displayName && String(user.displayName).trim()) ||
                (user?.username && String(user.username).trim()) ||
                "";
            }
          }
          const items = (order.items as any[]) || [];
          const fulfillments = fulfillmentByOrder.get(order.id) || [];
          const totalOrdered = items.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);
          const totalFulfilled = fulfillments.reduce((sum: number, f: any) => sum + (f.quantityFulfilled || 0), 0);
          let fulfillmentStatus: string = "unfulfilled";
          if (totalFulfilled >= totalOrdered && totalOrdered > 0) fulfillmentStatus = "fulfilled";
          else if (totalFulfilled > 0) fulfillmentStatus = "partially_fulfilled";
          return {
            ...order,
            customerName: resolvedCustomerName || order.customerName,
            customerUsername,
            fulfillmentSummary: { totalOrdered, totalFulfilled, fulfillmentStatus },
            fulfillmentDetails: fulfillments,
          };
        }),
      );

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching pre-order management orders:", error);
      res.status(500).json({ message: "Failed to fetch pre-orders" });
    }
  });

  // Get fulfillment records for a specific order
  app.get("/api/admin/preorder-management/orders/:orderId/fulfillment", requireAdmin, async (req, res) => {
    try {
      const { orderId } = req.params;
      const records = await db.select().from(preorderFulfillment).where(eq(preorderFulfillment.orderId, orderId)).execute();
      res.json(records);
    } catch (error) {
      console.error("Error fetching fulfillment:", error);
      res.status(500).json({ message: "Failed to fetch fulfillment records" });
    }
  });

  // Initialize fulfillment records for an order (called once when admin starts managing it)
  app.post("/api/admin/preorder-management/orders/:orderId/init-fulfillment", requireAdmin, async (req, res) => {
    try {
      const { orderId } = req.params;
      const order = await db.select().from(orders).where(eq(orders.id, orderId)).execute();
      if (!order.length) return res.status(404).json({ message: "Order not found" });

      const items = (order[0].items as any[]) || [];
      const existing = await db.select().from(preorderFulfillment).where(eq(preorderFulfillment.orderId, orderId)).execute();
      const existingKeys = new Set(existing.map(e => `${e.productId}|${e.sku}|${e.size}`));

      const newRecords = [];
      for (const item of items) {
        const key = `${item.productId}|${item.sku}|${item.size}`;
        if (!existingKeys.has(key)) {
          newRecords.push({
            orderId,
            productId: item.productId,
            sku: item.sku || "",
            size: item.size || "",
            quantityOrdered: item.quantity || 0,
            quantityFulfilled: 0,
            status: "unfulfilled" as const,
          });
        }
      }

      if (newRecords.length > 0) {
        await db.insert(preorderFulfillment).values(newRecords).execute();
      }

      const all = await db.select().from(preorderFulfillment).where(eq(preorderFulfillment.orderId, orderId)).execute();
      res.json(all);
    } catch (error) {
      console.error("Error initializing fulfillment:", error);
      res.status(500).json({ message: "Failed to initialize fulfillment" });
    }
  });

  // ---- Warehouse Shipments ----

  app.get("/api/admin/preorder-management/shipments", requireAdmin, async (req, res) => {
    try {
      const allShipments = await db.select().from(warehouseShipments).execute();
      const allItems = await db.select().from(shipmentItems).execute();
      const itemsByShipment = new Map<string, any[]>();
      for (const item of allItems) {
        if (!itemsByShipment.has(item.shipmentId)) itemsByShipment.set(item.shipmentId, []);
        itemsByShipment.get(item.shipmentId)!.push(item);
      }
      const enriched = allShipments.map(s => ({
        ...s,
        items: itemsByShipment.get(s.id) || [],
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching shipments:", error);
      res.status(500).json({ message: "Failed to fetch shipments" });
    }
  });

  app.post("/api/admin/preorder-management/shipments", requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { referenceNumber, supplierName, notes, expectedDate, items: shipItems } = req.body;
      const [shipment] = await db.insert(warehouseShipments).values({
        referenceNumber,
        supplierName,
        notes: notes || null,
        expectedDate: expectedDate || null,
        status: "pending",
        createdBy: req.user?.id || null,
      }).returning().execute();

      if (shipItems && shipItems.length > 0) {
        const itemValues = shipItems.map((item: any) => ({
          shipmentId: shipment.id,
          productId: item.productId,
          sku: item.sku,
          productName: item.productName,
          size: item.size,
          quantityExpected: item.quantityExpected || 0,
          quantityReceived: 0,
          quantityAllocated: 0,
        }));
        await db.insert(shipmentItems).values(itemValues).execute();
      }

      const items = await db.select().from(shipmentItems).where(eq(shipmentItems.shipmentId, shipment.id)).execute();
      res.json({ ...shipment, items });
    } catch (error) {
      console.error("Error creating shipment:", error);
      res.status(500).json({ message: "Failed to create shipment" });
    }
  });

  // Receive shipment items (mark quantities received)
  app.post("/api/admin/preorder-management/shipments/:shipmentId/receive", requireAdmin, async (req, res) => {
    try {
      const { shipmentId } = req.params;
      const { items: receivedItems } = req.body; // [{shipmentItemId, quantityReceived}]

      for (const ri of receivedItems) {
        await db.update(shipmentItems)
          .set({ quantityReceived: ri.quantityReceived })
          .where(eq(shipmentItems.id, ri.shipmentItemId))
          .execute();
      }

      // Update shipment status
      const allItems = await db.select().from(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentId)).execute();
      const allReceived = allItems.every(i => i.quantityReceived >= i.quantityExpected);
      const someReceived = allItems.some(i => i.quantityReceived > 0);

      let newStatus = "pending";
      if (allReceived) newStatus = "received";
      else if (someReceived) newStatus = "partially_received";

      await db.update(warehouseShipments)
        .set({ status: newStatus, receivedDate: allReceived ? new Date().toISOString() : null, updatedAt: new Date().toISOString() })
        .where(eq(warehouseShipments.id, shipmentId))
        .execute();

      const shipment = await db.select().from(warehouseShipments).where(eq(warehouseShipments.id, shipmentId)).execute();
      const items = await db.select().from(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentId)).execute();
      res.json({ ...shipment[0], items });
    } catch (error) {
      console.error("Error receiving shipment:", error);
      res.status(500).json({ message: "Failed to receive shipment" });
    }
  });

  app.delete("/api/admin/preorder-management/shipments/:shipmentId", requireAdmin, async (req, res) => {
    try {
      const { shipmentId } = req.params;
      await db.delete(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentId)).execute();
      await db.delete(warehouseShipments).where(eq(warehouseShipments.id, shipmentId)).execute();
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting shipment:", error);
      res.status(500).json({ message: "Failed to delete shipment" });
    }
  });

  // ---- Allocation: Admin distributes received stock to customer orders ----

  // Get available (unallocated) stock from received shipment items for a given product+size
  app.get("/api/admin/preorder-management/available-stock", requireAdmin, async (req, res) => {
    try {
      const { productId, sku, size } = req.query;
      let query = db.select().from(shipmentItems);
      const conditions = [];
      if (productId) conditions.push(eq(shipmentItems.productId, productId as string));
      if (sku) conditions.push(eq(shipmentItems.sku, sku as string));
      if (size) conditions.push(eq(shipmentItems.size, size as string));

      const items = conditions.length > 0
        ? await query.where(and(...conditions)).execute()
        : await query.execute();

      const available = items.map(item => ({
        ...item,
        availableToAllocate: item.quantityReceived - item.quantityAllocated,
      })).filter(item => item.availableToAllocate > 0);

      res.json(available);
    } catch (error) {
      console.error("Error fetching available stock:", error);
      res.status(500).json({ message: "Failed to fetch available stock" });
    }
  });

  // Allocate stock from a shipment item to an order line
  app.post("/api/admin/preorder-management/allocate", requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { shipmentItemId, orderId, productId, sku, size, quantity, notes } = req.body;

      // Validate available stock
      const [si] = await db.select().from(shipmentItems).where(eq(shipmentItems.id, shipmentItemId)).execute();
      if (!si) return res.status(404).json({ message: "Shipment item not found" });

      const availableToAllocate = si.quantityReceived - si.quantityAllocated;
      if (quantity > availableToAllocate) {
        return res.status(400).json({ message: `Only ${availableToAllocate} units available to allocate` });
      }

      // Create allocation record
      const [allocation] = await db.insert(preorderAllocations).values({
        shipmentItemId,
        orderId,
        productId,
        sku,
        size,
        quantityAllocated: quantity,
        status: "allocated",
        allocatedBy: req.user?.id || null,
        notes: notes || null,
      }).returning().execute();

      // Update shipment item allocated count
      await db.update(shipmentItems)
        .set({ quantityAllocated: si.quantityAllocated + quantity })
        .where(eq(shipmentItems.id, shipmentItemId))
        .execute();

      // Update fulfillment record for the order line
      const [fulfillment] = await db.select().from(preorderFulfillment)
        .where(and(
          eq(preorderFulfillment.orderId, orderId),
          eq(preorderFulfillment.productId, productId),
          eq(preorderFulfillment.size, size),
        )).execute();

      if (fulfillment) {
        const newFulfilled = fulfillment.quantityFulfilled + quantity;
        let newStatus = "unfulfilled";
        if (newFulfilled >= fulfillment.quantityOrdered) newStatus = "fulfilled";
        else if (newFulfilled > 0) newStatus = "partially_fulfilled";

        await db.update(preorderFulfillment)
          .set({ quantityFulfilled: newFulfilled, status: newStatus, updatedAt: new Date().toISOString() })
          .where(eq(preorderFulfillment.id, fulfillment.id))
          .execute();
      }

      res.json(allocation);
    } catch (error) {
      console.error("Error allocating stock:", error);
      res.status(500).json({ message: "Failed to allocate stock" });
    }
  });

  // Get all allocations (optionally filtered by orderId or shipmentItemId)
  app.get("/api/admin/preorder-management/allocations", requireAdmin, async (req, res) => {
    try {
      const { orderId, shipmentItemId } = req.query;
      const conditions = [];
      if (orderId) conditions.push(eq(preorderAllocations.orderId, orderId as string));
      if (shipmentItemId) conditions.push(eq(preorderAllocations.shipmentItemId, shipmentItemId as string));

      const allocs = conditions.length > 0
        ? await db.select().from(preorderAllocations).where(and(...conditions)).execute()
        : await db.select().from(preorderAllocations).execute();

      res.json(allocs);
    } catch (error) {
      console.error("Error fetching allocations:", error);
      res.status(500).json({ message: "Failed to fetch allocations" });
    }
  });

  // Revoke/cancel an allocation
  app.delete("/api/admin/preorder-management/allocations/:allocationId", requireAdmin, async (req, res) => {
    try {
      const { allocationId } = req.params;
      const [alloc] = await db.select().from(preorderAllocations).where(eq(preorderAllocations.id, allocationId)).execute();
      if (!alloc) return res.status(404).json({ message: "Allocation not found" });

      // Revert shipment item allocated count
      const [si] = await db.select().from(shipmentItems).where(eq(shipmentItems.id, alloc.shipmentItemId)).execute();
      if (si) {
        await db.update(shipmentItems)
          .set({ quantityAllocated: Math.max(0, si.quantityAllocated - alloc.quantityAllocated) })
          .where(eq(shipmentItems.id, si.id))
          .execute();
      }

      // Revert fulfillment record
      const [fulfillment] = await db.select().from(preorderFulfillment)
        .where(and(
          eq(preorderFulfillment.orderId, alloc.orderId),
          eq(preorderFulfillment.productId, alloc.productId),
          eq(preorderFulfillment.size, alloc.size),
        )).execute();

      if (fulfillment) {
        const newFulfilled = Math.max(0, fulfillment.quantityFulfilled - alloc.quantityAllocated);
        let newStatus = "unfulfilled";
        if (newFulfilled >= fulfillment.quantityOrdered) newStatus = "fulfilled";
        else if (newFulfilled > 0) newStatus = "partially_fulfilled";

        await db.update(preorderFulfillment)
          .set({ quantityFulfilled: newFulfilled, status: newStatus, updatedAt: new Date().toISOString() })
          .where(eq(preorderFulfillment.id, fulfillment.id))
          .execute();
      }

      await db.delete(preorderAllocations).where(eq(preorderAllocations.id, allocationId)).execute();
      res.json({ success: true });
    } catch (error) {
      console.error("Error revoking allocation:", error);
      res.status(500).json({ message: "Failed to revoke allocation" });
    }
  });

  // ---- Dashboard summary for pre-order management ----
  app.get("/api/admin/preorder-management/summary", requireAdmin, async (req, res) => {
    try {
      const allOrders = await db.select().from(orders).execute();
      const preOrders = allOrders.filter(o =>
        o.orderType === "pre-order" || o.orderType === "preorder" ||
        (o.items as any[])?.some?.((item: any) => item.sourceType === "preorder")
      );

      const fulfillmentRecords = await db.select().from(preorderFulfillment).execute();
      const allShipments = await db.select().from(warehouseShipments).execute();
      const allShipmentItems = await db.select().from(shipmentItems).execute();
      const allAllocations = await db.select().from(preorderAllocations).execute();

      const totalPreOrders = preOrders.length;
      const totalItemsOrdered = fulfillmentRecords.reduce((s, f) => s + f.quantityOrdered, 0);
      const totalItemsFulfilled = fulfillmentRecords.reduce((s, f) => s + f.quantityFulfilled, 0);
      const fullyFulfilledOrders = new Set<string>();
      const partialOrders = new Set<string>();

      const byOrder = new Map<string, any[]>();
      for (const f of fulfillmentRecords) {
        if (!byOrder.has(f.orderId)) byOrder.set(f.orderId, []);
        byOrder.get(f.orderId)!.push(f);
      }
      for (const [oid, recs] of byOrder) {
        const allDone = recs.every((r: any) => r.quantityFulfilled >= r.quantityOrdered);
        const someDone = recs.some((r: any) => r.quantityFulfilled > 0);
        if (allDone) fullyFulfilledOrders.add(oid);
        else if (someDone) partialOrders.add(oid);
      }

      const totalShipments = allShipments.length;
      const pendingShipments = allShipments.filter(s => s.status === "pending" || s.status === "in_transit").length;
      const totalReceived = allShipmentItems.reduce((s, i) => s + i.quantityReceived, 0);
      const totalAllocated = allAllocations.reduce((s, a) => s + a.quantityAllocated, 0);
      const unallocatedStock = totalReceived - totalAllocated;

      res.json({
        totalPreOrders,
        totalItemsOrdered,
        totalItemsFulfilled,
        fullyFulfilledOrders: fullyFulfilledOrders.size,
        partiallyFulfilledOrders: partialOrders.size,
        unfulfilledOrders: totalPreOrders - fullyFulfilledOrders.size - partialOrders.size,
        totalShipments,
        pendingShipments,
        totalReceived,
        totalAllocated,
        unallocatedStock: Math.max(0, unallocatedStock),
      });
    } catch (error) {
      console.error("Error fetching preorder summary:", error);
      res.status(500).json({ message: "Failed to fetch summary" });
    }
  });

  const httpServer = createServer(app);
  // Allow long-running upload/processing (set-header, analyze, process for 100K+ rows)
  httpServer.timeout = 30 * 60 * 1000; // 30 minutes
  httpServer.keepAliveTimeout = 65000;  // Slightly above typical load balancer (60s) to avoid race
  return httpServer;
}
