# Development log

Chronological record of code changes. Updated after every substantive code change per `.cursorrules` / `CLAUDE.md`.

---

### [SEQ-052] 2026-04-23 18:55

**Files:** `client/src/pages/stock-brands.tsx`, `DEVLOG.md`

**Action:** Scope brand hide/show loading state to clicked row

**Details:** Added per-row pending detection using `toggleBrandVisibilityMutation.variables?.brandId` so only the clicked brand’s hide/show button is disabled and shows spinner, instead of all brand rows entering loading state at once.

**Reason:** User reported that clicking `Hide` triggered loading indicators across all brands even though only one brand was being toggled.

---

### [SEQ-051] 2026-04-23 18:38

**Files:** `client/src/components/shop/ShopProductCard.tsx`, `DEVLOG.md`

**Action:** Tighten gender/price vertical spacing block

**Details:** Reduced reserved bottom area height (`pb-12 sm:pb-14`), decreased top offset above gender (`pt-1` with `leading-none`), and moved the price block slightly down (`bottom-2 sm:bottom-3`) to minimize extra vertical space around the gender row.

**Reason:** User requested less empty space above and below the gender text in the card’s bottom info section.

---

### [SEQ-049] 2026-04-23 18:04

**Files:** `client/src/components/shop/ShopProductCard.tsx`, `DEVLOG.md`

**Action:** Eliminate remaining price row gap

**Details:** Removed residual spacing in the bottom-right price block by setting container spacing to `space-y-0` and applying `leading-none` to both wholesale/retail lines, tightening vertical separation further.

**Reason:** User still observed a visible gap between the two price rows.

---

### [SEQ-048] 2026-04-23 18:01

**Files:** `client/src/components/shop/ShopProductCard.tsx`, `DEVLOG.md`

**Action:** Reduce vertical spacing between price lines

**Details:** Tightened the price block vertical gap by changing container spacing from `space-y-1` to `space-y-0.5`, reducing line separation between wholesale and retail rows.

**Reason:** User requested less vertical height between the two price rows.

---

### [SEQ-047] 2026-04-23 16:02

**Files:** `client/src/components/shop/ShopProductCard.tsx`, `DEVLOG.md`

**Action:** Increase product card price number font size

**Details:** Enlarged only the wholesale/retail price value text (`text-sm sm:text-base`, bold) while keeping the labels small and light gray to preserve label/value hierarchy.

**Reason:** User requested larger price numbers on the shop product card.

---

### [SEQ-046] 2026-04-23 15:59

**Files:** `client/src/components/shop/ShopProductCard.tsx`, `DEVLOG.md`

**Action:** Refine product card price label/amount contrast

**Details:** Styled `Wholesale Price` and `Retail Price` labels with smaller, lighter gray text while rendering the actual formatted price values in black with stronger weight for clearer contrast.

**Reason:** User requested subtle label styling with black price numbers for better readability hierarchy.

---

### [SEQ-045] 2026-04-23 15:55

**Files:** `client/src/components/shop/ShopProductCard.tsx`, `DEVLOG.md`

**Action:** Pin product card prices to bottom-right corner

**Details:** Made the card details container `relative`, moved the wholesale/retail price block to an absolute bottom-right position, and added bottom padding so all text stays above it; prices now render in the lower-right corner beneath other metadata.

**Reason:** User requested the price section appear in the corner below everything else on the product card.

---

### [SEQ-044] 2026-04-23 15:50

**Files:** `client/src/components/shop/ShopProductCard.tsx`, `DEVLOG.md`

**Action:** Improve product card price visibility and placement

**Details:** Reworked the price block in shop product cards so it anchors to the bottom-right area of the details section and increased typography for both `Wholesale Price` and `Retail Price` lines to improve readability.

**Reason:** User requested larger, clearer price labels/values positioned at the right bottom corner of the product card.

---

### [SEQ-043] 2026-04-23 15:28

**Files:** `client/src/components/shop/ShopProductCard.tsx`, `DEVLOG.md`

**Action:** Show wholesale and retail prices on shop cards

**Details:** Updated shop product card pricing section to display two lines: `Wholesale Price` and `Retail Price`, each formatted with the existing currency formatter and product base currency, with retail shown beneath wholesale.

**Reason:** User requested both wholesale and retail values be visible on product cards instead of showing only one price.

---

### [SEQ-042] 2026-04-23 15:21

