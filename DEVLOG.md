# Development log

Chronological record of code changes. Updated after every substantive code change per `.cursorrules` / `CLAUDE.md`.

---

### [SEQ-001] 2026-04-11

**Files:** `DEVLOG.md`, `.cursorrules`, `CLAUDE.md`

**Action:** Initialized dev log and AI change-tracking rules

**Details:** Added this file at the repo root, Cursor rules, and Claude Code instructions requiring a new `DEVLOG.md` entry after each code change (timestamp, files, action, details, reason, sequence number).

**Reason:** Project request to track changes in a single dev log.

---

### [SEQ-002] 2026-04-11

**Files:** `client/src/components/SidebarNav.tsx`

**Action:** Hide Inventory link from admin sidebar

**Details:** Removed the "Inventory" sub-item (`/admin/stock/inventory`) from the "Stock & Inventory" section. The route may still exist for direct URLs.

**Reason:** User requested hiding that nav item.

---

### [SEQ-003] 2026-04-11

**Files:** `client/src/components/SidebarNav.tsx`

**Action:** Hide main Dashboard link for internal roles

**Details:** Removed the top-level "Dashboard" (`/`) nav item from `adminNavItems`, `staffNavItems`, `salesNavItems`, `financeNavItems`, and `accountManagerNavItems`. Guest and customer nav still include Dashboard.

**Reason:** User requested hiding Dashboard from sidebar for admins, staff, sales, finance, and account managers.

---

### [SEQ-004] 2026-04-11

**Files:** `client/src/components/SidebarNav.tsx`

**Action:** Grouped shops and order flows into `Shops` and `Orders` dropdowns

**Details:** Added collapsible **Shops** (Stock Shop, Pre Order Shop) and **Orders** (Pre-order Management, Global Orders, Customer Orders for admin/staff; Global Orders only for sales/finance/account managers). Removed standalone shop links and duplicate Pre-order Management entry. Default expanded sections include `Shops` and `Orders`. Imported `Store` icon for Shops.

**Reason:** User requested sidebar rearrangement.

---

### [SEQ-005] 2026-04-11

**Files:** `client/src/components/SidebarNav.tsx`

**Action:** Single "Shops and Orders" menu with nested Shops / Orders labels

**Details:** Replaced separate Shops and Orders top-level groups with one collapsible **Shops and Orders** item. Sub-items use optional `group` (`Shops` | `Orders`) to render subsection headings; admin/staff include full order links, sales/finance/account managers include Global Orders under Orders. Default expanded key updated. `data-testid` menu slug uses all spaces to hyphens.

**Reason:** User wanted one parent label with the same two subsections underneath.

---

### [SEQ-006] 2026-04-11

**Files:** `client/src/components/SidebarNav.tsx`

**Action:** Nested dropdowns for Shops and Orders under "Shops and Orders"

**Details:** Introduced `NavSubGroup` / `subGroups` data and `expandedSubGroups` state. **Shops** and **Orders** are each independently expandable (chevron) with links nested one level deeper. Flat `subItems` menus unchanged. Defaults: both sub-groups expanded (`Shops and Orders::Shops`, `Shops and Orders::Orders`).

**Reason:** User requested Shops and Orders behave as separate dropdowns, not static headings.

---

### [SEQ-007] 2026-04-11

**Files:** `client/src/pages/admin-users.tsx`

**Action:** Customer Management table header background and uniform table typography

**Details:** Applied slate header background on `TableHeader` / `TableHead`, removed bold (`font-semibold` / `font-medium`) from headers and cells, standardized body text to `text-xs font-normal` with consistent slate foreground; status badges use `text-xs font-normal`; joined column matches other cells.

**Reason:** User requested header background and uniform font size/weight in the admin users table.

---

### [SEQ-008] 2026-04-11

**Files:** `client/src/pages/admin-users.tsx`

**Action:** Smaller table typography on Customer Management

**Details:** Customer users table uses `text-[10px]` with `leading-tight`, tighter header row height, smaller sort icons and row icons, status badges at `text-[10px]`, slightly smaller action buttons to match.

**Reason:** User requested smaller font in the table.

---

### [SEQ-009] 2026-04-11

**Files:** `client/src/pages/admin-users.tsx`

**Action:** Removed leading icons from Email, Phone, and Company table cells

**Details:** Dropped Mail, Phone, and Building2 icons before cell values; cells now show plain text. Removed unused lucide imports (`Mail`, `Phone`, `Building2`, `MapPin`).

