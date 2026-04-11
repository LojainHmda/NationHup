# WholeSale Pro

## Overview
WholeSale Pro is a full-stack wholesale e-commerce application designed for footwear commerce. It offers a comprehensive platform for product catalog browsing, shopping cart management, and order processing, specifically tailored for wholesale businesses. The project's goal is to provide a modern, efficient, and user-friendly experience for managing wholesale transactions. Key capabilities include a sophisticated shop page with a multi-cart sidebar, an AI shopping assistant, and a robust order builder for managing multiple draft orders. The system supports both regular and pre-order workflows with extensive inventory and stock control features.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Frontend Framework**: React with TypeScript (SPA).
- **UI Library**: shadcn/ui built on Radix UI, styled with Tailwind CSS.
- **Layout**: Three-panel layout (filters, products, cart) with responsive design.
- **Shop Page**: Features product cards with quick add functionality and a collapsible multi-cart sidebar with an Excel-like grid-style size chart for bulk quantity entry.
- **AI Shopping Assistant**: Global chatbot for natural language product discovery, cart analysis, and voice-commanded navigation.
- **Order Builder**: Tab-based system for managing multiple draft orders with independent customer information and item assignment.
- **Stock Control**: Collapsible sidebar submenu for inventory management, stock upload, pre-order collections, batches, adjustments, and brand/category management.
- **Multi-Currency System**: Admin-managed currencies and exchange rates. Currency selection in product uploads (StockUploadV2, PreOrderUploadV2) and customer profile. Price conversion utility for customer-facing views. Currency Management admin page at /admin/currencies.
- **Product Detail Page**: Two-column responsive layout with image carousel, product details, color swatches, and rating block.
- **Cart Sidebar Redesign**: Modern gradient theme with improved stat cards and updated button styles.

