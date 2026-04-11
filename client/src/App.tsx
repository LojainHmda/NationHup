import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatBot } from "@/components/ChatBot";
import { Layout } from "@/components/Layout";
import { CartProvider } from "@/hooks/useCartContext";
import { ProductModeProvider } from "@/hooks/useProductMode";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { AuthDrawerProvider } from "@/contexts/AuthDrawerContext";
import { useAuth } from "@/hooks/useAuth";
import type { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-[#fffbf5] via-white to-[#fffbf5]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FE4438]"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Redirect to="/" />;
  }
  
  return <>{children}</>;
}
import Dashboard from "@/pages/dashboard";
import Catalog from "@/pages/catalog";
import OrderBuilder from "@/pages/order-builder";
import OrderHistory from "@/pages/order-history";
import Profile from "@/pages/profile";
import WholesalePage from "@/pages/wholesale";
import AdminPage from "@/pages/admin";
import AnalyticsPage from "@/pages/analytics";
import StockInventoryPage from "@/pages/stock-inventory";
import StockBrandsPage from "@/pages/stock-brands";
import StockCategoriesPage from "@/pages/stock-categories";
import StockBatchesPage from "@/pages/stock-batches";
import StockAdjustmentsPage from "@/pages/stock-adjustments";
import StockPreOrderPage from "@/pages/stock-preorder";
import StockUploadPage from "@/pages/stock-upload";
import ProductDetailPage from "@/pages/product-detail";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import CustomerProfilePage from "@/pages/customer-profile";
import Shop from "@/pages/shop";
import Cart from "@/pages/cart";
import CartsSummary from "@/pages/carts-summary";
import CartsAnalytics from "@/pages/carts-analytics";
import HomePage from "@/pages/home";
import AdminOrdersPage from "@/pages/admin-orders";
import AccountManagerPage from "@/pages/account-manager";
import SalesDashboardPage from "@/pages/sales-dashboard";
import FinanceDashboardPage from "@/pages/finance-dashboard";
import UserRolesPage from "@/pages/user-roles";
import GlobalOrdersPage from "@/pages/global-orders";
import ContactPage from "@/pages/contact";
import CurrencyManagementPage from "@/pages/currency-management";
import AdminUsersPage from "@/pages/admin-users";
import AdminCatalogueUploadPage from "@/pages/admin-catalogue-upload";
import AllProductsPage from "@/pages/all-products";
import PreorderManagementPage from "@/pages/preorder-management";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        {() => (
          <Layout>
            <HomePage />
          </Layout>
        )}
      </Route>
      <Route path="/catalog">
        {() => (
          <ProtectedRoute>
            <Layout>
              <Catalog />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/shop">
        {() => (
          <ProtectedRoute>
            <Layout>
              <Shop />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/shop/stock">
        {() => (
          <ProtectedRoute>
            <Layout>
              <Shop />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/shop/pre-order">
        {() => (
          <ProtectedRoute>
            <Layout>
              <Shop />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/cart/:draftId">
        {() => (
          <ProtectedRoute>
            <Layout>
              <Cart />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/carts-summary">
        {() => (
          <ProtectedRoute>
            <Layout>
              <CartsSummary />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/carts-analytics">
        {() => (
          <ProtectedRoute>
            <Layout>
              <CartsAnalytics />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/order-builder">
        {() => (
          <ProtectedRoute>
            <Layout>
              <OrderBuilder />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/order-history">
        {() => (
          <ProtectedRoute>
            <Layout>
              <OrderHistory />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/profile">
        {() => (
          <ProtectedRoute>
            <Layout>
              <Profile />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/contact">
        {() => (
          <ProtectedRoute>
            <Layout>
              <ContactPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/wholesale">
        {() => (
          <ProtectedRoute>
            <Layout>
              <WholesalePage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/product/:id">
        {() => (
          <Layout>
            <ProductDetailPage />
          </Layout>
        )}
      </Route>
      <Route path="/analytics">
        {() => (
          <ProtectedRoute>
            <Layout>
              <AnalyticsPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin">
        {() => (
          <ProtectedRoute>
            <Layout>
              <AdminPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/orders">
        {() => (
          <ProtectedRoute>
            <Layout>
              <AdminOrdersPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/currencies">
        {() => (
          <ProtectedRoute>
            <Layout>
              <CurrencyManagementPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/account-manager">
        {() => (
          <ProtectedRoute>
            <Layout>
              <AccountManagerPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/sales-dashboard">
        {() => (
          <ProtectedRoute>
            <Layout>
              <SalesDashboardPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/finance-dashboard">
        {() => (
          <ProtectedRoute>
            <Layout>
              <FinanceDashboardPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/global-orders">
        {() => (
          <ProtectedRoute>
            <Layout>
              <GlobalOrdersPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/user-roles">
        {() => (
          <ProtectedRoute>
            <Layout>
              <UserRolesPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/users">
        {() => (
          <ProtectedRoute>
            <Layout>
              <AdminUsersPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/stock">
        {() => (
          <ProtectedRoute>
            <Layout>
              <StockInventoryPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/stock/inventory">
        {() => (
          <ProtectedRoute>
            <Layout>
              <StockInventoryPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/stock/brands">
        {() => (
          <ProtectedRoute>
            <Layout>
              <StockBrandsPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/stock/categories">
        {() => (
          <ProtectedRoute>
            <Layout>
              <StockCategoriesPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/stock/batches">
        {() => (
          <ProtectedRoute>
            <Layout>
              <StockBatchesPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/stock/adjustments">
        {() => (
          <ProtectedRoute>
            <Layout>
              <StockAdjustmentsPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/stock/collections">
        {() => (
          <ProtectedRoute>
            <Layout>
              <StockPreOrderPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/products">
        {() => (
          <ProtectedRoute>
            <Layout>
              <AllProductsPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/stock/upload">
        {() => (
          <ProtectedRoute>
            <Layout>
              <StockUploadPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/preorder-management">
        {() => (
          <ProtectedRoute>
            <Layout>
              <PreorderManagementPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/stock/catalogue">
        {() => (
          <ProtectedRoute>
            <Layout>
              <AdminCatalogueUploadPage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/create-customer">
        {() => (
          <ProtectedRoute>
            <Layout>
              <CustomerProfilePage />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route>
        {() => (
          <ProtectedRoute>
            <Layout>
              <NotFound />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CurrencyProvider>
          <ProductModeProvider>
            <CartProvider>
              <AuthDrawerProvider>
                <Toaster />
                <Router />
              <ChatBot />
              </AuthDrawerProvider>
            </CartProvider>
          </ProductModeProvider>
        </CurrencyProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
