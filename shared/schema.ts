import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User roles for the order workflow
export const USER_ROLES = ["customer", "account_manager", "sales", "finance", "warehouse", "admin"] as const;
export type UserRole = typeof USER_ROLES[number];

// Order workflow stages
export const WORKFLOW_STAGES = [
  "new_order",                 // Customer submission - goes to Account Manager
  "account_manager_approval",  // Account Manager approval (first mandatory step)
  "sales_approval",            // Sales approval
  "finance_approval",          // Finance approval
  "admin_approval",            // Admin final approval
  "completed",                 // Order completed - user notified
  "rejected"                   // Order rejected at any stage
] as const;
export type WorkflowStage = typeof WORKFLOW_STAGES[number];

// Mapping of which role handles which stage
export const STAGE_ROLE_MAP: Record<WorkflowStage, UserRole | null> = {
  new_order: null,
  account_manager_approval: "account_manager",
  sales_approval: "sales",
  finance_approval: "finance",
  admin_approval: "admin",
  completed: null,
  rejected: null,
};

// Next stage progression
export const NEXT_STAGE: Partial<Record<WorkflowStage, WorkflowStage>> = {
  new_order: "account_manager_approval",
  account_manager_approval: "sales_approval",
  sales_approval: "finance_approval",
  finance_approval: "admin_approval",
  admin_approval: "completed",
};

