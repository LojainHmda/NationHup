import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, ShoppingCart, User, LogOut, Layers, Settings, BarChart3, ChevronLeft, ChevronRight, Filter, ChevronDown, ChevronUp, PackageOpen, TrendingUp, Heart, FileText, Upload, Users, ClipboardList, UserCog, DollarSign, Calculator, Coins, BookOpen, Package, Truck, Store } from "lucide-react";
import { NationHubLogo } from "@/components/NationHubLogo";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface SubNavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** Nested dropdown under a parent (e.g. Shops / Orders under "Shops and Orders") */
interface NavSubGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SubNavItem[];
}

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  subItems?: SubNavItem[];
  subGroups?: NavSubGroup[];
}

// Guest users (not logged in)
const guestNavItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Shop", href: "/shop/pre-order", icon: ShoppingCart },
];

// Customer users
const customerNavItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Shop", href: "/shop/pre-order", icon: ShoppingCart },
  { label: "Profile", href: "/profile", icon: User },
];

// Sales users - have their own dashboard
const salesNavItems: NavItem[] = [
  { label: "Sales Dashboard", href: "/sales-dashboard", icon: DollarSign },
  {
    label: "Shops and Orders",
    icon: Store,
    subGroups: [
      {
        label: "Shops",
        icon: Package,
        items: [
          { label: "Stock Shop", href: "/shop/stock", icon: Package },
          { label: "Pre Order Shop", href: "/shop/pre-order", icon: ShoppingCart },
        ],
      },
      {
        label: "Orders",
        icon: ClipboardList,
        items: [{ label: "Global Orders", href: "/global-orders", icon: ClipboardList }],
      },
    ],
  },
  { label: "Profile", href: "/profile", icon: User },
];

// Finance users - have their own dashboard
const financeNavItems: NavItem[] = [
  { label: "Finance Dashboard", href: "/finance-dashboard", icon: Calculator },
  {
    label: "Shops and Orders",
    icon: Store,
    subGroups: [
      {
        label: "Shops",
        icon: Package,
        items: [
          { label: "Stock Shop", href: "/shop/stock", icon: Package },
          { label: "Pre Order Shop", href: "/shop/pre-order", icon: ShoppingCart },
        ],
      },
      {
        label: "Orders",
        icon: ClipboardList,
        items: [{ label: "Global Orders", href: "/global-orders", icon: ClipboardList }],
      },
    ],
  },
  { label: "Profile", href: "/profile", icon: User },
];

// Account Manager users - have their own orders dashboard
const accountManagerNavItems: NavItem[] = [
  { label: "Orders Dashboard", href: "/account-manager", icon: Users },
  {
    label: "Shops and Orders",
    icon: Store,
    subGroups: [
      {
        label: "Shops",
        icon: Package,
        items: [
          { label: "Stock Shop", href: "/shop/stock", icon: Package },
          { label: "Pre Order Shop", href: "/shop/pre-order", icon: ShoppingCart },
        ],
      },
      {
        label: "Orders",
        icon: ClipboardList,
        items: [{ label: "Global Orders", href: "/global-orders", icon: ClipboardList }],
      },
    ],
  },
  { label: "Profile", href: "/profile", icon: User },
];

// Staff users (fallback) - can view and approve orders
const staffNavItems: NavItem[] = [
  {
    label: "Shops and Orders",
    icon: Store,
    subGroups: [
      {
        label: "Shops",
        icon: Package,
        items: [
          { label: "Stock Shop", href: "/shop/stock", icon: Package },
          { label: "Pre Order Shop", href: "/shop/pre-order", icon: ShoppingCart },
        ],
      },
      {
        label: "Orders",
        icon: ClipboardList,
        items: [
          { label: "Pre-order Management", href: "/admin/preorder-management", icon: Truck },
          { label: "Global Orders", href: "/global-orders", icon: ClipboardList },
          { label: "Customer Orders", href: "/admin/orders", icon: FileText },
        ],
      },
    ],
  },
  { label: "Profile", href: "/profile", icon: User },
];