**Reason:** User requested no icons in front of column values.

---

### [SEQ-010] 2026-04-11

**Files:** `client/src/pages/admin-users.tsx`

**Action:** Customer table vertical borders and smaller type

**Details:** Table uses `border-collapse`, outer `border`, and `border-r` on `th`/`td` (cleared on last column) for column dividers. Body/header text reduced from `10px` to `9px`; status badges match; sort icons `h-2 w-2`; header row `h-9`.

**Reason:** User asked for vertical borders and smaller table font.

---

### [SEQ-011] 2026-04-11

**Files:** `client/src/pages/user-roles.tsx`

**Action:** Align User Roles Management with Customer Management table and page shell

**Details:** Applied same gradient `min-h-screen` layout, `max-w-7xl` container, header styling (blue `Users` icon, primary CTA), compact `CardHeader`/`CardContent`. Table matches admin users: `text-[9px]`, slate header background, outer border, vertical column borders, `font-normal` cells, role badges `text-[9px] font-normal`, loading spinner and empty state patterns aligned with Customer Management.

**Reason:** User requested the same design as Customer Management for User Roles Management.

---

### [SEQ-012] 2026-04-11

**Files:** `client/src/pages/user-roles.tsx`

**Action:** Staff Users filter strip matching Customer Users layout

**Details:** Added count pills (All Users + each staff role: Admin, Sales, Finance, Account Manager, Warehouse), search field, and role `Select` with the same spacing and ring styles as Customer Management. `filteredUsers` applies role filter and text search; empty state when no rows match filters. Staff accounts have no customer profile status, so filters are **by role** rather than Active/Suspended/On Hold.

**Reason:** User asked for Customer Users–style filters next to Staff Users.

---

### [SEQ-013] 2026-04-11

**Files:** `client/src/components/SidebarNav.tsx`

**Action:** Admin sidebar — Products Management and Product Catalog

**Details:** Renamed **Stock & Inventory** to **Products Management**; moved **All Products** (`/admin/products`) into that group as **Product Catalog** (first sub-item); removed duplicate top-level All Products link. Default expanded section key updated to `Products Management`.

**Reason:** User requested renamed group and catalog link under it.

---

### [SEQ-014] 2026-04-11

**Files:** `client/src/components/SidebarNav.tsx`

**Action:** Collections under uploads in Products Management

**Details:** Added **Collections** (`/admin/stock/collections`, `Heart` icon) immediately after **Catalogue Upload** under **Products Management**. Removed duplicate **Collections** entry from **Catalog** (Brands, Categories only).

**Reason:** User asked to place collections under uploads.

---

### [SEQ-015] 2026-04-11

**Files:** `client/src/components/SidebarNav.tsx`

**Action:** Product Catalog after Collections in Products Management

**Details:** Reordered sub-items: Upload Products → Catalogue Upload → Collections → **Product Catalog** → Batches → Adjustments.

**Reason:** User requested Product Catalog placed under Collections.

---

### [SEQ-016] 2026-04-11

**Files:** `client/src/components/SidebarNav.tsx`

**Action:** Renamed sidebar **Catalog** group to **Brands**

**Details:** Parent label `Catalog` → `Brands`; default expanded nav key updated. Sub-links unchanged (Brands, Categories).

**Reason:** User requested renaming Catalog to Brands.

---

### [SEQ-017] 2026-04-11

**Files:** `client/src/components/SidebarNav.tsx`

**Action:** Sidebar dropdowns collapsed by default

**Details:** Initial `expandedItems` and `expandedSubGroups` set to empty arrays so top-level sections and nested Shops/Orders groups start closed; users expand as needed.

**Reason:** User requested default collapsed dropdowns.

---

### [SEQ-018] 2026-04-11

**Files:** `client/src/components/SidebarNav.tsx`

**Action:** Sidebar brand title ShoeHub → NationHub

**Details:** Top-of-sidebar heading text updated to **NationHub**.

**Reason:** User requested rename.

---

### [SEQ-019] 2026-04-12 12:00

**Files:** `.gitignore`, `.env.example`, `server_output.txt`, `startup.log`, `DEVLOG.md`

**Action:** Harden secret hygiene before GitHub push

**Details:** Added `.env.example` with placeholder-only variables (no real secrets). Expanded `.gitignore` for PEM/credential JSON patterns and ensured local logs stay untracked. Removed `server_output.txt` and `startup.log` from version control (files remain locally ignored). Sanitized local `.env.clean` template to placeholders so copies cannot leak DB or cloud keys.