// Payment and Delivery method options
export const PAYMENT_METHODS = ["cheques", "bank_transfer", "cash"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const DELIVERY_METHODS = ["pickup_from_warehouse", "delivery_to_store"] as const;
export type DeliveryMethod = typeof DELIVERY_METHODS[number];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password"),
  role: text("role").notNull().default("customer"), // UserRole type
  googleId: text("google_id").unique(),
  email: text("email").unique(),
  displayName: text("display_name"),
  profilePicture: text("profile_picture"),
  preferredCurrency: text("preferred_currency").default("USD"),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const customerProfiles = pgTable("customer_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  
  // Company Information
  legalName: text("legal_name"),
  tradingName: text("trading_name"),
  type: text("type").notNull().default("Retail"), // "Retail" | "Wholesale" | "Distributor"
  status: text("status").notNull().default("Active"), // "Active" | "On-Hold" | "Suspended"
  
  // Tax & Registration
  taxVatNumber: text("tax_vat_number"),
  registrationCountry: text("registration_country"), // ISO country code
  
  // Contact Information
  primaryContactName: text("primary_contact_name"),
  email: text("email"),
  phone: text("phone"),
  phoneNumbers: jsonb("phone_numbers").$type<string[]>().default([]),
  
  // Business Details (admin-created customer accounts)
  businessName: text("business_name"),
  ownerName: text("owner_name"),
  licenseNumber: text("license_number"),
  
  // Document Photos
  tradeLicensePhotoUrl: text("trade_license_photo_url"),
  idPhotoUrl: text("id_photo_url"),
  storePhotoUrls: jsonb("store_photo_urls").$type<string[]>().default([]),
  
  // Address Information
  billingAddress: jsonb("billing_address").$type<{
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  }>(),
  shippingAddresses: jsonb("shipping_addresses").$type<Array<{
    label: string;
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
    isDefault: boolean;
  }>>().default([]),
  
  // Categorization
  segmentsTags: jsonb("segments_tags").$type<string[]>().default([]), // e.g. ["VIP", "Footwear", "Seasonal"]
  
  // Order Type Permissions - controls what types of orders customer can place
  allowPreOrders: boolean("allow_pre_orders").notNull().default(true),
  
  // Financial & Status
  businessType: text("business_type"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"), // Tax rate percentage
  creditLimit: decimal("credit_limit", { precision: 10, scale: 2 }).default("0"),
  isBlacklisted: boolean("is_blacklisted").notNull().default(false),
  blacklistReason: text("blacklist_reason"),
  notes: text("notes"),
  
  // Account Manager Assignment
  accountManagerId: varchar("account_manager_id").references(() => users.id),
  
  // Currency preference - customer's default display currency
  defaultCurrency: text("default_currency").notNull().default("USD"), // ISO 4217 code
  
  createdAt: text("created_at").notNull().default(sql`now()`),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  barcode: text("barcode"),
  category: text("category").notNull(),
  brand: varchar("brand").notNull().references(() => brands.id),
  gender: text("gender").notNull(), // Legacy field - kept for backward compatibility
  // Three-Layer Category System
  mainCategory: text("main_category"), // Layer 1: MEN, WOMEN, ADULT UNISEX, KIDS
  kidsGender: text("kids_gender"), // Layer 2 (only for KIDS): BOYS, GIRLS, UNISEX
  kidsAgeGroup: text("kids_age_group"), // Layer 3 (only for KIDS): NEW BORN, JUNIOR, LARGE, KIDS
  description: text("description"),
  wholesalePrice: decimal("wholesale_price", { precision: 10, scale: 2 }).notNull(),
  retailPrice: decimal("retail_price", { precision: 10, scale: 2 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }), // Cost/purchase price
  imageUrl: text("image_url").notNull().default(''), // Legacy primary image field (database requires NOT NULL)
  image1: text("image1").notNull().default(''), // Primary image 
  image2: text("image2"), // Additional image 2
  image3: text("image3"), // Additional image 3
  image4: text("image4"), // Additional image 4
  availableSizes: jsonb("available_sizes").$type<{size: string, stock: number, limitOrder?: number}[]>().notNull().default([]),
  inStock: boolean("in_stock").notNull().default(true),
  stockLevel: text("stock_level").notNull().default("in_stock"), // "in_stock", "low_stock", "out_of_stock"
  collections: jsonb("collections").$type<string[]>().notNull().default([]),
  stockMatrix: jsonb("stock_matrix").$type<any>(),
  stock: integer("stock").notNull().default(0), // Total stock from Stock/Quantity* mapping - source of truth for inventory
  reservedStock: integer("reserved_stock").notNull().default(0), // Units reserved by submitted (non-draft, non-completed, non-rejected) orders
  minOrder: integer("min_order").notNull().default(1),
  countryOfOrigin: text("country_of_origin"),
  division: text("division"), // RBU field from Excel (e.g., "Teamsport", "Running")
  isPreOrder: boolean("is_pre_order").notNull().default(false),
  // Additional product metadata fields
  keyCategory: text("key_category"),
  colourway: text("colourway"),
  primaryColor: text("primary_color"), // Detected primary color for filtering (Black, White, Red, Blue, Green, Gray, Brown, Yellow, Orange, Pink, Purple, Other)
  ageGroup: text("age_group"),
  corporateMarketingLine: text("corporate_marketing_line"),
  productLine: text("product_line"),
  productType: text("product_type"),
  sportsCategory: text("sports_category"),
  moq: integer("moq"), // Minimum Order Quantity
  limitOrder: integer("limit_order"), // Maximum quantity a customer can order (null = unlimited)
  conditions: text("conditions"),
  materialComposition: text("material_composition"),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  unitsPerCarton: integer("units_per_carton"), // Number of units per carton for carton-sold products
  unitsPerSize: jsonb("units_per_size").$type<Record<string, number>>().default({}), // Units per size for carton-sold products, e.g. {"36": 2, "37": 3}
  // Raw attributes from Excel upload - stores all original column values
  rawAttributes: jsonb("raw_attributes").$type<Record<string, string>>().default({}),
  // Currency - base currency for this product's prices
  baseCurrency: text("base_currency").notNull().default("USD"), // ISO 4217 code
});

export const cartItems = pgTable("cart_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(),
  productId: varchar("product_id").notNull().references(() => products.id),
  batchName: text("batch_name").notNull(),
  selections: jsonb("selections").$type<{size: string, quantity: number}[]>().notNull().default([]),
  sourceType: text("source_type").$type<'preorder' | 'stock'>().notNull().default('stock'),
});