// Admin users
const adminNavItems: NavItem[] = [
  {
    label: "Shops and Orders",
    icon: Store,
    subGroups: [
      {
        label: "Shops",
        icon: Package,
        items: [
          { label: "Stock Shop", href: "/shop/stock", icon: Package },
          { label: "Pre Order Shop", href: "/shop/pre-order", icon: ShoppingCart },
        ],
      },
      {
        label: "Orders",
        icon: ClipboardList,
        items: [
          { label: "Pre-order Management", href: "/admin/preorder-management", icon: Truck },
          { label: "Global Orders", href: "/global-orders", icon: ClipboardList },
          { label: "Customer Orders", href: "/admin/orders", icon: FileText },
        ],
      },
    ],
  },
  { 
    label: "Account & Users", 
    icon: Users,
    subItems: [
      { label: "Manage Customers", href: "/admin/users", icon: Users },
      { label: "User Roles", href: "/admin/user-roles", icon: UserCog },
    ]
  },
  { 
    label: "Products Management", 
    icon: PackageOpen,
    subItems: [
      { label: "Upload Products", href: "/admin/stock/upload", icon: Upload },
      { label: "Catalogue Upload", href: "/admin/stock/catalogue", icon: BookOpen },
      { label: "Collections", href: "/admin/stock/collections", icon: Heart },
      { label: "Product Catalog", href: "/admin/products", icon: Package },
      { label: "Batches", href: "/admin/stock/batches", icon: Layers },
      { label: "Adjustments", href: "/admin/stock/adjustments", icon: TrendingUp },
    ]
  },
  { 
    label: "Brands", 
    icon: Filter,
    subItems: [
      { label: "Brands", href: "/admin/stock/brands", icon: Layers },
      { label: "Categories", href: "/admin/stock/categories", icon: Filter },
    ]
  },
  { 
    label: "Settings", 
    icon: Settings,
    subItems: [
      { label: "Currencies", href: "/admin/currencies", icon: Coins },
    ]
  },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Admin", href: "/admin", icon: Settings },
  { label: "Profile", href: "/profile", icon: User },
];

