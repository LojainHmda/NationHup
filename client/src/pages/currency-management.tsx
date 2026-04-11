import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit2, DollarSign, ArrowRight, RefreshCw, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import type { Currency, ExchangeRate } from "@shared/schema";


export default function CurrencyManagement() {
  const { toast } = useToast();
  const [isAddCurrencyOpen, setIsAddCurrencyOpen] = useState(false);
  const [isAddRateOpen, setIsAddRateOpen] = useState(false);
  const [editCurrency, setEditCurrency] = useState<Currency | null>(null);
  const [newCurrency, setNewCurrency] = useState({ code: "", name: "", symbol: "", isDefault: true, isActive: true });
  const [newRate, setNewRate] = useState({ fromCurrency: "", toCurrency: "", rate: "" });
  const [matrixRates, setMatrixRates] = useState<Record<string, Record<string, string>>>({});

  const { data: currencies = [], isLoading: currenciesLoading } = useQuery<Currency[]>({
    queryKey: ["/api/currencies"],
  });

  const { data: exchangeRates = [], isLoading: ratesLoading } = useQuery<ExchangeRate[]>({
    queryKey: ["/api/exchange-rates"],
  });

  const createCurrencyMutation = useMutation({
    mutationFn: async (currency: typeof newCurrency) => {
      return apiRequest("/api/currencies", "POST", currency);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/currencies"] });
      setIsAddCurrencyOpen(false);
      setNewCurrency({ code: "", name: "", symbol: "", isDefault: true, isActive: true });
      toast({ title: "Currency added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add currency", description: error.message, variant: "destructive" });
    },
  });

  const updateCurrencyMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Currency> }) => {
      return apiRequest(`/api/currencies/${id}`, "PATCH", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/currencies"] });
      setEditCurrency(null);
      toast({ title: "Currency updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update currency", description: error.message, variant: "destructive" });
    },
  });

  const deleteCurrencyMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/currencies/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/currencies"] });
      toast({ title: "Currency deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete currency", description: error.message, variant: "destructive" });
    },
  });

  const setExchangeRateMutation = useMutation({
    mutationFn: async (rate: typeof newRate) => {
      return apiRequest("/api/exchange-rates", "POST", { ...rate, rate: parseFloat(rate.rate) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates"] });
      setIsAddRateOpen(false);
      setNewRate({ fromCurrency: "", toCurrency: "", rate: "" });
      toast({ title: "Exchange rate set successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to set exchange rate", description: error.message, variant: "destructive" });
    },
  });

  const deleteExchangeRateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/exchange-rates/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates"] });
      toast({ title: "Exchange rate deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete exchange rate", description: error.message, variant: "destructive" });
    },
  });

  const fetchLiveRatesMutation = useMutation({
    mutationFn: async (baseCurrency: string) => {
      return apiRequest("/api/exchange-rates/fetch-live", "POST", { baseCurrency });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates"] });
      toast({ 
        title: "Live rates fetched successfully", 
        description: `Updated ${data.updatedCount} exchange rates from API`
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to fetch live rates", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (exchangeRates.length > 0 || currencies.length > 0) {
      const newMatrixRates: Record<string, Record<string, string>> = {};
      currencies.filter(c => c.isActive).forEach(fromCurrency => {
        newMatrixRates[fromCurrency.code] = {};
        currencies.filter(c => c.isActive).forEach(toCurrency => {
          if (fromCurrency.code === toCurrency.code) {
            newMatrixRates[fromCurrency.code][toCurrency.code] = "1.0000";
          } else {
            const rate = exchangeRates.find(
              r => r.fromCurrency === fromCurrency.code && r.toCurrency === toCurrency.code
            );
            newMatrixRates[fromCurrency.code][toCurrency.code] = rate ? Number(rate.rate).toFixed(4) : "";
          }
        });
      });
      setMatrixRates(newMatrixRates);
    }
  }, [exchangeRates, currencies]);

  const handleMatrixRateChange = (fromCurrency: string, toCurrency: string, value: string) => {
    setMatrixRates(prev => ({
      ...prev,
      [fromCurrency]: {
        ...prev[fromCurrency],
        [toCurrency]: value,
      },
    }));
  };

  const handleRateBlur = async (fromCurrency: string, toCurrency: string) => {
    const value = matrixRates[fromCurrency]?.[toCurrency];
    if (!value || value.trim() === "") return;
    
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed <= 0) return;
    
    try {
      await apiRequest("/api/exchange-rates", "POST", {
        fromCurrency,
        toCurrency,
        rate: parsed,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates"] });
    } catch (error: any) {
      toast({ title: "Failed to save rate", description: error.message, variant: "destructive" });
    }
  };

  const handleAddCurrency = () => {
    if (!newCurrency.code || !newCurrency.name || !newCurrency.symbol) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    createCurrencyMutation.mutate(newCurrency);
  };

  const handleUpdateCurrency = () => {
    if (!editCurrency) return;
    updateCurrencyMutation.mutate({
      id: editCurrency.id,
      updates: {
        name: editCurrency.name,
        symbol: editCurrency.symbol,
        isDefault: editCurrency.isDefault,
        isActive: editCurrency.isActive,
      },
    });
  };

  const handleAddRate = () => {
    if (!newRate.fromCurrency || !newRate.toCurrency || !newRate.rate) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    if (newRate.fromCurrency === newRate.toCurrency) {
      toast({ title: "From and to currencies must be different", variant: "destructive" });
      return;
    }
    setExchangeRateMutation.mutate(newRate);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin">
          <Button variant="ghost" size="sm" data-testid="button-back-admin">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <DollarSign className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="heading-currency-management">Currency Management</h1>
        </div>
        <p className="text-muted-foreground" data-testid="text-currency-description">
          Configure currencies and exchange rates for multi-currency pricing
        </p>
      </div>

      <Tabs defaultValue="currencies" className="space-y-6">
        <TabsList>
          <TabsTrigger value="currencies" data-testid="tab-currencies">Currencies</TabsTrigger>
          <TabsTrigger value="exchange-rates" data-testid="tab-exchange-rates">Exchange Rates</TabsTrigger>
        </TabsList>

        <TabsContent value="currencies" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Active Currencies</CardTitle>
                <CardDescription>Manage supported currencies for your catalog</CardDescription>
              </div>
              <Dialog open={isAddCurrencyOpen} onOpenChange={setIsAddCurrencyOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-currency">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Currency
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Currency</DialogTitle>
                    <DialogDescription>Add a new currency to your system</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="code">Currency Code (e.g., USD, EUR)</Label>
                      <Input
                        id="code"
                        placeholder="USD"
                        value={newCurrency.code}
                        onChange={(e) => setNewCurrency({ ...newCurrency, code: e.target.value.toUpperCase() })}
                        maxLength={3}
                        data-testid="input-currency-code"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="name">Currency Name</Label>
                      <Input
                        id="name"
                        placeholder="US Dollar"
                        value={newCurrency.name}
                        onChange={(e) => setNewCurrency({ ...newCurrency, name: e.target.value })}
                        data-testid="input-currency-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="symbol">Symbol</Label>
                      <Input
                        id="symbol"
                        placeholder="$"
                        value={newCurrency.symbol}
                        onChange={(e) => setNewCurrency({ ...newCurrency, symbol: e.target.value })}
                        maxLength={3}
                        data-testid="input-currency-symbol"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="isDefault">Show by Default</Label>
                      <Switch
                        id="isDefault"
                        checked={newCurrency.isDefault}
                        onCheckedChange={(checked) => setNewCurrency({ ...newCurrency, isDefault: checked })}
                        data-testid="switch-currency-default"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="isActive">Active</Label>
                      <Switch
                        id="isActive"
                        checked={newCurrency.isActive}
                        onCheckedChange={(checked) => setNewCurrency({ ...newCurrency, isActive: checked })}
                        data-testid="switch-currency-active"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddCurrencyOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddCurrency} disabled={createCurrencyMutation.isPending} data-testid="button-save-currency">
                      {createCurrencyMutation.isPending ? "Adding..." : "Add Currency"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {currenciesLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading currencies...</div>
              ) : currencies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No currencies configured. Add your first currency to get started.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Default</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currencies.map((currency) => (
                      <TableRow key={currency.id} data-testid={`row-currency-${currency.code}`}>
                        <TableCell className="font-mono font-semibold">{currency.code}</TableCell>
                        <TableCell>{currency.name}</TableCell>
                        <TableCell className="text-xl">{currency.symbol}</TableCell>
                        <TableCell>
                          {currency.isDefault && <Badge variant="secondary">Default</Badge>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={currency.isActive ? "default" : "outline"}>
                            {currency.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditCurrency(currency)}
                              data-testid={`button-edit-currency-${currency.code}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteCurrencyMutation.mutate(currency.id)}
                              disabled={deleteCurrencyMutation.isPending}
                              data-testid={`button-delete-currency-${currency.code}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Dialog open={!!editCurrency} onOpenChange={(open) => !open && setEditCurrency(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Currency</DialogTitle>
                <DialogDescription>Update currency details</DialogDescription>
              </DialogHeader>
              {editCurrency && (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Currency Code</Label>
                    <Input value={editCurrency.code} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Currency Name</Label>
                    <Input
                      id="edit-name"
                      value={editCurrency.name}
                      onChange={(e) => setEditCurrency({ ...editCurrency, name: e.target.value })}
                      data-testid="input-edit-currency-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-symbol">Symbol</Label>
                    <Input
                      id="edit-symbol"
                      value={editCurrency.symbol}
                      onChange={(e) => setEditCurrency({ ...editCurrency, symbol: e.target.value })}
                      data-testid="input-edit-currency-symbol"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="edit-isDefault">Show by Default</Label>
                    <Switch
                      id="edit-isDefault"
                      checked={editCurrency.isDefault}
                      onCheckedChange={(checked) => setEditCurrency({ ...editCurrency, isDefault: checked })}
                      data-testid="switch-edit-currency-default"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="edit-isActive">Active</Label>
                    <Switch
                      id="edit-isActive"
                      checked={editCurrency.isActive}
                      onCheckedChange={(checked) => setEditCurrency({ ...editCurrency, isActive: checked })}
                      data-testid="switch-edit-currency-active"
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditCurrency(null)}>Cancel</Button>
                <Button onClick={handleUpdateCurrency} disabled={updateCurrencyMutation.isPending} data-testid="button-update-currency">
                  {updateCurrencyMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="exchange-rates" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Exchange Rates</CardTitle>
                <CardDescription>Set conversion rates between currencies</CardDescription>
              </div>
              <Dialog open={isAddRateOpen} onOpenChange={setIsAddRateOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-rate">
                    <Plus className="h-4 w-4 mr-2" />
                    Set Exchange Rate
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Set Exchange Rate</DialogTitle>
                    <DialogDescription>Define conversion rate between two currencies</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>From Currency</Label>
                      <Select
                        value={newRate.fromCurrency}
                        onValueChange={(value) => setNewRate({ ...newRate, fromCurrency: value })}
                      >
                        <SelectTrigger data-testid="select-from-currency">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          {currencies.filter(c => c.isActive).map((currency) => (
                            <SelectItem key={currency.id} value={currency.code}>
                              {currency.code} - {currency.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-center">
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      <Label>To Currency</Label>
                      <Select
                        value={newRate.toCurrency}
                        onValueChange={(value) => setNewRate({ ...newRate, toCurrency: value })}
                      >
                        <SelectTrigger data-testid="select-to-currency">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          {currencies.filter(c => c.isActive && c.code !== newRate.fromCurrency).map((currency) => (
                            <SelectItem key={currency.id} value={currency.code}>
                              {currency.code} - {currency.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rate">Exchange Rate</Label>
                      <Input
                        id="rate"
                        type="number"
                        step="0.0001"
                        placeholder="1.00"
                        value={newRate.rate}
                        onChange={(e) => setNewRate({ ...newRate, rate: e.target.value })}
                        data-testid="input-exchange-rate"
                      />
                      {newRate.fromCurrency && newRate.toCurrency && newRate.rate && (
                        <p className="text-sm text-muted-foreground mt-2">
                          1 {newRate.fromCurrency} = {newRate.rate} {newRate.toCurrency}
                        </p>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddRateOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddRate} disabled={setExchangeRateMutation.isPending} data-testid="button-save-rate">
                      {setExchangeRateMutation.isPending ? "Saving..." : "Set Rate"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Quick Rate Matrix
              </CardTitle>
              <CardDescription className="flex items-center justify-between">
                <span>Edit exchange rates directly - changes save automatically</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLiveRatesMutation.mutate("USD")}
                  disabled={fetchLiveRatesMutation.isPending || currencies.filter(c => c.isActive).length < 2}
                  className="ml-4"
                  data-testid="button-fetch-live-rates"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${fetchLiveRatesMutation.isPending ? 'animate-spin' : ''}`} />
                  {fetchLiveRatesMutation.isPending ? 'Fetching...' : 'Fetch Live Rates'}
                </Button>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currencies.filter(c => c.isActive).length < 2 ? (
                <div className="text-center py-8 text-muted-foreground">Add at least 2 active currencies to see the rate matrix.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20"></TableHead>
                        {currencies.filter(c => c.isActive).map(currency => (
                          <TableHead key={currency.id} className="text-center font-mono">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-lg">{currency.symbol}</span>
                              <span>{currency.code}</span>
                            </div>
                          </TableHead>
                        ))}
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currencies.filter(c => c.isActive).map(fromCurrency => (
                        <TableRow key={fromCurrency.id}>
                          <TableCell className="font-mono font-semibold">
                            <div className="flex items-center gap-1">
                              <span className="text-lg">{fromCurrency.symbol}</span>
                              <span>{fromCurrency.code}</span>
                            </div>
                          </TableCell>
                          {currencies.filter(c => c.isActive).map(toCurrency => {
                            if (fromCurrency.code === toCurrency.code) {
                              return (
                                <TableCell key={toCurrency.id} className="text-center">
                                  <Input
                                    value="1.0000"
                                    disabled
                                    className="w-20 text-center text-muted-foreground bg-muted"
                                    data-testid={`input-rate-${fromCurrency.code}-${toCurrency.code}`}
                                  />
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell key={toCurrency.id} className="text-center">
                                <Input
                                  type="text"
                                  value={matrixRates[fromCurrency.code]?.[toCurrency.code] || ""}
                                  onChange={(e) => handleMatrixRateChange(fromCurrency.code, toCurrency.code, e.target.value)}
                                  onBlur={() => handleRateBlur(fromCurrency.code, toCurrency.code)}
                                  placeholder="-"
                                  className="w-20 text-center"
                                  data-testid={`input-rate-${fromCurrency.code}-${toCurrency.code}`}
                                />
                              </TableCell>
                            );
                          })}
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const currency = currencies.find(c => c.code === fromCurrency.code);
                                if (currency) deleteCurrencyMutation.mutate(currency.id);
                              }}
                              disabled={deleteCurrencyMutation.isPending}
                              data-testid={`button-delete-currency-${fromCurrency.code}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