**Files:** `client/src/components/shop/ShopCartTable.tsx`, `DEVLOG.md`

**Action:** Remove seam between sticky total columns

**Details:** Adjusted sticky totals column borders so `Total` now owns the shared divider (`border-r`) while `Total LP` no longer adds a duplicate left divider, eliminating the visible gap/seam between these two pinned-right columns in header and body.

**Reason:** User reported a small visual gap between `TOTAL` and `TOTAL LP` columns during scroll.

---

### [SEQ-041] 2026-04-23 15:19

**Files:** `client/src/components/shop/ShopCartTable.tsx`, `DEVLOG.md`

**Action:** Keep right sticky totals above scrollable cell overlays

**Details:** Increased z-index for sticky `Total` and `Total LP` header/body cells from `z-10` to `z-40` so these two pinned right columns always layer above quantity-cell overlay indicators while horizontally scrolling.

**Reason:** User reported blue indicators were rendering above the sticky totals columns during horizontal scroll and requested only this layering fix.

---

### [SEQ-040] 2026-04-23 15:06

**Files:** `client/src/components/shop/ShopCartTable.tsx`, `DEVLOG.md`

**Action:** Ensure cart table can scroll horizontally

**Details:** Updated the cart table wrapper to `overflow-x-scroll overflow-y-hidden` and set the table to `min-w-max w-full`, forcing content-width sizing so extra size columns create real horizontal overflow and can be scrolled.

**Reason:** User still could not scroll horizontally in the cart table despite the scrollbar visibility change.

---

### [SEQ-037] 2026-04-23 15:03

**Files:** `client/src/components/shop/ShopCartTable.tsx`, `DEVLOG.md`

**Action:** Force persistent horizontal scrollbar in cart table

**Details:** Changed the cart table scroll container from `overflow-x-auto` to `overflow-x-scroll` and added `scrollbar-gutter: stable` so the horizontal slider area remains visible and reserved consistently for the `ShopCartTable` size columns.

**Reason:** User requested the cart group/table horizontal slider always stay visible instead of only appearing in narrower viewport states.

---

### [SEQ-039] 2026-04-23 14:52

**Files:** `client/src/components/shop/ShopCartTable.tsx`, `DEVLOG.md`

**Action:** Keep cart drag handles visible at all times

**Details:** Updated cart table quantity-grid drag handle rendering so the cell fill handle and row copy corner handle are always visible instead of appearing only on hover. Removed now-unneeded hover tracking state and event handlers tied to that visibility behavior.

**Reason:** User requested the cart slider cursor/handle to always be visible for easier interaction.

---

### [SEQ-038] 2026-04-22 17:23

**Files:** `client/src/pages/shop.tsx`, `client/src/components/shop/ShopProductCard.tsx`, `DEVLOG.md`

**Action:** Restore 2-up mobile product grid with compact card content

**Details:** Changed the shop loading and product grids to render two columns on mobile while preserving existing tablet/laptop breakpoints. Tightened `ShopProductCard` spacing, badge/button sizing, thumbnail size, and text sizing for small screens only (`sm` and above keep prior desktop sizing) so two cards fit cleanly without content crowding.

**Reason:** User requested two products per row on phones with readable card content, while keeping laptop layout unchanged.

---

### [SEQ-037] 2026-04-22 17:17

**Files:** `client/src/pages/shop.tsx`, `DEVLOG.md`

**Action:** Make shop page mobile responsive and prevent layout overlap

**Details:** Updated the shop page to use mobile-first responsive classes: category tabs now scroll horizontally on small screens, the filter/search toolbar stacks cleanly instead of forcing one crowded row, the filter sidebar becomes full-width on mobile with constrained height, and product/loading grids now start at one column on phones before scaling up by breakpoint.

**Reason:** User reported that the shop page looked good on laptop but had overlapping and broken layout on phone screens.

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

### [SEQ-028] 2026-04-17 17:48

**Files:** `client/src/pages/account-manager.tsx`, `DEVLOG.md`

**Action:** Add per-order Excel export action in Orders table

**Details:** Added `xlsx` export support to Account Manager orders table with a new `Excel` action button beside existing row actions. Implemented `handleExportOrderExcel(order)` to transform order line items into worksheet rows, set readable column widths, generate `order_<id>_<date>.xlsx`, and show success/empty-order toast feedback.

**Reason:** User requested an Excel button in row actions to export each order.

---

