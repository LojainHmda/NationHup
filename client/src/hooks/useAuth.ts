import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

// Persists across mutation completion until navigation - prevents flash before redirect
let logoutInProgress = false;

export function useAuth() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/auth/logout", "POST");
      return response.json();
    },
    onSuccess: () => {
      // Update auth state immediately - Home will render with guest layout, no refetch needed
      queryClient.setQueryData(["/api/auth/user"], null);
      // Client-side navigation - no full reload, avoids blank screen; replace prevents back-nav
      setLocation("/", { replace: true });
      logoutInProgress = false;
    },
    onError: () => {
      logoutInProgress = false;
    },
  });

  const logout = () => {
    logoutInProgress = true;
    logoutMutation.mutate();
  };

  const isStaff = user?.role === 'account_manager' || user?.role === 'sales' || user?.role === 'finance';
  const isAccountManager = user?.role === 'account_manager';
  
  return {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
    isAdmin: user?.role === "admin",
    isCustomer: user?.role === "customer",
    isStaff,
    isAccountManager,
    logout,
    isLoggingOut: logoutMutation.isPending || logoutInProgress,
  };
}
