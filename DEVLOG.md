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
