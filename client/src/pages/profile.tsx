import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, AtSign, Loader2, Coins } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Currency } from "@shared/schema";

type UserProfile = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  displayName: string | null;
  profilePicture: string | null;
  preferredCurrency?: string | null;
};

export default function Profile() {
  const { data: user, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/auth/user"],
  });

  const { data: currencies = [] } = useQuery<Currency[]>({
    queryKey: ["/api/currencies"],
  });

  const getUserCurrencyDisplay = () => {
    const userCurrency = user?.preferredCurrency || "USD";
    const currency = currencies.find((c) => c.code === userCurrency);
    if (currency) {
      return `${currency.symbol}${currency.code} - ${currency.name}`;
    }
    return `$USD - US Dollar`;
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-foreground mb-2">Profile</h1>
          <p className="text-muted-foreground mb-8">
            View your account information
          </p>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    className="bg-muted"
                    value={user?.displayName || ""}
                    readOnly
                    data-testid="input-display-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      className="pl-10 bg-muted"
                      value={user?.email || ""}
                      readOnly
                      data-testid="input-email"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="username"
                      className="pl-10 bg-muted"
                      value={user?.username || ""}
                      readOnly
                      data-testid="input-username"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Username cannot be changed
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Input
                    id="role"
                    className="bg-muted capitalize"
                    value={user?.role?.replace("_", " ") || ""}
                    readOnly
                    data-testid="input-role"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency" className="flex items-center gap-2">
                    <Coins className="w-4 h-4" />
                    Assigned Currency
                  </Label>
                  <Input
                    id="currency"
                    className="bg-muted"
                    value={getUserCurrencyDisplay()}
                    readOnly
                    data-testid="input-currency"
                  />
                  <p className="text-xs text-muted-foreground">
                    Currency is managed by your account administrator
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