export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  iconUrl: text("icon_url"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

// Size Charts - reusable size definitions that can be assigned to collections
export const sizeCharts = pgTable("size_charts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  sizes: jsonb("sizes").$type<string[]>().notNull().default([]), // List of sizes in order, e.g. ["36", "37", "38", "39", "40"]
  unitsPerSize: jsonb("units_per_size").$type<Record<string, number>>().default({}), // Units per size for carton-sold products, e.g. {"36": 2, "37": 3, "38": 3, "39": 2, "40": 2}
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const insertSizeChartSchema = createInsertSchema(sizeCharts).omit({ id: true, createdAt: true });
export type InsertSizeChart = z.infer<typeof insertSizeChartSchema>;
export type SizeChart = typeof sizeCharts.$inferSelect;

export const collections = pgTable("collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  discount: decimal("discount", { precision: 5, scale: 2 }).notNull().default("0"),
  validFrom: text("valid_from"),
  validTo: text("valid_to"),
  productIds: jsonb("product_ids").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  imageUrl: text("image_url"),
  priority: integer("priority").notNull().default(0),
  sizeChartId: varchar("size_chart_id"), // Reference to the size chart for this collection
  baseCurrency: text("base_currency").notNull().default("USD"), // Base currency for collection pricing
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const brands = pgTable("brands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  collectionId: varchar("collection_id"),
  logoUrl: text("logo_url"),
  description: text("description"),
  sizeStandards: jsonb("size_standards").$type<Record<string, { EU?: string[]; US?: string[]; UK?: string[] }>>(),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(),
  userId: varchar("user_id").references(() => users.id),
  orderName: text("order_name"),
  nickname: text("nickname"),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  shippingAddress: text("shipping_address"),
  items: jsonb("items").$type<{
    productId: string;
    productName: string;
    sku: string;
    brand: string;
    size: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[]>().notNull().default([]),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  orderType: text("order_type").notNull().default("regular"),
  status: text("status").notNull().default("draft"),
  approvalStatus: text("approval_status").notNull().default("pending"),
  // Workflow stage tracking
  workflowStage: text("workflow_stage").notNull().default("new_order"), // WorkflowStage type
  workflowHistory: jsonb("workflow_history").$type<{
    stage: string;
    action: string;
    userId: string | null;
    userName: string | null;
    timestamp: string;
    notes?: string;
  }[]>().default([]),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: text("approved_at"),
  rejectionReason: text("rejection_reason"),
  validationErrors: jsonb("validation_errors").$type<string[]>().default([]),
  // Account Manager approval fields
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
  paymentMethod: text("payment_method"), // 'cheques' | 'card' | 'cash'
  deliveryMethod: text("delivery_method"), // 'pickup_from_warehouse' | 'delivery_to_store'
  accountManagerApprovedBy: varchar("account_manager_approved_by").references(() => users.id),
  accountManagerApprovedAt: text("account_manager_approved_at"),
  // Account Manager order creation (when AM creates order on behalf of customer)
  createdByAccountManagerId: varchar("created_by_account_manager_id").references(() => users.id),
  createdByAccountManagerName: text("created_by_account_manager_name"),

  /** Audit trail when staff reduces/removes lines; shown to customer on order history */
  itemsRemovedByStaff: jsonb("items_removed_by_staff").$type<
    Array<{
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
    }>
  >()
    .default([]),

  createdAt: text("created_at").notNull().default(sql`now()`),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

export const stockBatches = pgTable("stock_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  status: text("status").notNull().default("processing"), // "processing", "completed", "failed"
  recordsProcessed: integer("records_processed").notNull().default(0),
  recordsTotal: integer("records_total").notNull().default(0),
  errorLog: jsonb("error_log").$type<string[]>().default([]),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const stockAdjustments = pgTable("stock_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id").references(() => stockBatches.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  sku: text("sku").notNull(),
  color: text("color").notNull(),
  size: text("size").notNull(),
  previousStock: integer("previous_stock").notNull().default(0),
  newStock: integer("new_stock").notNull(),
  adjustmentType: text("adjustment_type").notNull(), // "upload", "manual", "sale", "return"
  reason: text("reason"),
  adjustedBy: text("adjusted_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const preorderCollectionSettings = pgTable("preorder_collection_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionName: text("collection_name").notNull().unique(),
  collectionType: text("collection_type").notNull().default("preorder"), // "preorder" or "stock"
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

// ===== PRE-ORDER FULFILLMENT & WAREHOUSE MANAGEMENT =====

export const SHIPMENT_STATUSES = ["pending", "in_transit", "partially_received", "received", "cancelled"] as const;
export type ShipmentStatus = typeof SHIPMENT_STATUSES[number];

export const ALLOCATION_STATUSES = ["pending", "allocated", "shipped", "delivered", "cancelled"] as const;
export type AllocationStatus = typeof ALLOCATION_STATUSES[number];

export const PREORDER_FULFILLMENT_STATUSES = ["unfulfilled", "partially_fulfilled", "fulfilled"] as const;
export type PreorderFulfillmentStatus = typeof PREORDER_FULFILLMENT_STATUSES[number];

// Warehouse shipments - incoming stock from suppliers (e.g. Adidas ships 50 of 100 ordered units)
export const warehouseShipments = pgTable("warehouse_shipments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referenceNumber: text("reference_number").notNull(), // e.g. "SHP-2026-001"
  supplierName: text("supplier_name").notNull(), // brand/supplier name
  status: text("status").notNull().default("pending"), // ShipmentStatus
  notes: text("notes"),
  expectedDate: text("expected_date"),
  receivedDate: text("received_date"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`now()`),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

// Individual line items within a shipment — variant-level tracking
export const shipmentItems = pgTable("shipment_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull().references(() => warehouseShipments.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  sku: text("sku").notNull(),
  productName: text("product_name").notNull(),
  size: text("size").notNull(),
  quantityExpected: integer("quantity_expected").notNull().default(0),
  quantityReceived: integer("quantity_received").notNull().default(0),
  quantityAllocated: integer("quantity_allocated").notNull().default(0), // how much has been distributed to orders
  createdAt: text("created_at").notNull().default(sql`now()`),
});

// Allocations — admin manually distributes received stock to specific customer order line items
export const preorderAllocations = pgTable("preorder_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentItemId: varchar("shipment_item_id").notNull().references(() => shipmentItems.id),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  sku: text("sku").notNull(),
  size: text("size").notNull(),
  quantityAllocated: integer("quantity_allocated").notNull(),
  status: text("status").notNull().default("allocated"), // AllocationStatus
  allocatedBy: varchar("allocated_by").references(() => users.id),
  allocatedAt: text("allocated_at").notNull().default(sql`now()`),
  notes: text("notes"),
});

// Per-order, per-item fulfillment tracking — shows how much of each line item is fulfilled
export const preorderFulfillment = pgTable("preorder_fulfillment", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  sku: text("sku").notNull(),
  size: text("size").notNull(),
  quantityOrdered: integer("quantity_ordered").notNull(),
  quantityFulfilled: integer("quantity_fulfilled").notNull().default(0),
  status: text("status").notNull().default("unfulfilled"), // PreorderFulfillmentStatus
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

export const insertWarehouseShipmentSchema = createInsertSchema(warehouseShipments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShipmentItemSchema = createInsertSchema(shipmentItems).omit({ id: true, createdAt: true });
export const insertPreorderAllocationSchema = createInsertSchema(preorderAllocations).omit({ id: true, allocatedAt: true });
export const insertPreorderFulfillmentSchema = createInsertSchema(preorderFulfillment).omit({ id: true, updatedAt: true });

export type WarehouseShipment = typeof warehouseShipments.$inferSelect;
export type InsertWarehouseShipment = z.infer<typeof insertWarehouseShipmentSchema>;
export type ShipmentItem = typeof shipmentItems.$inferSelect;
export type InsertShipmentItem = z.infer<typeof insertShipmentItemSchema>;
export type PreorderAllocation = typeof preorderAllocations.$inferSelect;
export type InsertPreorderAllocation = z.infer<typeof insertPreorderAllocationSchema>;
export type PreorderFulfillmentRecord = typeof preorderFulfillment.$inferSelect;
export type InsertPreorderFulfillment = z.infer<typeof insertPreorderFulfillmentSchema>;

// Site Settings - key/value store for admin-configurable settings (e.g. hero image)
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

export type SiteSetting = typeof siteSettings.$inferSelect;

// Currency Management - supported currencies in the system
export const DEFAULT_CURRENCIES = ["ILS", "USD", "EUR", "JOD", "GBP"] as const;
export type DefaultCurrency = typeof DEFAULT_CURRENCIES[number];

export const currencies = pgTable("currencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // ISO 4217 code (e.g., USD, EUR, ILS)
  name: text("name").notNull(), // Full name (e.g., "US Dollar")
  symbol: text("symbol").notNull(), // Currency symbol (e.g., "$", "€", "₪")
  isDefault: boolean("is_default").notNull().default(false), // One of the 5 default currencies
  isActive: boolean("is_active").notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

// Exchange rates - admin-defined rates between currencies
export const exchangeRates = pgTable("exchange_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromCurrency: text("from_currency").notNull(), // Source currency code
  toCurrency: text("to_currency").notNull(), // Target currency code
  rate: decimal("rate", { precision: 18, scale: 8 }).notNull(), // Exchange rate (how many toCurrency per 1 fromCurrency)
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertCustomerProfileSchema = createInsertSchema(customerProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  createdAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
});

export const insertCartItemSchema = createInsertSchema(cartItems).omit({
  id: true,
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
});

export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true,
  createdAt: true,
});

export const insertBrandSchema = createInsertSchema(brands).omit({
  id: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
});

export const insertStockBatchSchema = createInsertSchema(stockBatches).omit({
  id: true,
  createdAt: true,
});

export const insertStockAdjustmentSchema = createInsertSchema(stockAdjustments).omit({
  id: true,
  createdAt: true,
}).extend({
  color: z.string().nullable().transform(val => val || 'default'),
  size: z.string().nullable().transform(val => val || 'default'),
  previousStock: z.number().nullable().transform(val => val ?? 0),
});

export const insertCurrencySchema = createInsertSchema(currencies).omit({
  id: true,
  createdAt: true,
});

export const insertExchangeRateSchema = createInsertSchema(exchangeRates).omit({
  id: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type CustomerProfile = typeof customerProfiles.$inferSelect;
export type InsertCustomerProfile = z.infer<typeof insertCustomerProfileSchema>;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Collection = typeof collections.$inferSelect;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type Brand = typeof brands.$inferSelect;
export type InsertBrand = z.infer<typeof insertBrandSchema>;
export type CartItem = typeof cartItems.$inferSelect;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type StockBatch = typeof stockBatches.$inferSelect;
export type InsertStockBatch = z.infer<typeof insertStockBatchSchema>;
export type StockAdjustment = typeof stockAdjustments.$inferSelect;
export type InsertStockAdjustment = z.infer<typeof insertStockAdjustmentSchema>;
export type Currency = typeof currencies.$inferSelect;
export type InsertCurrency = z.infer<typeof insertCurrencySchema>;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type InsertExchangeRate = z.infer<typeof insertExchangeRateSchema>;

// Analytics data types
export interface AnalyticsSummary {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  totalProducts: number;
  totalCategories: number;
  totalBrands: number;
  totalCartItems: number;
  cartAbandonmentRate: number;
}

export interface OrderTrend {
  date: string;
  orders: number;
  revenue: number;
  avgOrderValue: number;
}

export interface RevenueBreakdown {
  name: string;
  value: number;
  percentage: number;
  count: number;
}

export interface ProductPerformance {
  productId: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  totalOrdered: number;
  totalRevenue: number;
  avgPrice: number;
  popularColors: string[];
  popularSizes: string[];
}

export interface CartAnalytics {
  totalCarts: number;
  totalAbandonedCarts: number;
  avgItemsPerCart: number;
  avgCartValue: number;
  topAbandonedProducts: {
    productId: string;
    name: string;
    abandonedCount: number;
  }[];
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
  category?: string;
}

export interface DrillDownData {
  level: 'summary' | 'category' | 'brand';
  parentId?: string;
  parentName?: string;
  data: RevenueBreakdown[];
}
