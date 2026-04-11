import { type User, type InsertUser, type CustomerProfile, type InsertCustomerProfile, type Product, type InsertProduct, type Brand, type InsertBrand, type Category, type InsertCategory, type Collection, type InsertCollection, type CartItem, type InsertCartItem, type Order, type InsertOrder, type StockBatch, type InsertStockBatch, type StockAdjustment, type InsertStockAdjustment, type AnalyticsSummary, type OrderTrend, type RevenueBreakdown, type ProductPerformance, type CartAnalytics, type DrillDownData, type Currency, type InsertCurrency, type ExchangeRate, type InsertExchangeRate } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { detectPrimaryColor } from "./utils/colorDetection";
import { products as productsTable, brands as brandsTable, categories as categoriesTable, users as usersTable, customerProfiles as customerProfilesTable, orders as ordersTable, collections as collectionsTable, currencies as currenciesTable, exchangeRates as exchangeRatesTable } from "@shared/schema";
import { eq, and, or, sql, inArray, like } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUser(user: Partial<User> & { id: string }): Promise<User>;
  
  // Customer Profile methods
  getCustomerProfile(userId: string): Promise<CustomerProfile | undefined>;
  getCustomerProfilesByAccountManager(accountManagerId: string): Promise<CustomerProfile[]>;
  createCustomerProfile(profile: InsertCustomerProfile): Promise<CustomerProfile>;
  updateCustomerProfile(userId: string, profile: Partial<CustomerProfile>): Promise<CustomerProfile | undefined>;
  
  // Brand methods
  getBrands(): Promise<Brand[]>;
  getBrand(id: string): Promise<Brand | undefined>;
  createBrand(brand: InsertBrand): Promise<Brand>;
  updateBrand(id: string, brand: Partial<Brand>): Promise<Brand | undefined>;
  deleteBrand(id: string): Promise<boolean>;
  
  // Category methods
  getCategories(): Promise<Category[]>;
  getCategory(id: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, category: Partial<Category>): Promise<Category | undefined>;
  deleteCategory(id: string): Promise<boolean>;
  
  // Collection methods
  getCollections(): Promise<Collection[]>;
  getCollectionsByCategory(categoryId: string): Promise<Collection[]>;
  getCollection(id: string): Promise<Collection | undefined>;
  createCollection(collection: InsertCollection): Promise<Collection>;
  updateCollection(id: string, collection: Partial<Collection>): Promise<Collection | undefined>;
  deleteCollection(id: string): Promise<boolean>;
  
  // Product methods
  getProducts(filters?: {
    category?: string;
    brand?: string;
    collections?: string[];
    minPrice?: number;
    maxPrice?: number;
    sizes?: string[];
    search?: string;
    styles?: string[];
    ageRanges?: string[];
    occasions?: string[];
    genders?: string[];
    colors?: string[];
    supplierLocations?: string[];
    isPreOrder?: boolean;
    mainCategories?: string[];
    kidsGenders?: string[];
    kidsAgeGroups?: string[];
    divisions?: string[];
  }): Promise<Product[]>;
  getProductCountsByBrand(filters?: { isPreOrder?: boolean; excludeCollections?: string[] }): Promise<Record<string, number>>;
  getFilteredProductCount(filters?: {
    category?: string;
    brand?: string;
    collections?: string[];
    minPrice?: number;
    maxPrice?: number;
    sizes?: string[];
    search?: string;
    styles?: string[];
    ageRanges?: string[];
    occasions?: string[];
    genders?: string[];
    colors?: string[];
    supplierLocations?: string[];
    isPreOrder?: boolean;
    mainCategories?: string[];
    kidsGenders?: string[];
    kidsAgeGroups?: string[];
    divisions?: string[];
    excludeCollections?: string[];
  }): Promise<number>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, updates: Partial<Product>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;
  deleteProducts(ids: string[]): Promise<number>;
  getProductsBySKU(sku: string): Promise<Product[]>;
  
  // Cart methods
  getCartItems(sessionId: string): Promise<CartItem[]>;
  addCartItem(cartItem: InsertCartItem): Promise<CartItem>;
  updateCartItem(id: string, cartItem: Partial<CartItem>): Promise<CartItem | undefined>;
  removeCartItem(id: string): Promise<boolean>;
  clearCart(sessionId: string): Promise<boolean>;
  
  // Order methods
  createOrder(order: InsertOrder): Promise<Order>;
  getOrders(sessionId?: string, userId?: string): Promise<Order[]>;
  getAllOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined>;
  deleteOrder(id: string): Promise<boolean>;
  approveOrder(id: string, adminId: string): Promise<Order | undefined>;
  rejectOrder(id: string, adminId: string, reason: string): Promise<Order | undefined>;
  
  // Analytics methods
  getAnalyticsSummary(): Promise<AnalyticsSummary>;
  getOrderTrends(dateRange?: { from: string; to: string }): Promise<OrderTrend[]>;
  getRevenueBreakdown(type: 'category' | 'brand', parentId?: string): Promise<RevenueBreakdown[]>;
  getProductPerformance(limit?: number, category?: string, brand?: string): Promise<ProductPerformance[]>;
  getCartAnalytics(): Promise<CartAnalytics>;
  getDrillDownData(level: 'summary' | 'category' | 'brand', parentId?: string): Promise<DrillDownData>;
  
  // Stock management methods
  createStockBatch(batch: InsertStockBatch): Promise<StockBatch>;
  getStockBatch(id: string): Promise<StockBatch | undefined>;
  getStockBatches(): Promise<StockBatch[]>;
  updateStockBatch(id: string, updates: Partial<StockBatch>): Promise<StockBatch | undefined>;
  
  createStockAdjustment(adjustment: InsertStockAdjustment): Promise<StockAdjustment>;
  getStockAdjustments(filters?: { batchId?: string; productId?: string }): Promise<StockAdjustment[]>;
  getProductStockHistory(productId: string): Promise<StockAdjustment[]>;
  
  // Currency methods
  getCurrencies(): Promise<Currency[]>;
  getCurrency(id: string): Promise<Currency | undefined>;
  getCurrencyByCode(code: string): Promise<Currency | undefined>;
  createCurrency(currency: InsertCurrency): Promise<Currency>;
  updateCurrency(id: string, currency: Partial<Currency>): Promise<Currency | undefined>;
  deleteCurrency(id: string): Promise<boolean>;
  
  // Exchange rate methods
  getExchangeRates(): Promise<ExchangeRate[]>;
  getExchangeRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRate | undefined>;
  setExchangeRate(rate: InsertExchangeRate): Promise<ExchangeRate>;
  deleteExchangeRate(id: string): Promise<boolean>;
  convertPrice(amount: number, fromCurrency: string, toCurrency: string): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private brands: Map<string, Brand>;
  private categories: Map<string, Category>;
  private collections: Map<string, Collection>;
  private products: Map<string, Product>;
  private cartItems: Map<string, CartItem>;
  private orders: Map<string, Order>;
  private stockBatches: Map<string, StockBatch>;
  private stockAdjustments: Map<string, StockAdjustment>;

  constructor() {
    this.users = new Map();
    this.brands = new Map();
    this.categories = new Map();
    this.collections = new Map();
    this.products = new Map();
    this.cartItems = new Map();
    this.orders = new Map();
    this.stockBatches = new Map();
    this.stockAdjustments = new Map();
    
    // Sync initialization only
    this.initializeCategories();
    this.initializeCollections();
    this.initializeSampleOrders();
  }
  
  async init() {
    // Async initialization - must be called after construction
    await this.initializeBrands();
    await this.seedProducts();
  }

  private async seedProducts() {
    // Check if products already exist in database
    const existingProducts = await db.select().from(productsTable).limit(1);
    if (existingProducts.length > 0) {
      return; // Already seeded
    }
    
    // Check if there are any brands in the database (user has their own data)
    const existingBrands = await db.select().from(brandsTable).limit(1);
    if (existingBrands.length > 0) {
      return; // User has their own brands, skip sample products
    }

    const sampleProducts: InsertProduct[] = [
      // GEOX Products
      {
        name: "Geox Respira Men's Casual",
        sku: "GX-RC100",
        category: "Casual Shoes",
        brand: "Geox",
        gender: "men",
        description: "Breathable Italian leather casual shoes with patented breathing system",
        wholesalePrice: "55.00",
        retailPrice: "110.00",
        image1: "https://images.unsplash.com/photo-1549298916-b41d501d3772?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "Brown",
        availableSizes: [
          {size: "7", stock: 15}, {size: "8", stock: 20}, {size: "9", stock: 22},
          {size: "10", stock: 18}, {size: "11", stock: 12}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      {
        name: "Geox Nebula Women's Sneaker",
        sku: "GX-NW200",
        category: "Sneakers Women",
        brand: "Geox",
        gender: "women",
        description: "Lightweight mesh sneakers with breathable sole technology",
        wholesalePrice: "48.00",
        retailPrice: "96.00",
        image1: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "White",
        availableSizes: [
          {size: "6", stock: 18}, {size: "7", stock: 24}, {size: "8", stock: 26},
          {size: "9", stock: 20}, {size: "10", stock: 14}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      
      // SKECHERS Products
      {
        name: "Skechers D'Lites",
        sku: "SK-DL100",
        category: "Athletic Shoes",
        brand: "Skechers",
        gender: "women",
        description: "Chunky retro-style sneakers with comfort insole",
        wholesalePrice: "35.00",
        retailPrice: "70.00",
        image1: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "White",
        availableSizes: [
          {size: "6", stock: 15}, {size: "7", stock: 20}, {size: "8", stock: 25},
          {size: "9", stock: 18}, {size: "10", stock: 12}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      {
        name: "Skechers Go Walk Joy",
        sku: "SK-GW200",
        category: "Walking Shoes",
        brand: "Skechers",
        gender: "women",
        description: "Lightweight walking shoes with innovative responsive 5Gen cushioning",
        wholesalePrice: "30.00",
        retailPrice: "60.00",
        image1: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "Black",
        availableSizes: [
          {size: "5", stock: 10}, {size: "6", stock: 15}, {size: "7", stock: 20},
          {size: "8", stock: 22}, {size: "9", stock: 15}, {size: "10", stock: 8}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      {
        name: "Skechers Arch Fit",
        sku: "SK-AF300",
        category: "Athletic Shoes",
        brand: "Skechers",
        gender: "men",
        description: "Podiatrist-certified arch support for superior comfort",
        wholesalePrice: "40.00",
        retailPrice: "80.00",
        image1: "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "Black",
        availableSizes: [
          {size: "7", stock: 12}, {size: "8", stock: 18}, {size: "9", stock: 22},
          {size: "10", stock: 20}, {size: "11", stock: 15}, {size: "12", stock: 10}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      
      // NIKE Products
      {
        name: "Nike Air Max 270",
        sku: "NK-AM270",
        category: "Athletic Shoes",
        brand: "Nike",
        gender: "unisex",
        description: "Max Air unit provides unrivaled cushioning and comfort",
        wholesalePrice: "75.00",
        retailPrice: "150.00",
        image1: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "Black",
        availableSizes: [
          {size: "7", stock: 20}, {size: "8", stock: 25}, {size: "9", stock: 28},
          {size: "10", stock: 24}, {size: "11", stock: 18}, {size: "12", stock: 12}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      {
        name: "Nike Revolution 6",
        sku: "NK-RV6",
        category: "Running Shoes",
        brand: "Nike",
        gender: "women",
        description: "Soft cushioning and support for your running journey",
        wholesalePrice: "42.00",
        retailPrice: "84.00",
        image1: "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "Black",
        availableSizes: [
          {size: "6", stock: 16}, {size: "7", stock: 22}, {size: "8", stock: 24},
          {size: "9", stock: 20}, {size: "10", stock: 14}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      
      // ADIDAS Products
      {
        name: "Adidas Ultraboost 22",
        sku: "AD-UB22",
        category: "Running Shoes",
        brand: "Adidas",
        gender: "men",
        description: "Energy-returning Boost cushioning for ultimate performance",
        wholesalePrice: "85.00",
        retailPrice: "170.00",
        image1: "https://images.unsplash.com/photo-1552346154-21d32810aba3?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "Black",
        availableSizes: [
          {size: "7", stock: 18}, {size: "8", stock: 24}, {size: "9", stock: 26},
          {size: "10", stock: 22}, {size: "11", stock: 16}, {size: "12", stock: 10}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      {
        name: "Adidas Stan Smith",
        sku: "AD-SS100",
        category: "Sneakers Women",
        brand: "Adidas",
        gender: "women",
        description: "Iconic tennis-inspired sneakers with clean leather design",
        wholesalePrice: "45.00",
        retailPrice: "90.00",
        image1: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "White/Green",
        availableSizes: [
          {size: "6", stock: 20}, {size: "7", stock: 26}, {size: "8", stock: 28},
          {size: "9", stock: 22}, {size: "10", stock: 16}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      
      // PUMA Products
      {
        name: "Puma Suede Classic",
        sku: "PM-SC300",
        category: "Sneakers Men",
        brand: "Puma",
        gender: "men",
        description: "Legendary streetwear icon with premium suede upper",
        wholesalePrice: "40.00",
        retailPrice: "80.00",
        image1: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "Black",
        availableSizes: [
          {size: "7", stock: 16}, {size: "8", stock: 20}, {size: "9", stock: 22},
          {size: "10", stock: 18}, {size: "11", stock: 14}, {size: "12", stock: 10}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      {
        name: "Puma Carina 2.0",
        sku: "PM-CR200",
        category: "Sneakers Women",
        brand: "Puma",
        gender: "women",
        description: "California-inspired casual sneakers with platform sole",
        wholesalePrice: "38.00",
        retailPrice: "76.00",
        image1: "https://images.unsplash.com/photo-1603808033192-082d6919d3e1?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "White",
        availableSizes: [
          {size: "6", stock: 18}, {size: "7", stock: 22}, {size: "8", stock: 24},
          {size: "9", stock: 20}, {size: "10", stock: 14}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      
      // NEW BALANCE Products
      {
        name: "New Balance 990v5",
        sku: "NB-990V5",
        category: "Running Shoes",
        brand: "New Balance",
        gender: "men",
        description: "Premium American craftsmanship with ENCAP midsole cushioning",
        wholesalePrice: "95.00",
        retailPrice: "190.00",
        image1: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "Grey",
        availableSizes: [
          {size: "7", stock: 14}, {size: "8", stock: 18}, {size: "9", stock: 20},
          {size: "10", stock: 18}, {size: "11", stock: 14}, {size: "12", stock: 10}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      {
        name: "New Balance Fresh Foam X 880v12",
        sku: "NB-FF880",
        category: "Running Shoes",
        brand: "New Balance",
        gender: "women",
        description: "Reliable and cushioned for everyday running",
        wholesalePrice: "65.00",
        retailPrice: "130.00",
        image1: "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "White",
        availableSizes: [
          {size: "6", stock: 16}, {size: "7", stock: 20}, {size: "8", stock: 22},
          {size: "9", stock: 18}, {size: "10", stock: 12}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      
      // REEBOK Products
      {
        name: "Reebok Club C 85",
        sku: "RB-CC85",
        category: "Sneakers Men",
        brand: "Reebok",
        gender: "men",
        description: "Classic tennis-inspired design with soft leather upper",
        wholesalePrice: "42.00",
        retailPrice: "84.00",
        image1: "https://images.unsplash.com/photo-1549298916-b41d501d3772?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "White/Green",
        availableSizes: [
          {size: "7", stock: 18}, {size: "8", stock: 22}, {size: "9", stock: 24},
          {size: "10", stock: 20}, {size: "11", stock: 16}, {size: "12", stock: 12}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      {
        name: "Reebok Nano X2",
        sku: "RB-NX2",
        category: "Athletic Shoes",
        brand: "Reebok",
        gender: "women",
        description: "Versatile training shoe built for intense workouts",
        wholesalePrice: "68.00",
        retailPrice: "136.00",
        image1: "https://images.unsplash.com/photo-1603808033192-082d6919d3e1?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "Black",
        availableSizes: [
          {size: "6", stock: 14}, {size: "7", stock: 18}, {size: "8", stock: 20},
          {size: "9", stock: 16}, {size: "10", stock: 12}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      
      // CLARKS Products
      {
        name: "Clarks Desert Boot",
        sku: "CL-DB100",
        category: "Formal Shoes",
        brand: "Clarks",
        gender: "men",
        description: "Iconic British design with premium suede and crepe sole",
        wholesalePrice: "72.00",
        retailPrice: "144.00",
        image1: "https://images.unsplash.com/photo-1549298916-b41d501d3772?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "Sand",
        availableSizes: [
          {size: "7", stock: 12}, {size: "8", stock: 16}, {size: "9", stock: 18},
          {size: "10", stock: 16}, {size: "11", stock: 12}, {size: "12", stock: 8}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      {
        name: "Clarks Un Rio Strap",
        sku: "CL-UR200",
        category: "Casual Shoes",
        brand: "Clarks",
        gender: "women",
        description: "Comfortable mary jane style with OrthoLite footbed",
        wholesalePrice: "55.00",
        retailPrice: "110.00",
        image1: "https://images.unsplash.com/photo-1603808033192-082d6919d3e1?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colourway: "Black",
        availableSizes: [
          {size: "6", stock: 14}, {size: "7", stock: 18}, {size: "8", stock: 20},
          {size: "9", stock: 16}, {size: "10", stock: 12}
        ],
        inStock: true,
        stockLevel: "in_stock"
      }
    ] as const;

    // Insert all products into database
    await db.insert(productsTable).values(sampleProducts as any);
  }

  private initializeCollections() {
    const sampleCollections: InsertCollection[] = [
      {
        name: "Performance Running",
        slug: "performance-running",
        description: "High-performance running shoes for serious athletes",
        discount: "0",
        validFrom: null,
        validTo: null,
        productIds: [],
        isActive: true,
        priority: 10
      },
      {
        name: "Business Professional",
        slug: "business-professional",
        description: "Professional dress shoes for business environments",
        discount: "0",
        validFrom: null,
        validTo: null,
        productIds: [],
        isActive: true,
        priority: 9
      },
      {
        name: "Basketball Elite",
        slug: "basketball-elite",
        description: "Elite basketball shoes for court performance",
        discount: "0",
        validFrom: null,
        validTo: null,
        productIds: [],
        isActive: true,
        priority: 8
      },
      {
        name: "Lifestyle Men",
        slug: "lifestyle-men",
        description: "Casual lifestyle sneakers for men",
        discount: "0",
        validFrom: null,
        validTo: null,
        productIds: [],
        isActive: true,
        priority: 7
      },
      {
        name: "Lifestyle Women",
        slug: "lifestyle-women",
        description: "Casual lifestyle sneakers for women",
        discount: "0",
        validFrom: null,
        validTo: null,
        productIds: [],
        isActive: true,
        priority: 6
      }
    ];

    sampleCollections.forEach(collection => {
      const id = randomUUID();
      const fullCollection: Collection = { 
        ...collection,
        description: collection.description || null,
        discount: collection.discount ?? "0",
        validFrom: collection.validFrom ?? null,
        validTo: collection.validTo ?? null,
        productIds: (collection.productIds ?? []) as string[],
        isActive: collection.isActive ?? true,
        imageUrl: collection.imageUrl ?? null,
        featured: collection.featured ?? false,
        priority: collection.priority ?? 0,
        id, 
        createdAt: new Date().toISOString() 
      };
      this.collections.set(id, fullCollection);
    });
  }

  private async initializeBrands() {
    // Check if brands already exist in database
    const existingBrands = await db.select().from(brandsTable).limit(1);
    if (existingBrands.length > 0) {
      return; // Already seeded
    }

    const sampleBrands: InsertBrand[] = [
      {
        name: "Geox",
        slug: "geox",
        logoUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "The shoe that breathes - Italian comfort and innovation",
        isActive: true,
        priority: 10
      },
      {
        name: "Skechers",
        slug: "skechers",
        logoUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Comfort and style for everyday wear",
        isActive: true,
        priority: 9
      },
      {
        name: "Nike",
        slug: "nike",
        logoUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Just Do It - Athletic performance and lifestyle",
        isActive: true,
        priority: 8
      },
      {
        name: "Adidas",
        slug: "adidas",
        logoUrl: "https://images.unsplash.com/photo-1552346154-21d32810aba3?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Impossible is Nothing - Sport and streetwear",
        isActive: true,
        priority: 7
      },
      {
        name: "Puma",
        slug: "puma",
        logoUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Forever Faster - Athletic and casual footwear",
        isActive: true,
        priority: 6
      },
      {
        name: "New Balance",
        slug: "new-balance",
        logoUrl: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Endorsed by Nobody - Premium running and lifestyle shoes",
        isActive: true,
        priority: 5
      },
      {
        name: "Reebok",
        slug: "reebok",
        logoUrl: "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Be More Human - Fitness and lifestyle footwear",
        isActive: true,
        priority: 4
      },
      {
        name: "Clarks",
        slug: "clarks",
        logoUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "British heritage and craftsmanship since 1825",
        isActive: true,
        priority: 3
      }
    ];

    // Insert brands into database with their names as IDs
    const brandsToInsert = sampleBrands.map(brand => ({
      ...brand,
      id: brand.name // Use brand name as ID so products can reference it easily
    }));
    
    await db.insert(brandsTable).values(brandsToInsert as any);

    // Also store in MemStorage for backward compatibility
    sampleBrands.forEach(brand => {
      const fullBrand: Brand = { 
        ...brand,
        collectionId: brand.collectionId ?? null,
        logoUrl: brand.logoUrl || null,
        description: brand.description || null,
        isActive: brand.isActive ?? true,
        priority: brand.priority ?? 0,
        id: brand.name, 
        createdAt: new Date().toISOString() 
      };
      this.brands.set(brand.name, fullBrand);
    });
  }

  private initializeCategories() {
    const sampleCategories: InsertCategory[] = [
      {
        name: "Athletic Shoes",
        slug: "athletic-shoes",
        iconUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Running, training, and sports performance footwear",
        isActive: true,
        priority: 10
      },
      {
        name: "Formal Shoes",
        slug: "formal-shoes",
        iconUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Business and dress shoes for professional settings",
        isActive: true,
        priority: 9
      },
      {
        name: "Basketball Shoes",
        slug: "basketball-shoes",
        iconUrl: "https://images.unsplash.com/photo-1552346154-21d32810aba3?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "High-performance basketball footwear",
        isActive: true,
        priority: 8
      },
      {
        name: "Sneakers Men",
        slug: "sneakers-men",
        iconUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Casual and lifestyle sneakers for men",
        isActive: true,
        priority: 7
      },
      {
        name: "Sneakers Women",
        slug: "sneakers-women",
        iconUrl: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Casual and lifestyle sneakers for women",
        isActive: true,
        priority: 6
      }
    ];

    sampleCategories.forEach(category => {
      const id = randomUUID();
      const fullCategory: Category = { 
        ...category,
        iconUrl: category.iconUrl || null,
        description: category.description || null,
        isActive: category.isActive ?? true,
        priority: category.priority ?? 0,
        id, 
        createdAt: new Date().toISOString() 
      };
      this.categories.set(id, fullCategory);
    });
  }

  private async initializeSampleOrders() {
    // Get a small sample of products from database (limit to avoid loading too much data)
    const products = await db.select().from(productsTable).limit(100);
    if (products.length === 0) {
      return; // No products to create orders from
    }

    const sampleOrders: InsertOrder[] = [];

    // Create 15 sample orders using random products
    for (let i = 0; i < 15; i++) {
      const sessionId = randomUUID();
      const itemCount = Math.floor(Math.random() * 3) + 1; // 1-3 items per order
      const orderItems = [];
      let subtotal = 0;

      for (let j = 0; j < itemCount; j++) {
        const randomProduct = products[Math.floor(Math.random() * products.length)];
        const randomColor = randomProduct.colourway || "Default";
        const randomSize = randomProduct.availableSizes[Math.floor(Math.random() * randomProduct.availableSizes.length)]?.size || "9";
        const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 quantity
        const unitPrice = parseFloat(randomProduct.wholesalePrice);
        const totalPrice = unitPrice * quantity;

        orderItems.push({
          productId: randomProduct.id,
          productName: randomProduct.name,
          sku: randomProduct.sku,
          color: randomColor,
          size: randomSize,
          quantity,
          unitPrice,
          totalPrice
        });

        subtotal += totalPrice;
      }

      const discount = Math.random() < 0.3 ? Math.floor(Math.random() * 20) + 5 : 0; // 30% chance of 5-25 discount
      const total = subtotal - discount;

      sampleOrders.push({
        sessionId,
        items: [...orderItems],
        subtotal: subtotal.toFixed(2),
        discount: discount.toFixed(2),
        total: total.toFixed(2),
        status: "completed"
      });
    }

    sampleOrders.forEach((order, index) => {
      const id = randomUUID();
      const daysAgo = Math.floor(Math.random() * 30);
      const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
      
      const fullOrder: Order = { 
        ...order,
        id,
        status: order.status || "completed",
        items: [...(order.items ?? [])] as Order['items'],
        discount: order.discount || "0",
        createdAt
      };
      this.orders.set(id, fullOrder);
    });
  }


  async getUser(id: string): Promise<User | undefined> {
    return await db.select().from(usersTable).where(eq(usersTable.id, id)).then(res => res[0]);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return await db.select().from(usersTable).where(eq(usersTable.username, username)).then(res => res[0]);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!email) return undefined;
    return await db.select().from(usersTable).where(eq(usersTable.email, email)).then(res => res[0]);
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    if (!googleId) return undefined;
    return await db.select().from(usersTable).where(eq(usersTable.googleId, googleId)).then(res => res[0]);
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db.insert(usersTable).values(userData).returning();
    return user;
  }

  async upsertUser(userData: Partial<User> & { id: string }): Promise<User> {
    const existing = await this.getUser(userData.id);
    if (existing) {
      const { id, ...updates } = userData;
      const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
      return user;
    } else {
      return await this.createUser(userData as InsertUser);
    }
  }

  async getCustomerProfile(userId: string): Promise<CustomerProfile | undefined> {
    return await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, userId)).then(res => res[0]);
  }

  async getCustomerProfilesByAccountManager(accountManagerId: string): Promise<CustomerProfile[]> {
    return await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.accountManagerId, accountManagerId));
  }

  async createCustomerProfile(profileData: InsertCustomerProfile): Promise<CustomerProfile> {
    const [profile] = await db.insert(customerProfilesTable).values(profileData).returning();
    return profile;
  }

  async updateCustomerProfile(userId: string, updates: Partial<CustomerProfile>): Promise<CustomerProfile | undefined> {
    const [profile] = await db
      .update(customerProfilesTable)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(customerProfilesTable.userId, userId))
      .returning();
    return profile;
  }

  async getBrands(): Promise<Brand[]> {
    return Array.from(this.brands.values()).sort((a, b) => b.priority - a.priority);
  }

  async getBrand(id: string): Promise<Brand | undefined> {
    return this.brands.get(id);
  }

  async createBrand(brand: InsertBrand): Promise<Brand> {
    // Insert into database instead of just memory
    const results = await db.insert(brandsTable).values(brand as any).returning();
    const newBrand = results[0];
    // Also add to memory cache for consistency
    this.brands.set(newBrand.id, newBrand);
    return newBrand;
  }

  async updateBrand(id: string, updates: Partial<Brand>): Promise<Brand | undefined> {
    const existingBrand = this.brands.get(id);
    if (!existingBrand) return undefined;
    
    const updatedBrand = { ...existingBrand, ...updates };
    this.brands.set(id, updatedBrand);
    return updatedBrand;
  }

  async deleteBrand(id: string): Promise<boolean> {
    return this.brands.delete(id);
  }

  async getCategories(): Promise<Category[]> {
    return Array.from(this.categories.values()).sort((a, b) => b.priority - a.priority);
  }

  async getCategory(id: string): Promise<Category | undefined> {
    return this.categories.get(id);
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    // Insert into database instead of just memory
    const results = await db.insert(categoriesTable).values(category as any).returning();
    const newCategory = results[0];
    // Also add to memory cache for consistency
    this.categories.set(newCategory.id, newCategory);
    return newCategory;
  }

  async updateCategory(id: string, updates: Partial<Category>): Promise<Category | undefined> {
    const existingCategory = this.categories.get(id);
    if (!existingCategory) return undefined;
    
    const updatedCategory = { ...existingCategory, ...updates };
    this.categories.set(id, updatedCategory);
    return updatedCategory;
  }

  async deleteCategory(id: string): Promise<boolean> {
    return this.categories.delete(id);
  }

  // Collection methods
  async getCollections(): Promise<Collection[]> {
    return Array.from(this.collections.values()).sort((a, b) => b.priority - a.priority);
  }

  async getCollectionsByCategory(categoryId: string): Promise<Collection[]> {
    // Collections no longer belong to categories, return empty array
    return [];
  }

  async getCollection(id: string): Promise<Collection | undefined> {
    return this.collections.get(id);
  }

  async createCollection(collection: InsertCollection): Promise<Collection> {
    const id = randomUUID();
    const newCollection: Collection = { 
      name: collection.name,
      slug: collection.slug,
      description: collection.description ?? null,
      discount: collection.discount ?? "0",
      validFrom: collection.validFrom ?? null,
      validTo: collection.validTo ?? null,
      productIds: (collection.productIds ?? []) as string[],
      isActive: collection.isActive ?? true,
      imageUrl: collection.imageUrl ?? null,
      featured: collection.featured ?? false,
      priority: collection.priority ?? 0,
      sizeChartId: collection.sizeChartId ?? null,
      id, 
      createdAt: new Date().toISOString() 
    };
    this.collections.set(id, newCollection);
    return newCollection;
  }

  async updateCollection(id: string, updates: Partial<Collection>): Promise<Collection | undefined> {
    const existingCollection = this.collections.get(id);
    if (!existingCollection) return undefined;
    
    const updatedCollection = { ...existingCollection, ...updates };
    this.collections.set(id, updatedCollection);
    return updatedCollection;
  }

  async deleteCollection(id: string): Promise<boolean> {
    return this.collections.delete(id);
  }

  async getProductCountsByBrand(filters?: {
    isPreOrder?: boolean;
    excludeCollections?: string[];
  }): Promise<Record<string, number>> {
    const conditions: any[] = [];
    
    if (filters?.isPreOrder !== undefined) {
      conditions.push(eq(productsTable.isPreOrder, filters.isPreOrder));
    }
    
    conditions.push(sql`jsonb_array_length(${productsTable.collections}) > 0`);
    
    // If excluding collections, filter out products where ALL collections are inactive
    // A product is visible if it has at least one active collection
    if (filters?.excludeCollections && filters.excludeCollections.length > 0) {
      // For pre-order products, exclude if all collections are inactive
      // This checks that not all elements of the product's collections array are in the exclude list
      // Use proper JSON array format for the containment check
      const excludeJson = JSON.stringify(filters.excludeCollections);
      conditions.push(sql`NOT (${productsTable.collections} <@ ${excludeJson}::jsonb)`);
    }
    
    const result = await db
      .select({
        brandName: brandsTable.name,
        count: sql<number>`count(*)::int`,
      })
      .from(productsTable)
      .leftJoin(brandsTable, eq(productsTable.brand, brandsTable.id))
      .where(and(...conditions))
      .groupBy(brandsTable.name);
    
    const counts: Record<string, number> = {};
    for (const row of result) {
      if (row.brandName) {
        counts[row.brandName] = row.count;
      }
    }
    return counts;
  }

  async getFilteredProductCount(filters?: {
    category?: string;
    brand?: string;
    collections?: string[];
    minPrice?: number;
    maxPrice?: number;
    sizes?: string[];
    search?: string;
    styles?: string[];
    ageRanges?: string[];
    occasions?: string[];
    genders?: string[];
    colors?: string[];
    supplierLocations?: string[];
    isPreOrder?: boolean;
    mainCategories?: string[];
    kidsGenders?: string[];
    kidsAgeGroups?: string[];
    divisions?: string[];
    excludeCollections?: string[];
  }): Promise<number> {
    const conditions: any[] = [];
    
    if (filters?.isPreOrder !== undefined) {
      conditions.push(eq(productsTable.isPreOrder, filters.isPreOrder));
    }
    
    conditions.push(sql`jsonb_array_length(${productsTable.collections}) > 0`);
    
    if (filters?.excludeCollections && filters.excludeCollections.length > 0) {
      const excludeJson = JSON.stringify(filters.excludeCollections);
      conditions.push(sql`NOT (${productsTable.collections} <@ ${excludeJson}::jsonb)`);
    }
    
    // Collections inclusion filter - check if product has any of the specified collections
    if (filters?.collections && filters.collections.length > 0) {
      const collectionsJson = JSON.stringify(filters.collections);
      // Use JSONB overlap operator ?| to check if any collection matches
      conditions.push(sql`${productsTable.collections} ?| ${collectionsJson}::text[]`);
    }
    
    // Category filter - exact match on category field
    if (filters?.category) {
      const categoryList = filters.category.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
      if (categoryList.length > 0) {
        const categoryArray = `{${categoryList.map(c => `"${c}"`).join(',')}}`;
        conditions.push(sql`LOWER(${productsTable.category}) = ANY(${categoryArray}::text[])`);
      }
    }
    
    if (filters?.brand) {
      const brandList = filters.brand.split(',').map(b => b.trim().toLowerCase()).filter(Boolean);
      if (brandList.length > 0) {
        const brandArray = `{${brandList.map(b => `"${b}"`).join(',')}}`;
        conditions.push(sql`LOWER(${brandsTable.name}) = ANY(${brandArray}::text[])`);
      }
    }
    
    if (filters?.divisions && filters.divisions.length > 0) {
      const divisionArray = `{${filters.divisions.map(d => `"${d.toLowerCase()}"`).join(',')}}`;
      conditions.push(sql`LOWER(${productsTable.division}) = ANY(${divisionArray}::text[])`);
    }
    
    if (filters?.mainCategories && filters.mainCategories.length > 0) {
      const categoryArray = `{${filters.mainCategories.map(c => `"${c.toUpperCase()}"`).join(',')}}`;
      conditions.push(sql`UPPER(${productsTable.mainCategory}) = ANY(${categoryArray}::text[])`);
    }
    
    if (filters?.kidsGenders && filters.kidsGenders.length > 0) {
      const kidsGenderArray = `{${filters.kidsGenders.map(g => `"${g.toUpperCase()}"`).join(',')}}`;
      conditions.push(sql`UPPER(${productsTable.kidsGender}) = ANY(${kidsGenderArray}::text[])`);
    }
    
    if (filters?.kidsAgeGroups && filters.kidsAgeGroups.length > 0) {
      const ageGroupArray = `{${filters.kidsAgeGroups.map(a => `"${a.toUpperCase()}"`).join(',')}}`;
      conditions.push(sql`UPPER(${productsTable.kidsAgeGroup}) = ANY(${ageGroupArray}::text[])`);
    }
    
    if (filters?.search && typeof filters.search === 'string' && filters.search.trim()) {
      const rawTerm = filters.search.trim();
      const term = rawTerm.toLowerCase();
      const isUpcLike = /^\d{8,14}$/.test(rawTerm);
      const isSkuLike = !isUpcLike && /^(?=.*[0-9])(?=.*[A-Za-z])[A-Za-z0-9\-]{3,50}$/.test(rawTerm);
      if (isUpcLike) {
        conditions.push(sql`(
          LOWER(TRIM(COALESCE(${productsTable.sku}, ''))) = ${term} OR 
          LOWER(TRIM(COALESCE(${productsTable.barcode}, ''))) = ${term}
        )`);
      } else if (isSkuLike) {
        const searchTerm = `%${term}%`;
        conditions.push(sql`(
          LOWER(${productsTable.sku}) LIKE ${searchTerm} OR 
          LOWER(${productsTable.barcode}) LIKE ${searchTerm}
        )`);
      } else {
        const searchTerm = `%${term}%`;
        conditions.push(sql`(
          LOWER(${productsTable.name}) LIKE ${searchTerm} OR 
          LOWER(${productsTable.sku}) LIKE ${searchTerm} OR 
          LOWER(${productsTable.barcode}) LIKE ${searchTerm} OR 
          LOWER(${brandsTable.name}) LIKE ${searchTerm}
        )`);
      }
    }
    
    if (filters?.colors && filters.colors.length > 0) {
      const colorsArray = `{${filters.colors.map(c => `"${c}"`).join(',')}}`;
      conditions.push(sql`${productsTable.primaryColor} = ANY(${colorsArray}::text[])`);
    }
    
    if (filters?.minPrice !== undefined) {
      conditions.push(sql`CAST(${productsTable.wholesalePrice} AS DECIMAL) >= ${filters.minPrice}`);
    }
    if (filters?.maxPrice !== undefined) {
      conditions.push(sql`CAST(${productsTable.wholesalePrice} AS DECIMAL) <= ${filters.maxPrice}`);
    }
    
    if (filters?.sizes && filters.sizes.length > 0) {
      const sizeConditions = filters.sizes.map(size => 
        sql`${productsTable.availableSizes} @> ${JSON.stringify([{ size }])}::jsonb`
      );
      conditions.push(sql`(${sql.join(sizeConditions, sql` OR `)})`);
    }
    
    const result = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(productsTable)
      .leftJoin(brandsTable, eq(productsTable.brand, brandsTable.id))
      .where(and(...conditions));
    
    return result[0]?.count ?? 0;
  }

  async getProducts(filters?: {
    category?: string;
    brand?: string;
    collections?: string[];
    minPrice?: number;
    maxPrice?: number;
    sizes?: string[];
    search?: string;
    styles?: string[];
    ageRanges?: string[];
    occasions?: string[];
    genders?: string[];
    colors?: string[];
    supplierLocations?: string[];
    isPreOrder?: boolean;
    mainCategories?: string[];
    kidsGenders?: string[];
    kidsAgeGroups?: string[];
    divisions?: string[];
    limit?: number;
    offset?: number;
    excludeCollections?: string[];
  }): Promise<Product[]> {
    // Build WHERE conditions for SQL-level filtering
    const conditions: any[] = [];
    
    // Apply isPreOrder filter at SQL level (critical for performance)
    if (filters?.isPreOrder !== undefined) {
      conditions.push(eq(productsTable.isPreOrder, filters.isPreOrder));
    }
    
    // Apply collections existence filter at SQL level
    // Products must have at least one collection to be visible in shop
    conditions.push(sql`jsonb_array_length(${productsTable.collections}) > 0`);
    
    // Exclude products where ALL collections are in the inactive list (SQL-level filtering)
    if (filters?.excludeCollections && filters.excludeCollections.length > 0) {
      const excludeJson = JSON.stringify(filters.excludeCollections);
      conditions.push(sql`NOT (${productsTable.collections} <@ ${excludeJson}::jsonb)`);
    }
    
    // Apply brand filter at SQL level for full-dataset filtering
    if (filters?.brand) {
      const brandList = filters.brand.split(',').map(b => b.trim().toLowerCase()).filter(Boolean);
      if (brandList.length > 0) {
        const brandArray = `{${brandList.map(b => `"${b}"`).join(',')}}`;
        conditions.push(sql`LOWER(${brandsTable.name}) = ANY(${brandArray}::text[])`);
      }
    }
    
    // Apply division filter at SQL level (Footwear, Apparel, Accessories)
    if (filters?.divisions && filters.divisions.length > 0) {
      const divisionArray = `{${filters.divisions.map(d => `"${d.toLowerCase()}"`).join(',')}}`;
      conditions.push(sql`LOWER(${productsTable.division}) = ANY(${divisionArray}::text[])`);
    }
    
    // Apply mainCategories filter at SQL level (MEN, WOMEN, ADULT UNISEX, KIDS)
    if (filters?.mainCategories && filters.mainCategories.length > 0) {
      const categoryArray = `{${filters.mainCategories.map(c => `"${c.toUpperCase()}"`).join(',')}}`;
      conditions.push(sql`UPPER(${productsTable.mainCategory}) = ANY(${categoryArray}::text[])`);
    }
    
    // Apply kidsGenders filter at SQL level (BOYS, GIRLS, UNISEX - only for KIDS products)
    if (filters?.kidsGenders && filters.kidsGenders.length > 0) {
      const kidsGenderArray = `{${filters.kidsGenders.map(g => `"${g.toUpperCase()}"`).join(',')}}`;
      conditions.push(sql`UPPER(${productsTable.kidsGender}) = ANY(${kidsGenderArray}::text[])`);
    }
    
    // Apply kidsAgeGroups filter at SQL level (NEW BORN, JUNIOR, LARGE, KIDS)
    if (filters?.kidsAgeGroups && filters.kidsAgeGroups.length > 0) {
      const ageGroupArray = `{${filters.kidsAgeGroups.map(a => `"${a.toUpperCase()}"`).join(',')}}`;
      conditions.push(sql`UPPER(${productsTable.kidsAgeGroup}) = ANY(${ageGroupArray}::text[])`);
    }
    
    // Apply search filter at SQL level
    if (filters?.search && typeof filters.search === 'string' && filters.search.trim()) {
      const rawTerm = filters.search.trim();
      const term = rawTerm.toLowerCase();
      // UPC/EAN/barcode: all digits, 8-14 chars - use exact match on sku/barcode only
      // (LIKE %123456789012% would incorrectly match 1234567890123, 0123456789012, etc.)
      const isUpcLike = /^\d{8,14}$/.test(rawTerm);
      // SKU-like: mixed letters+numbers (e.g. KJ7001, IH1449) - search sku/barcode only to avoid
      // wrong results (e.g. searching "KJ7001" matching "KJ7001" in another product's name).
      // Excludes plain words like "Nike" (no digits) which should search name/brand.
      const isSkuLike = !isUpcLike && /^(?=.*[0-9])(?=.*[A-Za-z])[A-Za-z0-9\-]{3,50}$/.test(rawTerm);
      if (isUpcLike) {
        conditions.push(sql`(
          LOWER(TRIM(COALESCE(${productsTable.sku}, ''))) = ${term} OR 
          LOWER(TRIM(COALESCE(${productsTable.barcode}, ''))) = ${term}
        )`);
      } else if (isSkuLike) {
        const searchTerm = `%${term}%`;
        conditions.push(sql`(
          LOWER(${productsTable.sku}) LIKE ${searchTerm} OR 
          LOWER(${productsTable.barcode}) LIKE ${searchTerm}
        )`);
      } else {
        const searchTerm = `%${term}%`;
        conditions.push(sql`(
          LOWER(${productsTable.name}) LIKE ${searchTerm} OR 
          LOWER(${productsTable.sku}) LIKE ${searchTerm} OR 
          LOWER(${productsTable.barcode}) LIKE ${searchTerm} OR 
          LOWER(${brandsTable.name}) LIKE ${searchTerm}
        )`);
      }
    }
    
    // Apply colors filter at SQL level
    if (filters?.colors && filters.colors.length > 0) {
      const colorsArray = `{${filters.colors.map(c => `"${c}"`).join(',')}}`;
      conditions.push(sql`${productsTable.primaryColor} = ANY(${colorsArray}::text[])`);
    }
    
    // Apply price range filters at SQL level
    if (filters?.minPrice !== undefined) {
      conditions.push(sql`CAST(${productsTable.wholesalePrice} AS DECIMAL) >= ${filters.minPrice}`);
    }
    if (filters?.maxPrice !== undefined) {
      conditions.push(sql`CAST(${productsTable.wholesalePrice} AS DECIMAL) <= ${filters.maxPrice}`);
    }
    
    // Apply sizes filter at SQL level using JSONB containment
    if (filters?.sizes && filters.sizes.length > 0) {
      // Check if any of the product's availableSizes has a size in the filter list
      // availableSizes is JSONB array like: [{"size": "40", "quantity": 10}, ...]
      const sizeConditions = filters.sizes.map(size => 
        sql`${productsTable.availableSizes} @> ${JSON.stringify([{ size }])}::jsonb`
      );
      conditions.push(sql`(${sql.join(sizeConditions, sql` OR `)})`);
    }
    
    // Build query with optional limit to avoid exceeding database response limits
    let query = db
      .select({
        product: productsTable,
        brandName: brandsTable.name,
      })
      .from(productsTable)
      .leftJoin(brandsTable, eq(productsTable.brand, brandsTable.id));
    
    // Apply WHERE conditions if any
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    // Apply limit and offset for pagination (default 2000 to avoid 64MB limit with 138k+ products)
    const maxLimit = filters?.limit || 2000;
    const offsetVal = filters?.offset || 0;
    const results = await query.offset(offsetVal).limit(maxLimit);
    
    // Map results to replace brand ID with brand name
    let products = results.map(r => ({
      ...r.product,
      brand: r.brandName || r.product.brand, // Use brand name, fallback to ID if not found
    }));

    // Most filters are now applied at SQL level for full-dataset filtering
    // Only apply filters here that cannot be done efficiently in SQL
    if (filters) {
      // Category filter - keeping in JS due to complex comma-separated logic
      if (filters.category) {
        const categoryList = filters.category.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
        if (categoryList.length > 0) {
          products = products.filter(p => 
            categoryList.includes(p.category.toLowerCase())
          );
        }
      }
      
      // Collections filter - keeping in JS due to JSONB array overlap logic
      if (filters.collections && filters.collections.length > 0) {
        products = products.filter(p => 
          p.collections.some(collection => filters.collections!.includes(collection))
        );
      }
      
      // Styles filter - keeping in JS due to text search in multiple fields
      if (filters.styles && filters.styles.length > 0) {
        products = products.filter(p => 
          filters.styles!.some(style => 
            p.name.toLowerCase().includes(style.toLowerCase()) ||
            (p.description && p.description.toLowerCase().includes(style.toLowerCase()))
          )
        );
      }
      
      // Occasions filter - keeping in JS due to text search in multiple fields
      if (filters.occasions && filters.occasions.length > 0) {
        products = products.filter(p => 
          filters.occasions!.some(occasion => 
            p.name.toLowerCase().includes(occasion.toLowerCase()) ||
            p.category.toLowerCase().includes(occasion.toLowerCase()) ||
            (p.description && p.description.toLowerCase().includes(occasion.toLowerCase()))
          )
        );
      }
      
      // Supplier locations filter
      if (filters.supplierLocations && filters.supplierLocations.length > 0) {
        products = products.filter(p => 
          filters.supplierLocations!.some(location => 
            p.supplierLocation?.toLowerCase() === location.toLowerCase()
          )
        );
      }
      
      // Legacy genders filter - complex three-layer category system with legacy support
      if (filters.genders && filters.genders.length > 0) {
        products = products.filter(p => 
          filters.genders!.some(gender => {
            const genderUpper = gender.toUpperCase();
            const mainCategory = p.mainCategory?.toUpperCase() || '';
            const kidsGender = p.kidsGender?.toUpperCase() || '';
            const legacyGender = p.gender?.toLowerCase() || '';
            
            if (mainCategory === genderUpper) return true;
            if (kidsGender === genderUpper) return true;
            if (genderUpper === 'MEN' && (legacyGender === 'men' || legacyGender === 'mens' || legacyGender === 'male')) return true;
            if (genderUpper === 'WOMEN' && (legacyGender === 'women' || legacyGender === 'womens' || legacyGender === 'female')) return true;
            if (genderUpper === 'ADULT UNISEX' && (legacyGender === 'adult unisex' || legacyGender === 'unisex')) return true;
            if (genderUpper === 'KIDS' && (legacyGender === 'kids' || legacyGender === 'children' || mainCategory === 'KIDS')) return true;
            if (genderUpper === 'BOYS' && mainCategory === 'KIDS' && kidsGender === 'BOYS') return true;
            if (genderUpper === 'GIRLS' && mainCategory === 'KIDS' && kidsGender === 'GIRLS') return true;
            
            return false;
          })
        );
      }
      
      // Age ranges filter - includes legacy ageGroup field
      if (filters.ageRanges && filters.ageRanges.length > 0) {
        products = products.filter(p => 
          filters.ageRanges!.some(ageRange => {
            const ageRangeUpper = ageRange.toUpperCase();
            const kidsAgeGroup = p.kidsAgeGroup?.toUpperCase() || '';
            if (kidsAgeGroup === ageRangeUpper) return true;
            if (p.ageGroup?.toUpperCase() === ageRangeUpper) return true;
            return false;
          })
        );
      }

      // When searching (non-UPC), prioritize exact SKU/barcode match - avoids wrong results
      if (filters.search && typeof filters.search === 'string' && filters.search.trim()) {
        const term = filters.search.trim().toLowerCase();
        const isUpcLike = /^\d{8,14}$/.test(filters.search.trim());
        if (!isUpcLike && term.length >= 3 && /^[a-z0-9]+$/i.test(term)) {
          products.sort((a, b) => {
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
    }

    return products;
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const results = await db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1);
    return results[0];
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    // Auto-detect primaryColor from colourway if not provided
    const productWithColor = {
      ...product,
      primaryColor: product.primaryColor || detectPrimaryColor(product.colourway),
    };
    const results = await db.insert(productsTable).values(productWithColor as any).returning();
    return results[0];
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product | undefined> {
    // Auto-detect primaryColor when colourway changes and primaryColor not explicitly set
    let finalUpdates = updates;
    if (updates.colourway && !updates.primaryColor) {
      finalUpdates = {
        ...updates,
        primaryColor: detectPrimaryColor(updates.colourway),
      };
    }
    const results = await db.update(productsTable)
      .set(finalUpdates)
      .where(eq(productsTable.id, id))
      .returning();
    return results[0];
  }

  async deleteProduct(id: string): Promise<boolean> {
    const results = await db.delete(productsTable)
      .where(eq(productsTable.id, id))
      .returning();
    return results.length > 0;
  }

  async deleteProducts(ids: string[]): Promise<number> {
    const results = await db.delete(productsTable)
      .where(inArray(productsTable.id, ids))
      .returning();
    return results.length;
  }

  async getProductsBySKU(sku: string): Promise<Product[]> {
    const results = await db.select().from(productsTable).where(eq(productsTable.sku, sku));
    return results;
  }

  async getCartItems(sessionId: string): Promise<CartItem[]> {
    return Array.from(this.cartItems.values()).filter(item => item.sessionId === sessionId);
  }

  async addCartItem(cartItem: InsertCartItem): Promise<CartItem> {
    const id = randomUUID();
    const newCartItem: CartItem = { 
      ...cartItem, 
      id,
      selections: [...(cartItem.selections || [])]
    };
    this.cartItems.set(id, newCartItem);
    return newCartItem;
  }

  async updateCartItem(id: string, updates: Partial<CartItem>): Promise<CartItem | undefined> {
    const existingItem = this.cartItems.get(id);
    if (!existingItem) return undefined;
    
    const updatedItem = { ...existingItem, ...updates };
    this.cartItems.set(id, updatedItem);
    return updatedItem;
  }

  async removeCartItem(id: string): Promise<boolean> {
    return this.cartItems.delete(id);
  }

  async clearCart(sessionId: string): Promise<boolean> {
    const itemsToRemove = Array.from(this.cartItems.entries())
      .filter(([_, item]) => item.sessionId === sessionId)
      .map(([id, _]) => id);
    
    itemsToRemove.forEach(id => this.cartItems.delete(id));
    return true;
  }

  async createOrder(orderData: InsertOrder): Promise<Order> {
    const [order] = await db.insert(ordersTable).values(orderData).returning();
    return order;
  }

  async getOrders(sessionId?: string, userId?: string): Promise<Order[]> {
    if (userId) {
      return await db.select().from(ordersTable).where(eq(ordersTable.userId, userId));
    }
    if (sessionId) {
      return await db.select().from(ordersTable).where(eq(ordersTable.sessionId, sessionId));
    }
    return await db.select().from(ordersTable);
  }

  async getAllOrders(): Promise<Order[]> {
    return await db.select().from(ordersTable);
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    return order;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
    const [order] = await db
      .update(ordersTable)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(ordersTable.id, id))
      .returning();
    return order;
  }

  async deleteOrder(id: string): Promise<boolean> {
    const result = await db.delete(ordersTable).where(eq(ordersTable.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async approveOrder(id: string, adminId: string): Promise<Order | undefined> {
    const [order] = await db
      .update(ordersTable)
      .set({
        approvalStatus: 'approved',
        approvedBy: adminId,
        approvedAt: sql`now()`,
        status: 'approved',
        updatedAt: sql`now()`,
      })
      .where(eq(ordersTable.id, id))
      .returning();
    return order;
  }

  async rejectOrder(id: string, adminId: string, reason: string): Promise<Order | undefined> {
    const [order] = await db
      .update(ordersTable)
      .set({
        approvalStatus: 'rejected',
        approvedBy: adminId,
        approvedAt: sql`now()`,
        rejectionReason: reason,
        status: 'rejected',
        updatedAt: sql`now()`,
      })
      .where(eq(ordersTable.id, id))
      .returning();
    return order;
  }

  // Analytics implementations
  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    const orders = Array.from(this.orders.values());
    const cartItems = Array.from(this.cartItems.values());
    const products = Array.from(this.products.values());
    const categories = Array.from(this.categories.values());
    const brands = Array.from(this.brands.values());

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.total.toString()), 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalCartItems = cartItems.length;
    
    // Calculate cart abandonment rate (simplified)
    const totalCarts = new Set(cartItems.map(item => item.sessionId)).size;
    const cartAbandonmentRate = totalCarts > 0 ? ((totalCarts - totalOrders) / totalCarts) * 100 : 0;

    return {
      totalOrders,
      totalRevenue,
      avgOrderValue,
      totalProducts: products.length,
      totalCategories: categories.length,
      totalBrands: brands.length,
      totalCartItems,
      cartAbandonmentRate
    };
  }

  async getOrderTrends(dateRange?: { from: string; to: string }): Promise<OrderTrend[]> {
    const orders = Array.from(this.orders.values());
    
    // Filter by date range if provided
    const filteredOrders = dateRange 
      ? orders.filter(order => {
          const orderDate = new Date(order.createdAt);
          const fromDate = new Date(dateRange.from);
          const toDate = new Date(dateRange.to);
          return orderDate >= fromDate && orderDate <= toDate;
        })
      : orders;

    // Group orders by date
    const ordersByDate = new Map<string, Order[]>();
    filteredOrders.forEach(order => {
      const date = new Date(order.createdAt).toISOString().split('T')[0];
      if (!ordersByDate.has(date)) {
        ordersByDate.set(date, []);
      }
      ordersByDate.get(date)?.push(order);
    });

    // Convert to trend data
    return Array.from(ordersByDate.entries())
      .map(([date, dayOrders]) => {
        const revenue = dayOrders.reduce((sum, order) => sum + parseFloat(order.total.toString()), 0);
        return {
          date,
          orders: dayOrders.length,
          revenue,
          avgOrderValue: dayOrders.length > 0 ? revenue / dayOrders.length : 0
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getRevenueBreakdown(type: 'category' | 'brand', parentId?: string): Promise<RevenueBreakdown[]> {
    const orders = Array.from(this.orders.values());
    const products = Array.from(this.products.values());
    
    const breakdown = new Map<string, { revenue: number; count: number; }>();
    
    orders.forEach(order => {
      order.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) return;
        
        const key = type === 'category' ? product.category : product.brand;
        if (!breakdown.has(key)) {
          breakdown.set(key, { revenue: 0, count: 0 });
        }
        
        const current = breakdown.get(key)!;
        breakdown.set(key, {
          revenue: current.revenue + item.totalPrice,
          count: current.count + item.quantity
        });
      });
    });

    const totalRevenue = Array.from(breakdown.values()).reduce((sum, item) => sum + item.revenue, 0);
    
    return Array.from(breakdown.entries())
      .map(([name, data]) => ({
        name,
        value: data.revenue,
        percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
        count: data.count
      }))
      .sort((a, b) => b.value - a.value);
  }

  async getProductPerformance(limit = 20, category?: string, brand?: string): Promise<ProductPerformance[]> {
    const orders = Array.from(this.orders.values());
    const products = Array.from(this.products.values());
    
    const productStats = new Map<string, {
      product: Product;
      totalOrdered: number;
      totalRevenue: number;
      colors: Set<string>;
      sizes: Set<string>;
    }>();

    orders.forEach(order => {
      order.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) return;
        
        // Apply filters
        if (category && product.category !== category) return;
        if (brand && product.brand !== brand) return;
        
        if (!productStats.has(product.id)) {
          productStats.set(product.id, {
            product,
            totalOrdered: 0,
            totalRevenue: 0,
            colors: new Set(),
            sizes: new Set()
          });
        }
        
        const stats = productStats.get(product.id)!;
        stats.totalOrdered += item.quantity;
        stats.totalRevenue += item.totalPrice;
        stats.colors.add(item.color);
        stats.sizes.add(item.size);
      });
    });

    return Array.from(productStats.values())
      .map(stats => ({
        productId: stats.product.id,
        name: stats.product.name,
        sku: stats.product.sku,
        brand: stats.product.brand,
        category: stats.product.category,
        totalOrdered: stats.totalOrdered,
        totalRevenue: stats.totalRevenue,
        avgPrice: stats.totalOrdered > 0 ? stats.totalRevenue / stats.totalOrdered : 0,
        popularColors: Array.from(stats.colors),
        popularSizes: Array.from(stats.sizes)
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
  }

  async getCartAnalytics(): Promise<CartAnalytics> {
    const cartItems = Array.from(this.cartItems.values());
    const orders = Array.from(this.orders.values());
    const products = Array.from(this.products.values());
    
    const cartsBySession = new Map<string, CartItem[]>();
    cartItems.forEach(item => {
      if (!cartsBySession.has(item.sessionId)) {
        cartsBySession.set(item.sessionId, []);
      }
      cartsBySession.get(item.sessionId)?.push(item);
    });

    const orderedSessions = new Set(orders.map(order => order.sessionId));
    const abandonedCarts = Array.from(cartsBySession.keys()).filter(sessionId => !orderedSessions.has(sessionId));
    
    // Calculate abandoned product stats
    const abandonedProductStats = new Map<string, number>();
    abandonedCarts.forEach(sessionId => {
      const sessionItems = cartsBySession.get(sessionId) || [];
      sessionItems.forEach(item => {
        abandonedProductStats.set(
          item.productId, 
          (abandonedProductStats.get(item.productId) || 0) + 1
        );
      });
    });

    const topAbandonedProducts = Array.from(abandonedProductStats.entries())
      .map(([productId, count]) => {
        const product = products.find(p => p.id === productId);
        return {
          productId,
          name: product?.name || 'Unknown Product',
          abandonedCount: count
        };
      })
      .sort((a, b) => b.abandonedCount - a.abandonedCount)
      .slice(0, 10);

    const totalCarts = cartsBySession.size;
    const totalAbandonedCarts = abandonedCarts.length;
    
    const avgItemsPerCart = totalCarts > 0 
      ? cartItems.length / totalCarts
      : 0;
      
    // Calculate avg cart value based on wholesale prices
    const totalCartValue = cartItems.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId);
      if (!product) return sum;
      
      const itemTotal = item.selections.reduce((itemSum, selection) => 
        itemSum + (selection.quantity * parseFloat(product.wholesalePrice.toString())), 0
      );
      return sum + itemTotal;
    }, 0);
    
    const avgCartValue = totalCarts > 0 ? totalCartValue / totalCarts : 0;

    return {
      totalCarts,
      totalAbandonedCarts,
      avgItemsPerCart,
      avgCartValue,
      topAbandonedProducts
    };
  }

  async getDrillDownData(level: 'summary' | 'category' | 'brand', parentId?: string): Promise<DrillDownData> {
    switch (level) {
      case 'summary':
        const categoryBreakdown = await this.getRevenueBreakdown('category');
        return {
          level: 'summary',
          data: categoryBreakdown
        };
        
      case 'category':
        if (!parentId) {
          return { level: 'category', data: [] };
        }
        
        const brandBreakdown = await this.getRevenueBreakdown('brand');
        const category = Array.from(this.categories.values()).find(c => c.id === parentId);
        
        // Filter brands that have products in this category
        const products = Array.from(this.products.values()).filter(p => p.category === category?.name);
        const categoryBrands = new Set(products.map(p => p.brand));
        const filteredBrandBreakdown = brandBreakdown.filter(brand => categoryBrands.has(brand.name));
        
        return {
          level: 'category',
          parentId,
          parentName: category?.name,
          data: filteredBrandBreakdown
        };
        
      case 'brand':
        if (!parentId) {
          return { level: 'brand', data: [] };
        }
        
        const brand = Array.from(this.brands.values()).find(b => b.id === parentId);
        const brandProducts = Array.from(this.products.values()).filter(p => p.brand === brand?.name);
        
        // Get product performance for this brand
        const productPerformance = await this.getProductPerformance(50, undefined, brand?.name);
        const productBreakdown: RevenueBreakdown[] = productPerformance.map(product => ({
          name: product.name,
          value: product.totalRevenue,
          percentage: 0, // Will be calculated below
          count: product.totalOrdered
        }));
        
        // Calculate percentages
        const totalRevenue = productBreakdown.reduce((sum, item) => sum + item.value, 0);
        productBreakdown.forEach(item => {
          item.percentage = totalRevenue > 0 ? (item.value / totalRevenue) * 100 : 0;
        });
        
        return {
          level: 'brand',
          parentId,
          parentName: brand?.name,
          data: productBreakdown
        };
        
      default:
        return { level: 'summary', data: [] };
    }
  }

  // Stock management methods implementation
  async createStockBatch(batch: InsertStockBatch): Promise<StockBatch> {
    const id = randomUUID();
    const newBatch: StockBatch = {
      fileName: batch.fileName,
      uploadedBy: batch.uploadedBy,
      status: batch.status ?? "processing",
      recordsProcessed: batch.recordsProcessed ?? 0,
      recordsTotal: batch.recordsTotal ?? 0,
      errorLog: batch.errorLog ? [...batch.errorLog] : [],
      id,
      createdAt: new Date().toISOString(),
    };
    this.stockBatches.set(id, newBatch);
    return newBatch;
  }

  async getStockBatch(id: string): Promise<StockBatch | undefined> {
    return this.stockBatches.get(id);
  }

  async getStockBatches(): Promise<StockBatch[]> {
    return Array.from(this.stockBatches.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async updateStockBatch(id: string, updates: Partial<StockBatch>): Promise<StockBatch | undefined> {
    const batch = this.stockBatches.get(id);
    if (!batch) return undefined;
    
    const updatedBatch = { ...batch, ...updates };
    this.stockBatches.set(id, updatedBatch);
    return updatedBatch;
  }

  async createStockAdjustment(adjustment: InsertStockAdjustment): Promise<StockAdjustment> {
    const id = randomUUID();
    const newAdjustment: StockAdjustment = {
      ...adjustment,
      batchId: adjustment.batchId ?? null,
      reason: adjustment.reason ?? null,
      id,
      createdAt: new Date().toISOString(),
    };
    this.stockAdjustments.set(id, newAdjustment);

    // Update the actual product stock level in database
    const productResults = await db.select().from(productsTable).where(eq(productsTable.id, adjustment.productId)).limit(1);
    const product = productResults[0];
    
    if (product && product.availableSizes && product.availableSizes.length > 0) {
      // Calculate the exact change needed
      const stockChange = adjustment.newStock - adjustment.previousStock;
      
      // Get current total stock
      const currentTotal = product.availableSizes.reduce((sum, s) => sum + s.stock, 0);
      
      // Distribute the change proportionally across all sizes with exact math
      let remainingChange = stockChange;
      const updatedSizes = product.availableSizes.map((sizeStock, index) => {
        if (index === product.availableSizes.length - 1) {
          // Last size gets all remaining change to ensure exact total
          return { ...sizeStock, stock: Math.max(0, sizeStock.stock + remainingChange) };
        }
        
        if (currentTotal === 0) {
          // If current total is 0, distribute evenly
          const evenShare = Math.floor(stockChange / product.availableSizes.length);
          remainingChange -= evenShare;
          return { ...sizeStock, stock: Math.max(0, evenShare) };
        } else {
          // Distribute proportionally based on current stock, using floor
          const proportion = sizeStock.stock / currentTotal;
          const sizeChange = Math.floor(stockChange * proportion);
          remainingChange -= sizeChange;
          return { ...sizeStock, stock: Math.max(0, sizeStock.stock + sizeChange) };
        }
      });

      // Update product in database
      await db.update(productsTable)
        .set({ availableSizes: updatedSizes })
        .where(eq(productsTable.id, adjustment.productId));
    }

    return newAdjustment;
  }

  async getStockAdjustments(filters?: { batchId?: string; productId?: string }): Promise<StockAdjustment[]> {
    let adjustments = Array.from(this.stockAdjustments.values());
    
    if (filters) {
      if (filters.batchId) {
        adjustments = adjustments.filter(adj => adj.batchId === filters.batchId);
      }
      if (filters.productId) {
        adjustments = adjustments.filter(adj => adj.productId === filters.productId);
      }
    }
    
    return adjustments.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getProductStockHistory(productId: string): Promise<StockAdjustment[]> {
    return this.getStockAdjustments({ productId });
  }

  // Currency methods
  private currencies: Map<string, Currency> = new Map();
  private exchangeRates: Map<string, ExchangeRate> = new Map();

  async getCurrencies(): Promise<Currency[]> {
    return Array.from(this.currencies.values());
  }

  async getCurrency(id: string): Promise<Currency | undefined> {
    return this.currencies.get(id);
  }

  async getCurrencyByCode(code: string): Promise<Currency | undefined> {
    return Array.from(this.currencies.values()).find(c => c.code === code);
  }

  async createCurrency(currency: InsertCurrency): Promise<Currency> {
    const id = randomUUID();
    const newCurrency: Currency = {
      id,
      ...currency,
      isDefault: currency.isDefault ?? false,
      isActive: currency.isActive ?? true,
      createdAt: new Date().toISOString(),
    };
    this.currencies.set(id, newCurrency);
    return newCurrency;
  }

  async updateCurrency(id: string, updates: Partial<Currency>): Promise<Currency | undefined> {
    const currency = this.currencies.get(id);
    if (!currency) return undefined;
    const updated = { ...currency, ...updates };
    this.currencies.set(id, updated);
    return updated;
  }

  async deleteCurrency(id: string): Promise<boolean> {
    return this.currencies.delete(id);
  }

  async getExchangeRates(): Promise<ExchangeRate[]> {
    return Array.from(this.exchangeRates.values());
  }

  async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRate | undefined> {
    return Array.from(this.exchangeRates.values()).find(
      r => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency
    );
  }

  async setExchangeRate(rate: InsertExchangeRate): Promise<ExchangeRate> {
    const existing = await this.getExchangeRate(rate.fromCurrency, rate.toCurrency);
    if (existing) {
      const updated: ExchangeRate = {
        ...existing,
        rate: rate.rate,
        updatedBy: rate.updatedBy || null,
        updatedAt: new Date().toISOString(),
      };
      this.exchangeRates.set(existing.id, updated);
      return updated;
    }
    const id = randomUUID();
    const newRate: ExchangeRate = {
      id,
      ...rate,
      updatedBy: rate.updatedBy || null,
      updatedAt: new Date().toISOString(),
    };
    this.exchangeRates.set(id, newRate);
    return newRate;
  }

  async deleteExchangeRate(id: string): Promise<boolean> {
    return this.exchangeRates.delete(id);
  }

  async convertPrice(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) return amount;
    const rate = await this.getExchangeRate(fromCurrency, toCurrency);
    if (rate) {
      return amount * Number(rate.rate);
    }
    const reverseRate = await this.getExchangeRate(toCurrency, fromCurrency);
    if (reverseRate) {
      return amount / Number(reverseRate.rate);
    }
    return amount;
  }
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!email) return undefined;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    if (!googleId) return undefined;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.googleId, googleId));
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db.insert(usersTable).values(userData).returning();
    return user;
  }

  async upsertUser(userData: Partial<User> & { id: string }): Promise<User> {
    const [user] = await db
      .insert(usersTable)
      .values(userData as any)
      .onConflictDoUpdate({
        target: usersTable.id,
        set: {
          ...userData,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return user;
  }

  async getCustomerProfile(userId: string): Promise<CustomerProfile | undefined> {
    const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, userId));
    return profile;
  }

  async getCustomerProfilesByAccountManager(accountManagerId: string): Promise<CustomerProfile[]> {
    return await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.accountManagerId, accountManagerId));
  }

  async createCustomerProfile(profileData: InsertCustomerProfile): Promise<CustomerProfile> {
    const [profile] = await db.insert(customerProfilesTable).values(profileData).returning();
    return profile;
  }

  async updateCustomerProfile(userId: string, updates: Partial<CustomerProfile>): Promise<CustomerProfile | undefined> {
    const [profile] = await db
      .update(customerProfilesTable)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(customerProfilesTable.userId, userId))
      .returning();
    return profile;
  }

  async getBrands(): Promise<Brand[]> {
    return await db.select().from(brandsTable);
  }

  async getBrand(id: string): Promise<Brand | undefined> {
    const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, id));
    return brand;
  }

  async createBrand(brandData: InsertBrand): Promise<Brand> {
    const [brand] = await db.insert(brandsTable).values(brandData).returning();
    return brand;
  }

  async updateBrand(id: string, updates: Partial<Brand>): Promise<Brand | undefined> {
    const [brand] = await db.update(brandsTable).set(updates).where(eq(brandsTable.id, id)).returning();
    return brand;
  }

  async deleteBrand(id: string): Promise<boolean> {
    const result = await db.delete(brandsTable).where(eq(brandsTable.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getCategories(): Promise<Category[]> {
    return await db.select().from(categoriesTable);
  }

  async getCategory(id: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, id));
    return category;
  }

  async createCategory(categoryData: InsertCategory): Promise<Category> {
    const [category] = await db.insert(categoriesTable).values(categoryData).returning();
    return category;
  }

  async updateCategory(id: string, updates: Partial<Category>): Promise<Category | undefined> {
    const [category] = await db.update(categoriesTable).set(updates).where(eq(categoriesTable.id, id)).returning();
    return category;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const result = await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Delegate other methods to MemStorage for now
  private memStorage = new MemStorage();

  async init() {
    await this.memStorage.init();
  }

  async getCollections(): Promise<Collection[]> {
    return this.memStorage.getCollections();
  }

  async getCollectionsByCategory(categoryId: string): Promise<Collection[]> {
    return this.memStorage.getCollectionsByCategory(categoryId);
  }

  async getCollection(id: string): Promise<Collection | undefined> {
    return this.memStorage.getCollection(id);
  }

  async createCollection(collection: InsertCollection): Promise<Collection> {
    // Insert into database with sizeChartId
    const [newCollection] = await db.insert(collectionsTable).values({
      name: collection.name,
      slug: collection.slug,
      description: collection.description ?? null,
      discount: collection.discount ?? "0",
      validFrom: collection.validFrom ?? null,
      validTo: collection.validTo ?? null,
      productIds: (collection.productIds ?? []) as string[],
      isActive: collection.isActive ?? true,
      imageUrl: collection.imageUrl ?? null,
      featured: collection.featured ?? false,
      priority: collection.priority ?? 0,
      sizeChartId: collection.sizeChartId ?? null,
    }).returning();
    return newCollection;
  }

  async updateCollection(id: string, collection: Partial<Collection>): Promise<Collection | undefined> {
    return this.memStorage.updateCollection(id, collection);
  }

  async deleteCollection(id: string): Promise<boolean> {
    return this.memStorage.deleteCollection(id);
  }

  async getProducts(filters?: any): Promise<Product[]> {
    return this.memStorage.getProducts(filters);
  }

  async getProductCountsByBrand(filters?: { isPreOrder?: boolean; excludeCollections?: string[] }): Promise<Record<string, number>> {
    return this.memStorage.getProductCountsByBrand(filters);
  }

  async getFilteredProductCount(filters?: any): Promise<number> {
    return this.memStorage.getFilteredProductCount(filters);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return this.memStorage.getProduct(id);
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    return this.memStorage.createProduct(product);
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product | undefined> {
    return this.memStorage.updateProduct(id, updates);
  }

  async deleteProduct(id: string): Promise<boolean> {
    return this.memStorage.deleteProduct(id);
  }

  async deleteProducts(ids: string[]): Promise<number> {
    return this.memStorage.deleteProducts(ids);
  }

  async getProductsBySKU(sku: string): Promise<Product[]> {
    return this.memStorage.getProductsBySKU(sku);
  }

  async getCartItems(sessionId: string): Promise<CartItem[]> {
    return this.memStorage.getCartItems(sessionId);
  }

  async addCartItem(cartItem: InsertCartItem): Promise<CartItem> {
    return this.memStorage.addCartItem(cartItem);
  }

  async updateCartItem(id: string, cartItem: Partial<CartItem>): Promise<CartItem | undefined> {
    return this.memStorage.updateCartItem(id, cartItem);
  }

  async removeCartItem(id: string): Promise<boolean> {
    return this.memStorage.removeCartItem(id);
  }

  async clearCart(sessionId: string): Promise<boolean> {
    return this.memStorage.clearCart(sessionId);
  }

  async createOrder(orderData: InsertOrder): Promise<Order> {
    const [order] = await db.insert(ordersTable).values(orderData).returning();
    return order;
  }

  async getOrders(sessionId?: string, userId?: string): Promise<Order[]> {
    if (userId) {
      return await db.select().from(ordersTable).where(eq(ordersTable.userId, userId));
    }
    if (sessionId) {
      return await db.select().from(ordersTable).where(eq(ordersTable.sessionId, sessionId));
    }
    return await db.select().from(ordersTable);
  }

  async getAllOrders(): Promise<Order[]> {
    return await db.select().from(ordersTable);
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    return order;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
    const [order] = await db
      .update(ordersTable)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(ordersTable.id, id))
      .returning();
    return order;
  }

  async deleteOrder(id: string): Promise<boolean> {
    const result = await db.delete(ordersTable).where(eq(ordersTable.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async approveOrder(id: string, adminId: string): Promise<Order | undefined> {
    const [order] = await db
      .update(ordersTable)
      .set({
        approvalStatus: 'approved',
        approvedBy: adminId,
        approvedAt: sql`now()`,
        status: 'approved',
        updatedAt: sql`now()`,
      })
      .where(eq(ordersTable.id, id))
      .returning();
    return order;
  }

  async rejectOrder(id: string, adminId: string, reason: string): Promise<Order | undefined> {
    const [order] = await db
      .update(ordersTable)
      .set({
        approvalStatus: 'rejected',
        approvedBy: adminId,
        approvedAt: sql`now()`,
        rejectionReason: reason,
        status: 'rejected',
        updatedAt: sql`now()`,
      })
      .where(eq(ordersTable.id, id))
      .returning();
    return order;
  }

  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    return this.memStorage.getAnalyticsSummary();
  }

  async getOrderTrends(dateRange?: { from: string; to: string }): Promise<OrderTrend[]> {
    return this.memStorage.getOrderTrends(dateRange);
  }

  async getRevenueBreakdown(type: 'category' | 'brand', parentId?: string): Promise<RevenueBreakdown[]> {
    return this.memStorage.getRevenueBreakdown(type, parentId);
  }

  async getProductPerformance(limit?: number, category?: string, brand?: string): Promise<ProductPerformance[]> {
    return this.memStorage.getProductPerformance(limit, category, brand);
  }

  async getCartAnalytics(): Promise<CartAnalytics> {
    return this.memStorage.getCartAnalytics();
  }

  async getDrillDownData(level: 'summary' | 'category' | 'brand', parentId?: string): Promise<DrillDownData> {
    return this.memStorage.getDrillDownData(level, parentId);
  }

  async createStockBatch(batch: InsertStockBatch): Promise<StockBatch> {
    return this.memStorage.createStockBatch(batch);
  }

  async getStockBatch(id: string): Promise<StockBatch | undefined> {
    return this.memStorage.getStockBatch(id);
  }

  async getStockBatches(): Promise<StockBatch[]> {
    return this.memStorage.getStockBatches();
  }

  async updateStockBatch(id: string, updates: Partial<StockBatch>): Promise<StockBatch | undefined> {
    return this.memStorage.updateStockBatch(id, updates);
  }

  async createStockAdjustment(adjustment: InsertStockAdjustment): Promise<StockAdjustment> {
    return this.memStorage.createStockAdjustment(adjustment);
  }

  async getStockAdjustments(filters?: { batchId?: string; productId?: string }): Promise<StockAdjustment[]> {
    return this.memStorage.getStockAdjustments(filters);
  }

  async getProductStockHistory(productId: string): Promise<StockAdjustment[]> {
    return this.memStorage.getProductStockHistory(productId);
  }

  // Currency methods
  async getCurrencies(): Promise<Currency[]> {
    return await db.select().from(currenciesTable);
  }

  async getCurrency(id: string): Promise<Currency | undefined> {
    const [currency] = await db.select().from(currenciesTable).where(eq(currenciesTable.id, id));
    return currency;
  }

  async getCurrencyByCode(code: string): Promise<Currency | undefined> {
    const [currency] = await db.select().from(currenciesTable).where(eq(currenciesTable.code, code));
    return currency;
  }

  async createCurrency(currency: InsertCurrency): Promise<Currency> {
    const id = randomUUID();
    const [newCurrency] = await db.insert(currenciesTable).values({
      id,
      ...currency,
      createdAt: new Date().toISOString(),
    }).returning();
    return newCurrency;
  }

  async updateCurrency(id: string, updates: Partial<Currency>): Promise<Currency | undefined> {
    const [updated] = await db.update(currenciesTable)
      .set(updates)
      .where(eq(currenciesTable.id, id))
      .returning();
    return updated;
  }

  async deleteCurrency(id: string): Promise<boolean> {
    const result = await db.delete(currenciesTable).where(eq(currenciesTable.id, id)).returning();
    return result.length > 0;
  }

  async getExchangeRates(): Promise<ExchangeRate[]> {
    return await db.select().from(exchangeRatesTable);
  }

  async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRate | undefined> {
    const [rate] = await db.select().from(exchangeRatesTable)
      .where(and(
        eq(exchangeRatesTable.fromCurrency, fromCurrency),
        eq(exchangeRatesTable.toCurrency, toCurrency)
      ));
    return rate;
  }

  async setExchangeRate(rate: InsertExchangeRate): Promise<ExchangeRate> {
    const existing = await this.getExchangeRate(rate.fromCurrency, rate.toCurrency);
    if (existing) {
      const [updated] = await db.update(exchangeRatesTable)
        .set({
          rate: rate.rate,
          updatedBy: rate.updatedBy || null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(exchangeRatesTable.id, existing.id))
        .returning();
      return updated;
    }
    const id = randomUUID();
    const [newRate] = await db.insert(exchangeRatesTable).values({
      id,
      ...rate,
      updatedAt: new Date().toISOString(),
    }).returning();
    return newRate;
  }

  async deleteExchangeRate(id: string): Promise<boolean> {
    const result = await db.delete(exchangeRatesTable).where(eq(exchangeRatesTable.id, id)).returning();
    return result.length > 0;
  }

  async convertPrice(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) return amount;
    const rate = await this.getExchangeRate(fromCurrency, toCurrency);
    if (rate) {
      return amount * Number(rate.rate);
    }
    const reverseRate = await this.getExchangeRate(toCurrency, fromCurrency);
    if (reverseRate) {
      return amount / Number(reverseRate.rate);
    }
    return amount;
  }
}

let storageInstance: DbStorage | null = null;

export async function getStorage(): Promise<DbStorage> {
  if (!storageInstance) {
    storageInstance = new DbStorage();
    await storageInstance.init();
  }
  return storageInstance;
}

// Use DbStorage for production
const dbStorage = new DbStorage();
dbStorage.init();
export const storage = dbStorage;