### Technical Implementations
- **Backend**: Express.js with TypeScript, RESTful API architecture, JSON body parsing, centralized error handling, and Express sessions with PostgreSQL storage.
- **Data Layer**: PostgreSQL database, Drizzle ORM for type-safe operations and schema management, Neon Database for serverless hosting.
- **State Management**: TanStack Query for server state, Wouter for client-side routing, React Hook Form and Zod for form handling and validation.
- **Core Data Models**: Users, Products (with `isPreOrder` flag and `unitsPerCarton` for carton-sold products), Cart Items (session-based, batch organized), and Orders (distinguishing 'regular' and 'pre-order' types).
- **Three-Layer Category System**: Products are classified using three fixed filter layers stored in database fields (mainCategory, kidsGender, kidsAgeGroup). Layer 1 (Main Category): MEN, WOMEN, ADULT UNISEX, KIDS. Layer 2 (Kids Gender, only for KIDS): BOYS, GIRLS, UNISEX. Layer 3 (Kids Age Group, only for KIDS): NEW BORN, JUNIOR, LARGE, KIDS. During pre-order upload, raw Excel values are manually mapped to these standardized values. Shop filters use these fields: filtering by BOYS shows products where mainCategory=KIDS and kidsGender=BOYS.
- **Carton Products**: Products with `unitsPerCarton` field show a carton icon on product cards. Product detail page displays "Sold by carton" info with units per carton and sizes included. Auto-detection in uploads for columns like unitspercarton, cartonqty, pcspercarton, boxqty, packsize.
- **Limit Order**: Optional `limitOrder` integer field on products to restrict maximum quantity a customer can order. Values >=1 enforce the limit (shows toast notification and blocks add-to-cart if exceeded), null/0 means unlimited. Requires manual column mapping during upload. Validation implemented client-side (PreCartMatrix, QuickSizeSelector, SizeColorModal) and server-side (both /api/cart endpoints).
- **Order Workflow**: Includes `PreCartMatrix` modal for size/color configuration, stock validation, and automatic navigation to Order Builder. Orders are automatically marked as 'pre-order' if containing pre-order items.
- **Multi-Stage Order Approval System**: Orders follow a sequential approval chain: User submission → Account Manager approval → Sales approval → Finance approval → Admin approval → Completed. Account Manager is the mandatory first step after customer submission. Each role has a dedicated dashboard (Account Manager, Sales Dashboard, Finance Dashboard). Customer-facing order statuses are: New Order, Under Review, Approved, Rejected, Processing, Completed. Internal workflow stages are mapped to these customer-visible statuses.
- **Centralized Order History Page**: The `/order-history` page is the single source of truth for customers to track their orders. Features include: status filtering, search, collapsible sections grouped by status, status summary cards with counts, and order detail dialog. The cart sidebar only shows draft carts; submitted/rejected orders are tracked via Order History.
- **Account Manager Role**: The first mandatory approval step in the workflow. Account Managers can edit orders (add/remove items and sizes), and must provide discount percentage, payment method (cheques/bank_transfer/cash), and delivery method (pickup from warehouse/delivery to store) when approving. These fields are required - approval is blocked if any are missing. Test credentials: username=AccountManager, password=AccountManager.
- **Account Manager Order Creation**: Account Managers can create orders on behalf of customers. When an AM submits a cart, a dialog appears with: mandatory customer selection (searchable), payment method, delivery method, and optional discount. Orders created this way skip AM approval entirely (set to 'sales_approval' stage) since the AM already handled payment/delivery/discount during creation. Orders are assigned directly to the customer and show a note on the customer's Order History indicating the AM who created it. The `createdByAccountManagerId` and `createdByAccountManagerName` fields track the creating AM.
- **Staff User Roles**: customer, account_manager, sales, finance, warehouse, admin. Staff users: AccountManager/AccountManager, Sales/Sales, Finance/Finance, admin/admin.
- **AI Integration**: Backend implements 3 AI tools (`search_products`, `get_cart_summary`, `navigate_to`) for the AI Shopping Assistant.
- **Pre-Order Upload System**: Non-blocking background job processing for large Excel file uploads (100k+ rows) with real-time progress tracking, streaming Excel parser, disk-based file storage, and batch processing. Includes session recovery via localStorage persistence - users can disconnect/refresh during any step and resume where they left off. Recovery persists jobId, file preview data, header row selection, column mappings, size chart selection, and collection metadata until workflow completes.
- **Catalogue Upload Behavior**: For catalogue uploads, existing products are only updated if sizes or category fields (mainCategory, kidsGender, kidsAgeGroup) have changed. If a product already exists with the same data, it is skipped (not counted as "updated"). This means re-uploading the same file may show "0 updated" for products that already exist. Debug logging is available to track skipped products.
- **Collection Type Support**: Both stock and pre-order uploads can be assigned to collections. The Collections page (`/admin/stock/collections`) has two tabs: "Pre-Order Collections" and "Stock Collections". The `preorderCollectionSettings` table stores `collectionType` ('preorder' or 'stock') for each collection. Products from stock uploads have `isPreOrder: false`, while pre-order products have `isPreOrder: true`.
- **Reusable Size Charts**: Size chart management system with CRUD operations. Size charts (containing ordered lists of sizes like [36, 37, 38, 39, 40]) can be created once and assigned to multiple pre-order collections. During pre-order upload, users select or create a size chart after previewing products.
- **SKU Consolidation**: Unified product creation flow for both Stock and Pre-Order uploads, consolidating rows with the same SKU into a single product object.
- **Division Mapping**: During stock/pre-order uploads, users manually map product categories to divisions (Footwear, Apparel, Accessories) for shop page filtering. Auto-suggestion logic pre-populates mappings based on category keywords (shoe/sandal→Footwear, shirt/pants/dress→Apparel, bags/hats/belts→Accessories). Division values are stored on products and used for shop filtering.
- **Real-time Admin Order Updates**: WebSocket-based real-time notifications for admin users when new orders are submitted.
- **Optimistic UI Updates**: Instantaneous cart updates and auto-save on click-outside for improved user experience.
- **Development Workflow**: Full TypeScript across stack, shared schema definitions, Vite development server, and path aliases.

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting.
- **Drizzle ORM**: Type-safe database operations and migrations.

### UI and Styling
- **Radix UI**: Accessible component primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library.
- **Google Fonts**: Inter font family.

### State Management and Data Fetching
- **TanStack Query**: Server state management and caching.
- **React Hook Form**: Form handling with validation.
- **Zod**: Runtime type validation and schema parsing.

### Session and Storage
- **connect-pg-simple**: PostgreSQL session store for Express.
- **express-session**: Session management middleware.

### AI and Machine Learning
- **OpenAI**: GPT-4o-mini for conversational AI chatbot.
- **Replit AI Integrations**: Managed OpenAI API access.

### Image Storage
- **Cloudinary**: Product images uploaded via Excel are stored on Cloudinary for fast, global CDN delivery. Temporary folder workflow for image extraction, batch upload, and deletion without permanent local storage.
- **Google Drive**: Integration for image extraction during Excel stock uploads.