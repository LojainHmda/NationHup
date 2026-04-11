import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface AuthDrawerContextValue {
  loginDrawerOpen: boolean;
  signupDrawerOpen: boolean;
  openLoginDrawer: () => void;
  openSignupDrawer: () => void;
  closeLoginDrawer: () => void;
  closeSignupDrawer: () => void;
  setLoginDrawerOpen: (open: boolean) => void;
  setSignupDrawerOpen: (open: boolean) => void;
}

const AuthDrawerContext = createContext<AuthDrawerContextValue | null>(null);

export function AuthDrawerProvider({ children }: { children: ReactNode }) {
  const [loginDrawerOpen, setLoginDrawerOpen] = useState(false);
  const [signupDrawerOpen, setSignupDrawerOpen] = useState(false);

  const openLoginDrawer = useCallback(() => {
    setSignupDrawerOpen(false);
    setLoginDrawerOpen(true);
  }, []);

  const openSignupDrawer = useCallback(() => {
    setLoginDrawerOpen(false);
    setSignupDrawerOpen(true);
  }, []);

  const closeLoginDrawer = useCallback(() => setLoginDrawerOpen(false), []);
  const closeSignupDrawer = useCallback(() => setSignupDrawerOpen(false), []);

  const value: AuthDrawerContextValue = {
    loginDrawerOpen,
    signupDrawerOpen,
    openLoginDrawer,
    openSignupDrawer,
    closeLoginDrawer,
    closeSignupDrawer,
    setLoginDrawerOpen,
    setSignupDrawerOpen,
  };

  return (
    <AuthDrawerContext.Provider value={value}>
      {children}
    </AuthDrawerContext.Provider>
  );
}

export function useAuthDrawer() {
  const ctx = useContext(AuthDrawerContext);
  if (!ctx) {
    throw new Error("useAuthDrawer must be used within AuthDrawerProvider");
  }
  return ctx;
}
