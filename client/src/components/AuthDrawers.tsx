import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { User, Lock, Mail, Eye, EyeOff } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { NationHubLogo } from "@/components/NationHubLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuthDrawer } from "@/contexts/AuthDrawerContext";
import { useToast } from "@/hooks/use-toast";

export function AuthDrawers() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const {
    loginDrawerOpen,
    signupDrawerOpen,
    setLoginDrawerOpen,
    setSignupDrawerOpen,
  } = useAuthDrawer();

  const [loginType, setLoginType] = useState<'customer' | 'admin'>('customer');
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [signupData, setSignupData] = useState({ username: "", email: "", password: "", confirmPassword: "" });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [isAuthTransitioning, setIsAuthTransitioning] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; type: 'customer' | 'admin' }) => {
      const endpoint = data.type === 'admin' ? '/api/auth/admin/login' : '/api/auth/customer/login';
      const response = await apiRequest(endpoint, "POST", { username: data.username, password: data.password });
      return response.json();
    },
    onSuccess: async () => {
      try {
        await queryClient.refetchQueries({ queryKey: ["/api/auth/user"] });
        setLoginDrawerOpen(false);
        toast({
          title: "Welcome!",
          description: "You have successfully logged in.",
        });
      } finally {
        setIsAuthTransitioning(false);
      }
    },
    onError: (error: Error) => {
      setIsAuthTransitioning(false);
      toast({
        title: "Login Failed",
        description: error.message || "Invalid username or password",
        variant: "destructive",
      });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentials.username || !credentials.password) {
      toast({
        title: "Missing Credentials",
        description: "Please enter both username and password",
        variant: "destructive",
      });
      return;
    }
    setIsAuthTransitioning(true);
    loginMutation.mutate({ ...credentials, type: loginType });
  };

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/customer/oauth";
  };

  const signupMutation = useMutation({
    mutationFn: async (data: { username: string; email: string; password: string }) => {
      const response = await apiRequest("/api/auth/customer/register", "POST", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Account Created!",
        description: "Your account has been created successfully. Please log in.",
      });
      setSignupDrawerOpen(false);
      setSignupData({ username: "", email: "", password: "", confirmPassword: "" });
      setLoginDrawerOpen(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Could not create account. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupData.username || !signupData.email || !signupData.password) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    if (signupData.password !== signupData.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }
    if (signupData.password.length < 4) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 4 characters",
        variant: "destructive",
      });
      return;
    }
    signupMutation.mutate({
      username: signupData.username,
      email: signupData.email,
      password: signupData.password,
    });
  };

  const handleContinueAsGuest = () => {
    setLoginDrawerOpen(false);
    navigate('/');
  };

  return (
    <>
      {/* Login Drawer */}
      <Sheet open={loginDrawerOpen} onOpenChange={setLoginDrawerOpen}>
        <SheetContent className="w-full sm:max-w-md p-0 bg-gradient-to-b from-white to-[#fffbf5]">
          <div className="h-full flex flex-col">
            <div className="p-6 pb-4 border-b border-gray-100">
              <SheetHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <NationHubLogo className="w-10 h-10" color="black" />
                    <SheetTitle className="text-xl font-bold text-gray-900">Welcome Back</SheetTitle>
                  </div>
                </div>
              </SheetHeader>
              <p className="text-gray-500 text-sm mt-2">Sign in to access your wholesale account</p>
            </div>

            <div className="px-6 pt-4">
              <div className="flex bg-gray-100 rounded-xl p-1">
                <button
                  onClick={() => setLoginType('customer')}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    loginType === 'customer'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  data-testid="toggle-customer-login"
                >
                  Customer
                </button>
                <button
                  onClick={() => setLoginType('admin')}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    loginType === 'admin'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  data-testid="toggle-admin-login"
                >
                  Staff
                </button>
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
              {(loginMutation.isPending || isAuthTransitioning) ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-2 border-[#FE4438] border-t-transparent" />
                  <p className="text-sm font-medium text-gray-600">Signing you in...</p>
                  <p className="text-xs text-gray-500">Preparing your account</p>
                </div>
              ) : (
                <>
                  <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="auth-drawer-username" className="text-sm font-medium text-gray-700">Username</Label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          id="auth-drawer-username"
                          type="text"
                          placeholder="Enter your username"
                          className="pl-10 h-12 rounded-xl border-gray-200 focus:border-[#FE4438] focus:ring-[#FE4438]/20"
                          value={credentials.username}
                          onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                          data-testid="input-drawer-username"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="auth-drawer-password" className="text-sm font-medium text-gray-700">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          id="auth-drawer-password"
                          type={showLoginPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          className="pl-10 pr-10 h-12 rounded-xl border-gray-200 focus:border-[#FE4438] focus:ring-[#FE4438]/20"
                          value={credentials.password}
                          onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                          data-testid="input-drawer-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-0"
                          aria-label={showLoginPassword ? "Hide password" : "Show password"}
                        >
                          {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-end">
                      <button type="button" className="text-sm text-[#FE4438] hover:text-[#FE4438] font-medium">
                        Forgot password?
                      </button>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 bg-gradient-to-r from-[#FE4438] to-[#FE4438] hover:from-[#FE4438] hover:to-[#FE4438] text-white font-bold rounded-xl shadow-lg shadow-[#FE4438]/20 hover:shadow-xl transition-all duration-300"
                      disabled={loginMutation.isPending}
                      data-testid="button-drawer-login"
                    >
                      {loginMutation.isPending ? "Signing in..." : "Sign In"}
                    </Button>
                  </form>

                  {loginType === 'customer' && (
                    <>
                      <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-gray-200" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-gradient-to-b from-white to-[#fffbf5] px-3 text-gray-400 font-medium">or continue with</span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        onClick={handleGoogleLogin}
                        className="w-full h-12 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-200 hover:border-gray-300 rounded-xl flex items-center justify-center gap-3 transition-all duration-200"
                        data-testid="button-drawer-google"
                      >
                        <FcGoogle className="w-5 h-5" />
                        <span className="font-semibold">Continue with Google</span>
                      </Button>

                      <Button
                        type="button"
                        onClick={handleContinueAsGuest}
                        variant="ghost"
                        className="w-full h-12 mt-3 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl flex items-center justify-center gap-2"
                        data-testid="button-drawer-guest"
                      >
                        <User className="w-4 h-4" />
                        <span className="font-medium">Continue as Guest</span>
                      </Button>
                    </>
                  )}

                  <div className="mt-6 p-4 bg-[#FE4438]/10 rounded-xl border border-[#FE4438]/20">
                    <p className="text-[#FE4438] font-semibold text-sm mb-1">Test Credentials</p>
                    <p className="text-gray-600 text-xs">
                      {loginType === 'admin'
                        ? 'Admin: admin/admin | AccountManager: AccountManager/AccountManager | Sales: Sales/Sales | Finance: Finance/Finance'
                        : 'Username: user | Password: user'}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="p-6 pt-4 border-t border-gray-100">
              <p className="text-center text-xs text-gray-500">
                Don't have an account?{' '}
                <button
                  onClick={() => {
                    setLoginDrawerOpen(false);
                    setSignupDrawerOpen(true);
                  }}
                  className="text-[#FE4438] hover:text-[#FE4438] font-semibold"
                >
                  Sign up
                </button>
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Signup Drawer */}
      <Sheet open={signupDrawerOpen} onOpenChange={setSignupDrawerOpen}>
        <SheetContent className="w-full sm:max-w-md p-0 bg-gradient-to-b from-white to-[#fffbf5]">
          <div className="h-full flex flex-col">
            <div className="p-6 pb-4 border-b border-gray-100">
              <SheetHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <NationHubLogo className="w-10 h-10" color="black" />
                    <SheetTitle className="text-xl font-bold text-gray-900">Create Account</SheetTitle>
                  </div>
                </div>
              </SheetHeader>
              <p className="text-gray-500 text-sm mt-2">Join our wholesale platform today</p>
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
              <form onSubmit={handleSignup} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="auth-drawer-signup-username" className="text-sm font-medium text-gray-700">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="auth-drawer-signup-username"
                      type="text"
                      placeholder="Choose a username"
                      className="pl-10 h-12 rounded-xl border-gray-200 focus:border-[#FE4438] focus:ring-[#FE4438]/20"
                      value={signupData.username}
                      onChange={(e) => setSignupData({ ...signupData, username: e.target.value })}
                      data-testid="input-drawer-signup-username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auth-drawer-signup-email" className="text-sm font-medium text-gray-700">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="auth-drawer-signup-email"
                      type="email"
                      placeholder="Enter your email"
                      className="pl-10 h-12 rounded-xl border-gray-200 focus:border-[#FE4438] focus:ring-[#FE4438]/20"
                      value={signupData.email}
                      onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                      data-testid="input-drawer-signup-email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auth-drawer-signup-password" className="text-sm font-medium text-gray-700">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="auth-drawer-signup-password"
                      type={showSignupPassword ? "text" : "password"}
                      placeholder="Create a password"
                      className="pl-10 pr-10 h-12 rounded-xl border-gray-200 focus:border-[#FE4438] focus:ring-[#FE4438]/20"
                      value={signupData.password}
                      onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                      data-testid="input-drawer-signup-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-0"
                      aria-label={showSignupPassword ? "Hide password" : "Show password"}
                    >
                      {showSignupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auth-drawer-signup-confirm-password" className="text-sm font-medium text-gray-700">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="auth-drawer-signup-confirm-password"
                      type={showSignupConfirmPassword ? "text" : "password"}
                      placeholder="Confirm your password"
                      className="pl-10 pr-10 h-12 rounded-xl border-gray-200 focus:border-[#FE4438] focus:ring-[#FE4438]/20"
                      value={signupData.confirmPassword}
                      onChange={(e) => setSignupData({ ...signupData, confirmPassword: e.target.value })}
                      data-testid="input-drawer-signup-confirm-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupConfirmPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-0"
                      aria-label={showSignupConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showSignupConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 bg-gradient-to-r from-[#FE4438] to-[#FE4438] hover:from-[#FE4438] hover:to-[#FE4438] text-white font-bold rounded-xl shadow-lg shadow-[#FE4438]/20 hover:shadow-xl transition-all duration-300"
                  disabled={signupMutation.isPending}
                  data-testid="button-drawer-signup"
                >
                  {signupMutation.isPending ? "Creating Account..." : "Create Account"}
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-gradient-to-b from-white to-[#fffbf5] px-3 text-gray-400 font-medium">or sign up with</span>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full h-12 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-200 hover:border-gray-300 rounded-xl flex items-center justify-center gap-3 transition-all duration-200"
                data-testid="button-drawer-signup-google"
              >
                <FcGoogle className="w-5 h-5" />
                <span className="font-semibold">Continue with Google</span>
              </Button>

              <p className="text-xs text-gray-500 text-center mt-6">
                By creating an account, you agree to our{' '}
                <a href="#" className="text-[#FE4438] hover:text-[#FE4438] font-medium">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="text-[#FE4438] hover:text-[#FE4438] font-medium">Privacy Policy</a>
              </p>
            </div>

            <div className="p-6 pt-4 border-t border-gray-100">
              <p className="text-center text-xs text-gray-500">
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setSignupDrawerOpen(false);
                    setLoginDrawerOpen(true);
                  }}
                  className="text-[#FE4438] hover:text-[#FE4438] font-semibold"
                >
                  Sign in
                </button>
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
