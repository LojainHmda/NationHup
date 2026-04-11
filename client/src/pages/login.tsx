import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Lock, User, Layers } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { NationHubLogo } from "@/components/NationHubLogo";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading } = useAuth();
  const [adminCredentials, setAdminCredentials] = useState({ username: "", password: "" });
  const [customerCredentials, setCustomerCredentials] = useState({ username: "", password: "" });

  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  const adminLoginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const response = await apiRequest("/api/auth/admin/login", "POST", credentials);
      return response.json();
    },
    onSuccess: async () => {
      // Refetch user with new session cookie - await before redirect
      await queryClient.refetchQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome back!",
        description: "You have successfully logged in as admin.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid username or password",
        variant: "destructive",
      });
    },
  });

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminCredentials.username || !adminCredentials.password) {
      toast({
        title: "Missing Credentials",
        description: "Please enter both username and password",
        variant: "destructive",
      });
      return;
    }
    adminLoginMutation.mutate(adminCredentials);
  };

  const customerLoginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const response = await apiRequest("/api/auth/customer/login", "POST", credentials);
      return response.json();
    },
    onSuccess: async () => {
      // Refetch user with new session cookie - await before redirect
      await queryClient.refetchQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome!",
        description: "You have successfully logged in.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid username or password",
        variant: "destructive",
      });
    },
  });

  const handleCustomerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerCredentials.username || !customerCredentials.password) {
      toast({
        title: "Missing Credentials",
        description: "Please enter both username and password",
        variant: "destructive",
      });
      return;
    }
    customerLoginMutation.mutate(customerCredentials);
  };

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/customer/oauth";
  };

  // Show loading during initial auth check, login flow, or redirect (user already set)
  const isLoggingIn = adminLoginMutation.isPending || customerLoginMutation.isPending;
  const loginSucceeded = adminLoginMutation.isSuccess || customerLoginMutation.isSuccess;
  if (isLoading || isLoggingIn || loginSucceeded || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-cyan-50 to-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">{isLoggingIn || loginSucceeded ? "Signing you in..." : "Loading..."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-cyan-50 to-slate-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo/Branding */}
        <div className="text-center mb-8">
          <NationHubLogo className="w-16 h-16 mx-auto mb-4" color="black" />
          <h1 className="text-3xl font-bold text-gray-900">WholeSale Pro</h1>
          <p className="text-gray-600 mt-2">B2B Wholesale Footwear Platform</p>
        </div>

        <Tabs defaultValue="customer" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="customer" data-testid="tab-customer">
              Customer Login
            </TabsTrigger>
            <TabsTrigger value="admin" data-testid="tab-admin">
              Staff Login
            </TabsTrigger>
          </TabsList>

          {/* Customer Login */}
          <TabsContent value="customer">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Customer Access
                </CardTitle>
                <CardDescription>
                  Sign in to access wholesale pricing and place orders
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Test Login */}
                <form onSubmit={handleCustomerLogin} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="customer-username">Username</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <Input
                        id="customer-username"
                        type="text"
                        placeholder="Enter your username"
                        className="pl-10"
                        value={customerCredentials.username}
                        onChange={(e) =>
                          setCustomerCredentials({ ...customerCredentials, username: e.target.value })
                        }
                        data-testid="input-customer-username"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customer-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <Input
                        id="customer-password"
                        type="password"
                        placeholder="Enter your password"
                        className="pl-10"
                        value={customerCredentials.password}
                        onChange={(e) =>
                          setCustomerCredentials({ ...customerCredentials, password: e.target.value })
                        }
                        data-testid="input-customer-password"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-blue-900 hover:bg-blue-800"
                    disabled={customerLoginMutation.isPending}
                    data-testid="button-customer-login"
                  >
                    {customerLoginMutation.isPending ? "Logging in..." : "Login"}
                  </Button>
                </form>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <Button
                  onClick={handleGoogleLogin}
                  className="w-full h-12 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-200 flex items-center justify-center gap-3"
                  data-testid="button-google-login"
                >
                  <FcGoogle className="w-6 h-6" />
                  <span className="font-semibold">Continue with Google</span>
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <Button
                  onClick={() => setLocation("/")}
                  variant="outline"
                  className="w-full h-12 border-2 border-gray-300 flex items-center justify-center gap-2"
                  data-testid="button-guest-continue"
                >
                  <User className="w-5 h-5" />
                  <span className="font-semibold">Continue as Guest</span>
                </Button>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <p className="text-blue-900 font-semibold mb-1">Test Credentials</p>
                  <p className="text-blue-700 text-xs">Username: user | Password: user</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Admin Login */}
          <TabsContent value="admin">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5" />
                  Staff Access
                </CardTitle>
                <CardDescription>
                  For Admin, Sales, and Finance team members
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <Input
                        id="username"
                        type="text"
                        placeholder="Enter your username"
                        className="pl-10"
                        value={adminCredentials.username}
                        onChange={(e) =>
                          setAdminCredentials({ ...adminCredentials, username: e.target.value })
                        }
                        data-testid="input-admin-username"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter your password"
                        className="pl-10"
                        value={adminCredentials.password}
                        onChange={(e) =>
                          setAdminCredentials({ ...adminCredentials, password: e.target.value })
                        }
                        data-testid="input-admin-password"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-blue-900 hover:bg-blue-800"
                    disabled={adminLoginMutation.isPending}
                    data-testid="button-admin-login"
                  >
                    {adminLoginMutation.isPending ? "Logging in..." : "Login as Admin"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-6">
          By logging in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