export function SidebarNav() {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  /** Keys like `Shops and Orders::Shops` for nested dropdowns under `subGroups` */
  const [expandedSubGroups, setExpandedSubGroups] = useState<string[]>([]);
  const { user, logout, isLoggingOut, isAdmin, isCustomer, isStaff, isAccountManager } = useAuth();
  
  const shouldExpand = !isCollapsed || isHovered;

  // Select navigation items based on user role
  const getNavItems = () => {
    if (isAdmin) return adminNavItems;
    if (isAccountManager) return accountManagerNavItems;
    if (user?.role === 'sales') return salesNavItems;
    if (user?.role === 'finance') return financeNavItems;
    if (isStaff) return staffNavItems;
    if (isCustomer) return customerNavItems;
    return guestNavItems;
  };
  const navItems = getNavItems();

  const toggleExpanded = (label: string) => {
    setExpandedItems(prev => 
      prev.includes(label) ? prev.filter(item => item !== label) : [...prev, label]
    );
  };

  const toggleExpandedSubGroup = (key: string) => {
    setExpandedSubGroups((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <div 
      className={cn(
        "flex flex-col h-screen bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] border-r border-[hsl(var(--sidebar-border))] transition-all duration-300 z-50",
        shouldExpand ? "w-64" : "w-20"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={cn(
        "flex items-center gap-3 py-6 border-b border-[hsl(var(--sidebar-border))]",
        shouldExpand ? "px-6" : "px-4 justify-center"
      )}>
        <NationHubLogo className="w-10 h-10" color="hsl(var(--sidebar-primary-foreground))" />
        {shouldExpand && (
          <div>
            <h1 className="text-lg font-bold">NationHub</h1>
            <p className="text-xs text-[hsl(var(--sidebar-foreground))]/70">B2B Order Platform</p>
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const hasSubGroups = item.subGroups && item.subGroups.length > 0;
          const hasFlatSubItems = item.subItems && item.subItems.length > 0;
          const hasSubNav = hasSubGroups || hasFlatSubItems;
          const isExpanded = expandedItems.includes(item.label);
          const isActive = item.href && location === item.href;
          const isParentActive =
            item.subItems?.some((sub) => location === sub.href) ||
            item.subGroups?.some((g) => g.items.some((sub) => location === sub.href));

          if (hasSubNav) {
            return (
              <div key={item.label}>
                <div
                  onClick={() => shouldExpand && toggleExpanded(item.label)}
                  className={cn(
                    "flex items-center gap-3 py-3 text-sm font-medium transition-colors cursor-pointer",
                    shouldExpand ? "px-6" : "px-4 justify-center",
                    "hover:bg-[hsl(var(--sidebar-accent))]",
                    isParentActive && "bg-[hsl(var(--sidebar-accent))]/50"
                  )}
                  title={!shouldExpand ? item.label : undefined}
                  data-testid={`menu-${item.label.toLowerCase().replace(/ /g, '-')}`}
                >
                  <Icon className="w-5 h-5" />
                  {shouldExpand && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </>
                  )}
                </div>
                {shouldExpand && isExpanded && hasSubGroups && item.subGroups && (
                  <div className="bg-[hsl(var(--sidebar-accent))]/30">
                    {item.subGroups.map((subGroup) => {
                      const subKey = `${item.label}::${subGroup.label}`;
                      const isSubExpanded = expandedSubGroups.includes(subKey);
                      const SubGroupIcon = subGroup.icon;
                      const isSubGroupRouteActive = subGroup.items.some((s) => location === s.href);

                      return (
                        <div key={subKey}>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              if (shouldExpand) toggleExpandedSubGroup(subKey);
                            }}
                            className={cn(
                              "flex items-center gap-2 py-2 pl-10 pr-4 text-sm font-medium transition-colors cursor-pointer",
                              "hover:bg-[hsl(var(--sidebar-accent))]",
                              isSubGroupRouteActive && "bg-[hsl(var(--sidebar-accent))]/40"
                            )}
                            data-testid={`menu-${item.label.toLowerCase().replace(/ /g, "-")}-${subGroup.label.toLowerCase()}`}
                          >
                            <SubGroupIcon className="w-4 h-4 shrink-0" />
                            <span className="flex-1">{subGroup.label}</span>
                            {isSubExpanded ? (
                              <ChevronUp className="w-4 h-4 shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 shrink-0" />
                            )}
                          </div>
                          {isSubExpanded &&
                            subGroup.items.map((subItem) => {
                              const SubIcon = subItem.icon;
                              const isSubActive = location === subItem.href;
                              return (
                                <Link
                                  key={subItem.href}
                                  href={subItem.href}
                                  data-testid={`link-${subItem.label.toLowerCase().replace(/ /g, "-")}`}
                                >
                                  <div
                                    className={cn(
                                      "flex items-center gap-3 py-2 pl-14 pr-6 text-sm font-medium transition-colors cursor-pointer",
                                      "hover:bg-[hsl(var(--sidebar-accent))]",
                                      isSubActive &&
                                        "bg-[hsl(var(--sidebar-accent))] border-l-4 border-[hsl(var(--sidebar-primary))]"
                                    )}
                                  >
                                    <SubIcon className="w-4 h-4" />
                                    <span>{subItem.label}</span>
                                  </div>
                                </Link>
                              );
                            })}
                        </div>
                      );
                    })}
                  </div>
                )}
                {shouldExpand && isExpanded && hasFlatSubItems && item.subItems && (
                  <div className="bg-[hsl(var(--sidebar-accent))]/30">
                    {item.subItems.map((subItem) => {
                      const SubIcon = subItem.icon;
                      const isSubActive = location === subItem.href;
                      return (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          data-testid={`link-${subItem.label.toLowerCase().replace(/ /g, "-")}`}
                        >
                          <div
                            className={cn(
                              "flex items-center gap-3 py-2 pl-14 pr-6 text-sm font-medium transition-colors cursor-pointer",
                              "hover:bg-[hsl(var(--sidebar-accent))]",
                              isSubActive &&
                                "bg-[hsl(var(--sidebar-accent))] border-l-4 border-[hsl(var(--sidebar-primary))]"
                            )}
                          >
                            <SubIcon className="w-4 h-4" />
                            <span>{subItem.label}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href!}
              data-testid={`link-${item.label.toLowerCase().replace(' ', '-')}`}
            >
              <div
                className={cn(
                  "flex items-center gap-3 py-3 text-sm font-medium transition-colors cursor-pointer",
                  shouldExpand ? "px-6" : "px-4 justify-center",
                  "hover:bg-[hsl(var(--sidebar-accent))]",
                  isActive && "bg-[hsl(var(--sidebar-accent))] border-l-4 border-[hsl(var(--sidebar-primary))]"
                )}
                title={!shouldExpand ? item.label : undefined}
              >
                <Icon className="w-5 h-5" />
                {shouldExpand && <span>{item.label}</span>}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[hsl(var(--sidebar-border))] p-4">
        {user ? (
          <>
            {shouldExpand ? (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[hsl(var(--sidebar-primary))] flex items-center justify-center text-[hsl(var(--sidebar-primary-foreground))] font-semibold">
                  {user.displayName?.charAt(0).toUpperCase() || user.username?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "U"}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium" data-testid="text-username">{user.displayName || user.username || "User"}</p>
                  <p className="text-xs text-[hsl(var(--sidebar-foreground))]/70" data-testid="text-email">{user.email || ""}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center mb-4">
                <div className="w-10 h-10 rounded-full bg-[hsl(var(--sidebar-primary))] flex items-center justify-center text-[hsl(var(--sidebar-primary-foreground))] font-semibold">
                  {user.displayName?.charAt(0).toUpperCase() || user.username?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "U"}
                </div>
              </div>
            )}
            
            <button
              onClick={logout}
              disabled={isLoggingOut}
              data-testid="button-logout"
              className={cn(
                "flex items-center gap-2 w-full py-2 text-sm text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))] transition-colors disabled:opacity-50",
                shouldExpand ? "px-3" : "justify-center px-0"
              )}
              title={!shouldExpand ? "Logout" : undefined}
            >
              <LogOut className="w-4 h-4" />
              {shouldExpand && <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>}
            </button>
          </>
        ) : (
          <>
            {shouldExpand ? (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[hsl(var(--sidebar-primary))] flex items-center justify-center text-[hsl(var(--sidebar-primary-foreground))] font-semibold">
                  G
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium" data-testid="text-username">Guest</p>
                  <p className="text-xs text-[hsl(var(--sidebar-foreground))]/70" data-testid="text-email">Browse Only</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center mb-4">
                <div className="w-10 h-10 rounded-full bg-[hsl(var(--sidebar-primary))] flex items-center justify-center text-[hsl(var(--sidebar-primary-foreground))] font-semibold">
                  G
                </div>
              </div>
            )}
            
            <Link href="/login">
              <button
                data-testid="button-login"
                className={cn(
                  "flex items-center gap-2 w-full py-2 text-sm text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))] transition-colors",
                  shouldExpand ? "px-3" : "justify-center px-0"
                )}
                title={!shouldExpand ? "Login" : undefined}
              >
                <User className="w-4 h-4" />
                {shouldExpand && <span>Login</span>}
              </button>
            </Link>
          </>
        )}
        
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          data-testid="button-toggle-sidebar"
          className={cn(
            "flex items-center gap-2 w-full py-2 text-sm text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))] transition-colors mt-2",
            shouldExpand ? "px-3" : "justify-center px-0"
          )}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {shouldExpand && <span>{isCollapsed ? "Pin" : "Collapse"}</span>}
        </button>
      </div>
    </div>
  );
}