**Reason:** GitHub secret scanning flagged Google Cloud–related material in a prior push; keep credentials in env/secret stores only and avoid committing logs or key files.

---

### [SEQ-020] 2026-04-15 14:35

**Files:** `client/src/pages/admin-users.tsx`, `DEVLOG.md`

**Action:** Remove per-row delete (trash) control on Admin Users table

**Details:** Deleted the ghost `Button` that wrapped `Trash2` and opened the delete confirmation dialog from each customer row; edit and reset-password actions unchanged. Delete confirmation UI remains in the file for any other entry points if added later.

**Reason:** User requested removal of the trash icon button only.

---

### [SEQ-021] 2026-04-15 15:10

**Files:** `client/src/pages/cart.tsx`, `client/src/hooks/useOrderEditShopCartModel.ts`, `DEVLOG.md`

**Action:** Stabilize cart section grouping for kids products

**Details:** `getDisplayCategory` now treats `kidsAgeGroup` values **`KIDS`** (schema layer) and **`Infant`** (filter label) as kids before falling through to Women/Men, and maps **`mainCategory` `Male`/`Female`** to the same Men/Women buckets as `MEN`/`WOMEN` so rows are not classified only via `gender` when age metadata was present but previously unmatched.

**Reason:** Kids lines sometimes appeared under Women because `KIDS`/`Infant` were not handled and `Female` main category was not aligned with the Women branch.

---

### [SEQ-022] 2026-04-15 15:45

**Files:** `client/src/pages/cart.tsx`, `DEVLOG.md`

**Action:** Match cart page footer background to shop cart sidebar

**Details:** Cart footer `className` `bg-white` replaced with `bg-[#DDE3E2]` (same token as `ShopCartSidebar` / layout rail).

**Reason:** User requested footer use the sidebar gray background.

---

### [SEQ-023] 2026-04-15 16:00

**Files:** `client/src/pages/cart.tsx`, `DEVLOG.md`

**Action:** Submit Cart hover uses theme primary

**Details:** For `data-testid="button-submit-cart"` only, `hover:bg-[#e06a10]` replaced with `hover:bg-primary`; default orange fill unchanged.

**Reason:** User requested hover state use primary color.

---

### [SEQ-024] 2026-04-15 16:20

**Files:** `client/src/pages/cart.tsx`, `DEVLOG.md`

**Action:** Cart header actions use default primary `Button` styling

**Details:** **Back to Shop** no longer uses `variant="ghost"` with orange hover; **Empty Cart** no longer uses `variant="destructive"`; **Submit Cart** drops custom orange classes. All three rely on the shared `Button` default variant (`bg-primary`, `text-primary-foreground`, `hover:bg-primary/90`) plus existing layout classes.

**Reason:** User requested Back, Empty, and Submit use primary theme color.

---

### [SEQ-025] 2026-04-15 16:35

**Files:** `client/src/components/shop/ShopCartTable.tsx`, `DEVLOG.md`

**Action:** Cart row delete icon hover uses primary background

**Details:** Per-row trash `Button` (`button-delete-*`) adds `hover:bg-primary` so hover overrides ghost `hover:bg-accent`; `hover:text-red-600` / dark red hover unchanged.

**Reason:** User asked for primary hover background only, not text/icon color changes.

---

### [SEQ-026] 2026-04-15 16:50

**Files:** `client/src/pages/order-history.tsx`, `DEVLOG.md`

**Action:** Order card "View Details" ghost button uses primary hover fill

**Details:** Replaced `hover:text-primary/90` with `hover:bg-primary hover:text-primary-foreground` on the ghost `Button` so hover matches primary CTA styling instead of default accent.

**Reason:** User requested same primary hover treatment as other actions.

---

### [SEQ-027] 2026-04-15 17:10

**Files:** `client/src/pages/order-history.tsx`, `DEVLOG.md`

**Action:** Order detail dialog hides line-item product lists

**Details:** Removed the **Order Items** (brand-grouped products with thumbnails) and **Items removed by our team** sections from the selected-order `Dialog`. Kept summary grid (Order ID, Date, Type, item count), rejection notice when applicable, Account Manager creation banner, and Subtotal/Discount/Total block. Removed unused helpers: `StaffRemovedLine`, `lineItemImageUrl`, `LineItemThumbnail`, `staffRemovalRoleLabel`.

**Reason:** User asked not to show product lines in the popup—only summary, AM note, and totals.

---