### [SEQ-029] 2026-04-17 17:55

**Files:** `client/src/pages/account-manager.tsx`, `DEVLOG.md`

**Action:** Remove sensitive/status fields from order Excel export

**Details:** Updated row export mapping to exclude `Customer Email`, `Stage`, and `Status` columns while keeping the rest of the Excel export format unchanged. Adjusted worksheet column widths to match the reduced column set.

**Reason:** User requested these fields be removed from the generated Excel file.

---

### [SEQ-030] 2026-04-17 17:58

**Files:** `client/src/pages/account-manager.tsx`, `DEVLOG.md`

**Action:** Remove Approve/Reject buttons from orders table row actions

**Details:** Updated the Orders table action cell UI to remove inline `Approve` and `Reject` buttons while preserving existing `View`, `Excel`, and role-gated `Edit` actions. No backend approval/rejection logic was changed.

**Reason:** User requested Approve and Reject be hidden from the actions column UI without other changes.

---

### [SEQ-031] 2026-04-17 18:15

**Files:** `client/src/pages/account-manager.tsx`, `DEVLOG.md`

**Action:** Add strict view-only gate for order review modal

**Details:** Added `isViewOnlyOrder` UI state and wired `View` row action to open the same detailed order dialog in read-only mode. In view-only mode, mutating controls are hidden (order edit triggers, sales detail edits, draft cart edit CTA, approval/reject controls, save-edit button) while existing `Edit` behavior and logic remain unchanged.

**Reason:** User requested `View` to use the detailed modal style in strict read-only mode without changing edit flow logic.

---

### [SEQ-032] 2026-04-17 18:20

**Files:** `client/src/pages/account-manager.tsx`, `DEVLOG.md`

**Action:** Align View modal items panel with edit-style UI

**Details:** Updated `View` action to open the same edit-style order items panel structure by entering the same panel mode with read-only gating (`readOnly={isViewOnlyOrder}`), while hiding mutation controls (`Cancel`, `Add Item`) and showing a read-only mode label. Existing `Edit` behavior and logic remain unchanged.

**Reason:** User reported View still showed a different items layout and requested the exact edit-style UI in strict read-only mode.

---

### [SEQ-033] 2026-04-17 18:22

**Files:** `client/src/pages/account-manager.tsx`, `DEVLOG.md`

**Action:** Add Excel export button to order modal header meta row

**Details:** Inserted an `Excel` button next to the total amount in the modal header details line (`customer / email / phone / units / total`). Button styling matches actions table buttons and reuses existing `handleExportOrderExcel(selectedOrder)` flow.

**Reason:** User requested an Excel export button beside the total value in the order modal header UI.

---

### [SEQ-034] 2026-04-17 18:30

**Files:** `client/src/pages/account-manager.tsx`, `DEVLOG.md`

**Action:** Apply distinct color styling to modal Excel button

**Details:** Updated the modal header Excel export button to an emerald color scheme (`text-emerald-700`, `border-emerald-300`, `bg-emerald-50`, emerald hover states) to visually differentiate it from neutral action buttons.

**Reason:** User requested the modal Excel button appear in a different color.

---

### [SEQ-035] 2026-04-17 18:56

**Files:** `server/routes.ts`, `DEVLOG.md`

**Action:** Add draft rename API used by cart sidebar pen edit

**Details:** Implemented `PATCH /api/orders/:id` for draft cart rename with order existence check, draft-only guard, existing draft modification authorization (`userCanModifyDraftOrder`), non-empty name validation from `nickname`/`orderName`, and persistence to both fields.

**Reason:** Cart name edited in `ShopCartSidebar` briefly updated then reverted because rename requests needed a working backend endpoint.

---

### [SEQ-036] 2026-04-18 14:05

**Files:** `client/src/hooks/useCartContext.tsx`, `DEVLOG.md`

**Action:** Persist cart rename in sidebar + cart page without refetch revert

**Details:** Hardened `renameDraftMutation` so the server's authoritative updated order is merged into the drafts cache on success (removes the `onSettled` invalidate that triggered a refetch race and briefly flashed the old name back into `ShopCartSidebar` and the cart page). Added a destructive toast on failure via `getApiErrorMessage` so rejected renames (e.g., non-draft status or missing permission) no longer appear to silently revert.

**Reason:** User report: editing a cart name in the cart sidebar showed the new name for a few seconds and then reverted, both in the sidebar and on the cart page.

---
