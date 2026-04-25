import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Building2,
  Plus,
  User,
  Phone,
  Upload,
  X,
  Copy,
  Eye,
  EyeOff,
  Key,
  MapPin,
  ArrowLeft,
  Check,
} from "lucide-react";

interface CustomerCredentials {
  username: string;
  password: string;
  email: string;
  businessName: string;
}

const EXCLUDED_BRAND_TAG_PREFIX = "excluded_brand:";

const getInitialFormData = () => ({
  businessName: "",
  ownerName: "",
  primaryContactName: "",
  email: "",
  phone: "",
  phoneNumbers: [] as string[],
  accountManagerId: "",
  status: "Active" as "Active" | "On-Hold" | "Suspended",
  type: "Retail" as "Retail" | "Wholesale" | "Distributor",
  currency: "USD",
  creditLimit: "",
  allowPreOrders: true,
  excludedBrandIds: [] as string[],
  taxVatNumber: "",
  taxRate: "",
  registrationCountry: "",
  notes: "",
  billingAddress: {
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  },
  tradeLicensePhoto: null as File | null,
  tradeLicensePhotoUrl: "",
  idPhoto: null as File | null,
  idPhotoUrl: "",
  storePhotos: [] as File[],
  storePhotoUrls: [] as string[],
});

export default function CustomerProfilePage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState(getInitialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<CustomerCredentials | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [tradeLicensePreview, setTradeLicensePreview] = useState("");
  const [idPhotoPreview, setIdPhotoPreview] = useState("");
  const [storePhotosPreview, setStorePhotosPreview] = useState<string[]>([]);
  const [brandToExclude, setBrandToExclude] = useState<string>("");

  const { data: accountManagers = [] } = useQuery<Array<{ id: string; name: string; email: string }>>({
    queryKey: ["/api/account-managers"],
  });

  const { data: currencies = [] } = useQuery<Array<{ code: string; name: string; symbol: string }>>({
    queryKey: ["/api/currencies"],
  });

  const { data: brands = [] } = useQuery<Array<{ id: string; name: string; isActive: boolean }>>({
    queryKey: ["/api/brands"],
  });

  const clearError = (field: string) => {
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const fd = new FormData();
      
      if (data.tradeLicensePhoto) fd.append("tradeLicensePhoto", data.tradeLicensePhoto);
      if (data.idPhoto) fd.append("idPhoto", data.idPhoto);
      data.storePhotos.forEach((photo, i) => fd.append(`storePhoto${i}`, photo));

      let tradeLicenseUrl = data.tradeLicensePhotoUrl;
      let idPhotoUrl = data.idPhotoUrl;
      let storePhotoUrls = data.storePhotoUrls;

      if (data.tradeLicensePhoto || data.idPhoto || data.storePhotos.length > 0) {
        const uploadResponse = await fetch("/api/customer/upload-documents", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        if (!uploadResponse.ok) {
          const text = await uploadResponse.text();
          let message = text;
          try {
            const j = JSON.parse(text) as { message?: string };
            if (j.message) message = j.message;
          } catch {
            /* use raw text */
          }
          throw new Error(message?.slice(0, 300) || `Document upload failed (${uploadResponse.status})`);
        }
        const uploadResult = await uploadResponse.json();
        if (uploadResult.tradeLicensePhotoUrl) tradeLicenseUrl = uploadResult.tradeLicensePhotoUrl;
        if (uploadResult.idPhotoUrl) idPhotoUrl = uploadResult.idPhotoUrl;
        if (uploadResult.storePhotoUrls?.length) storePhotoUrls = uploadResult.storePhotoUrls;
      }
      const response = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          businessName: data.businessName,
          ownerName: data.ownerName,
          email: data.email,
          phone: data.phone,
          phoneNumbers: data.phoneNumbers,
          primaryContactName: data.primaryContactName,
          accountManagerId: data.accountManagerId,
          type: data.type,
          status: data.status,
          currency: data.currency,
          creditLimit: data.creditLimit ? parseFloat(data.creditLimit) : 0,
          allowPreOrders: data.allowPreOrders,
          segmentsTags: data.excludedBrandIds.map((brandId) => `${EXCLUDED_BRAND_TAG_PREFIX}${brandId}`),
          taxVatNumber: data.taxVatNumber,
          taxRate: data.taxRate ? parseFloat(data.taxRate) : 0,
          registrationCountry: data.registrationCountry,
          notes: data.notes,
          tradeLicensePhotoUrl: tradeLicenseUrl,
          idPhotoUrl: idPhotoUrl,
          storePhotoUrls: storePhotoUrls,
          billingAddress: data.billingAddress,
        }),
      });
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response:", text.substring(0, 200));
        throw new Error("Server returned an unexpected response. Please try again.");
      }
      
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Failed to create customer");
      }
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customer-users"] });
      if (data.credentials) {
        setGeneratedCredentials({
          username: data.credentials.username,
          password: data.credentials.password,
          email: data.credentials.email,
          businessName: data.credentials.businessName,
        });
        setShowCredentialsModal(true);
      }
      toast({ title: "Customer Created", description: "New customer account created successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Creation Failed", description: error.message || "Failed to create customer", variant: "destructive" });
    },
  });

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.businessName.trim()) newErrors.businessName = "Required";
    // Email is optional; when provided, validate format
    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        newErrors.email = "Please enter a valid email address";
      }
    }
    if (!formData.ownerName.trim()) newErrors.ownerName = "Required";
    if (!formData.primaryContactName.trim()) newErrors.primaryContactName = "Required";
    if (!formData.phone.trim()) newErrors.phone = "Required";
    if (!formData.accountManagerId) newErrors.accountManagerId = "Required";
    if (!formData.taxVatNumber.trim()) newErrors.taxVatNumber = "Required";
    if (!formData.taxRate.trim()) newErrors.taxRate = "Required";
    if (!formData.tradeLicensePhoto && !formData.tradeLicensePhotoUrl) newErrors.tradeLicensePhoto = "Required";
    if (!formData.idPhoto && !formData.idPhotoUrl) newErrors.idPhoto = "Required";
    if (formData.storePhotos.length === 0 && formData.storePhotoUrls.length === 0) newErrors.storePhotos = "Required";
    if (!formData.billingAddress.line1.trim()) newErrors.billingAddressLine1 = "Required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      toast({ title: "Missing Fields", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleTradeLicenseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setFormData({ ...formData, tradeLicensePhoto: file });
      setTradeLicensePreview(URL.createObjectURL(file));
      clearError("tradeLicensePhoto");
    }
  };

  const handleIdPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setFormData({ ...formData, idPhoto: file });
      setIdPhotoPreview(URL.createObjectURL(file));
      clearError("idPhoto");
    }
  };

  const handleStorePhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setFormData({ ...formData, storePhotos: [...formData.storePhotos, ...files] });
      const newPreviews = files.map((file) => URL.createObjectURL(file));
      setStorePhotosPreview([...storePhotosPreview, ...newPreviews]);
      clearError("storePhotos");
    }
  };

  const removeStorePhoto = (index: number) => {
    const photos = [...formData.storePhotos];
    photos.splice(index, 1);
    const previews = [...storePhotosPreview];
    previews.splice(index, 1);
    setFormData({ ...formData, storePhotos: photos });
    setStorePhotosPreview(previews);
  };

  const addPhoneNumber = () => {
    setFormData({ ...formData, phoneNumbers: [...formData.phoneNumbers, ""] });
  };

  const updatePhoneNumber = (index: number, value: string) => {
    const updated = [...formData.phoneNumbers];
    updated[index] = value;
    setFormData({ ...formData, phoneNumbers: updated });
  };

  const removePhoneNumber = (index: number) => {
    const updated = formData.phoneNumbers.filter((_, i) => i !== index);
    setFormData({ ...formData, phoneNumbers: updated });
  };

  const toggleExcludedBrand = (brandId: string) => {
    setFormData((prev) => ({
      ...prev,
      excludedBrandIds: prev.excludedBrandIds.includes(brandId)
        ? prev.excludedBrandIds.filter((id) => id !== brandId)
        : [...prev.excludedBrandIds, brandId],
    }));
  };

  const addExcludedBrand = (brandId: string) => {
    if (!brandId) return;
    setFormData((prev) => {
      if (prev.excludedBrandIds.includes(brandId)) return prev;
      return { ...prev, excludedBrandIds: [...prev.excludedBrandIds, brandId] };
    });
    setBrandToExclude("");
  };

  const activeBrands = brands.filter((brand) => brand.isActive);
  const selectedExcludedBrands = activeBrands.filter((brand) => formData.excludedBrandIds.includes(brand.id));
  const availableBrandOptions = activeBrands.filter((brand) => !formData.excludedBrandIds.includes(brand.id));

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const inputClass = (field: string) =>
    `h-9 text-sm ${errors[field] ? "border-red-500" : "border-slate-300"}`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 border-b px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/users")} data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div className="h-6 w-px bg-slate-300" />
            <h1 className="text-lg font-semibold text-slate-800 dark:text-white">Create New Customer</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setFormData(getInitialFormData())} data-testid="button-reset">
              Reset
            </Button>
            <Button 
              size="sm" 
              onClick={handleSubmit} 
              disabled={createMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-create"
            >
              {createMutation.isPending ? "Creating..." : "Create Customer"}
            </Button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          <Card className="lg:col-span-2">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 border-b pb-2">
                <Building2 className="h-4 w-4" /> Business Information
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Business Name *</Label>
                  <Input
                    value={formData.businessName}
                    onChange={(e) => { setFormData({ ...formData, businessName: e.target.value }); clearError("businessName"); }}
                    className={inputClass("businessName")}
                    data-testid="input-businessname"
                  />
                </div>
                <div>
                  <Label className="text-xs">Owner Name *</Label>
                  <Input
                    value={formData.ownerName}
                    onChange={(e) => { setFormData({ ...formData, ownerName: e.target.value }); clearError("ownerName"); }}
                    className={inputClass("ownerName")}
                    data-testid="input-ownername"
                  />
                </div>
                <div>
                  <Label className="text-xs">Business Type</Label>
                  <Select value={formData.type} onValueChange={(v: any) => setFormData({ ...formData, type: v })}>
                    <SelectTrigger className="h-9 text-sm" data-testid="select-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Retail">Retail</SelectItem>
                      <SelectItem value="Wholesale">Wholesale</SelectItem>
                      <SelectItem value="Distributor">Distributor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Currency</Label>
                  <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                    <SelectTrigger className="h-9 text-sm" data-testid="select-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.length > 0 ? currencies.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                      )) : (
                        <>
                          <SelectItem value="USD">$ USD</SelectItem>
                          <SelectItem value="EUR">€ EUR</SelectItem>
                          <SelectItem value="GBP">£ GBP</SelectItem>
                          <SelectItem value="AED">د.إ AED</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={formData.status} onValueChange={(v: any) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger className="h-9 text-sm" data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="On-Hold">On-Hold</SelectItem>
                      <SelectItem value="Suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 border-b pb-2 pt-2">
                <User className="h-4 w-4" /> Contact Information
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Primary Contact *</Label>
                  <Input
                    value={formData.primaryContactName}
                    onChange={(e) => { setFormData({ ...formData, primaryContactName: e.target.value }); clearError("primaryContactName"); }}
                    className={inputClass("primaryContactName")}
                    data-testid="input-primarycontact"
                  />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => { setFormData({ ...formData, email: e.target.value }); clearError("email"); }}
                    className={inputClass("email")}
                    placeholder="Optional"
                    data-testid="input-email"
                  />
                </div>
                <div>
                  <Label className="text-xs">Account Manager *</Label>
                  <Select value={formData.accountManagerId} onValueChange={(v) => { setFormData({ ...formData, accountManagerId: v }); clearError("accountManagerId"); }}>
                    <SelectTrigger className={`h-9 text-sm ${errors.accountManagerId ? "border-red-500" : ""}`} data-testid="select-accountmanager">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {accountManagers.map((am) => (
                        <SelectItem key={am.id} value={am.id}>{am.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Phone Numbers *</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={addPhoneNumber} className="h-6 text-xs" data-testid="button-add-phone">
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Input
                    value={formData.phone}
                    onChange={(e) => { setFormData({ ...formData, phone: e.target.value }); clearError("phone"); }}
                    placeholder="Primary phone"
                    className={inputClass("phone")}
                    data-testid="input-phone"
                  />
                  {formData.phoneNumbers.map((phone, i) => (
                    <div key={i} className="flex gap-1">
                      <Input
                        value={phone}
                        onChange={(e) => updatePhoneNumber(i, e.target.value)}
                        className="h-9 text-sm"
                        data-testid={`input-phone-${i}`}
                      />
                      <Button type="button" variant="ghost" size="sm" onClick={() => removePhoneNumber(i)} className="h-9 w-9 p-0">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 border-b pb-2 pt-2">
                <MapPin className="h-4 w-4" /> Billing Address
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="col-span-2 md:col-span-1">
                  <Label className="text-xs">Address Line 1 *</Label>
                  <Input
                    value={formData.billingAddress.line1}
                    onChange={(e) => { setFormData({ ...formData, billingAddress: { ...formData.billingAddress, line1: e.target.value } }); clearError("billingAddressLine1"); }}
                    className={inputClass("billingAddressLine1")}
                    data-testid="input-address-line1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Address Line 2</Label>
                  <Input
                    value={formData.billingAddress.line2}
                    onChange={(e) => setFormData({ ...formData, billingAddress: { ...formData.billingAddress, line2: e.target.value } })}
                    className="h-9 text-sm"
                    data-testid="input-address-line2"
                  />
                </div>
                <div>
                  <Label className="text-xs">City</Label>
                  <Input
                    value={formData.billingAddress.city}
                    onChange={(e) => setFormData({ ...formData, billingAddress: { ...formData.billingAddress, city: e.target.value } })}
                    className="h-9 text-sm"
                    data-testid="input-address-city"
                  />
                </div>
                <div>
                  <Label className="text-xs">State</Label>
                  <Input
                    value={formData.billingAddress.state}
                    onChange={(e) => setFormData({ ...formData, billingAddress: { ...formData.billingAddress, state: e.target.value } })}
                    className="h-9 text-sm"
                    data-testid="input-address-state"
                  />
                </div>
                <div>
                  <Label className="text-xs">Postal Code</Label>
                  <Input
                    value={formData.billingAddress.postalCode}
                    onChange={(e) => setFormData({ ...formData, billingAddress: { ...formData.billingAddress, postalCode: e.target.value } })}
                    className="h-9 text-sm"
                    data-testid="input-address-postalcode"
                  />
                </div>
                <div>
                  <Label className="text-xs">Country</Label>
                  <Input
                    value={formData.billingAddress.country}
                    onChange={(e) => setFormData({ ...formData, billingAddress: { ...formData.billingAddress, country: e.target.value } })}
                    className="h-9 text-sm"
                    data-testid="input-address-country"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 border-b pb-2 pt-2">
                <Building2 className="h-4 w-4" /> Account Settings
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Credit Limit</Label>
                  <Input
                    type="number"
                    value={formData.creditLimit}
                    onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                    placeholder="0"
                    className="h-9 text-sm"
                    data-testid="input-creditlimit"
                  />
                </div>
                <div>
                  <Label className="text-xs">Tax/VAT Number *</Label>
                  <Input
                    value={formData.taxVatNumber}
                    onChange={(e) => { setFormData({ ...formData, taxVatNumber: e.target.value }); clearError("taxVatNumber"); }}
                    className={inputClass("taxVatNumber")}
                    data-testid="input-taxvatnumber"
                  />
                </div>
                <div>
                  <Label className="text-xs">Tax Rate (%) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.taxRate}
                    onChange={(e) => { setFormData({ ...formData, taxRate: e.target.value }); clearError("taxRate"); }}
                    placeholder="e.g. 5"
                    className={inputClass("taxRate")}
                    data-testid="input-taxrate"
                  />
                </div>
                <div>
                  <Label className="text-xs">Registration Country</Label>
                  <Input
                    value={formData.registrationCountry}
                    onChange={(e) => setFormData({ ...formData, registrationCountry: e.target.value })}
                    placeholder="e.g. AE, US"
                    className="h-9 text-sm"
                    data-testid="input-registration-country"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allowPreOrders"
                    checked={formData.allowPreOrders}
                    onChange={(e) => setFormData({ ...formData, allowPreOrders: e.target.checked })}
                    className="h-4 w-4"
                    data-testid="checkbox-allow-preorders"
                  />
                  <Label htmlFor="allowPreOrders" className="text-xs cursor-pointer">Allow Pre-Orders</Label>
                </div>
                <div className="col-span-1 md:col-span-3">
                  <Label className="text-xs">Hidden Brands In Shop</Label>
                  <div className="mt-1 space-y-2">
                    <Select value={brandToExclude} onValueChange={addExcludedBrand}>
                      <SelectTrigger className="h-9 text-sm" data-testid="select-hidden-brand">
                        <SelectValue placeholder="Select brand to hide..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableBrandOptions.length > 0 ? (
                          availableBrandOptions.map((brand) => (
                            <SelectItem key={brand.id} value={brand.id}>
                              {brand.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>All brands already selected</SelectItem>
                        )}
                      </SelectContent>
                    </Select>

                    <div className="flex flex-wrap gap-1.5">
                      {selectedExcludedBrands.map((brand) => (
                        <button
                          key={brand.id}
                          type="button"
                          onClick={() => toggleExcludedBrand(brand.id)}
                          className="px-2 py-1 rounded-md border text-[11px] transition-colors bg-red-50 border-red-300 text-red-700"
                          data-testid={`chip-hide-brand-${brand.id}`}
                          title="Click to remove"
                        >
                          {brand.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <Label className="text-xs">Notes</Label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Internal notes about this customer..."
                  className="w-full h-16 p-2 border rounded-md resize-none text-sm"
                  data-testid="textarea-notes"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 border-b pb-2">
                <Upload className="h-4 w-4" /> Required Documents
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Trade License Photo *</Label>
                  <div className={`mt-1 border-2 border-dashed rounded-lg p-2 text-center ${errors.tradeLicensePhoto ? "border-red-400 bg-red-50" : "border-slate-300"}`}>
                    {tradeLicensePreview ? (
                      <div className="relative">
                        <img src={tradeLicensePreview} alt="Trade License" className="h-20 mx-auto object-contain rounded" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute top-0 right-0 h-6 w-6 p-0"
                          onClick={() => { setFormData({ ...formData, tradeLicensePhoto: null }); setTradeLicensePreview(""); }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block py-3">
                        <Upload className="h-6 w-6 mx-auto text-slate-400" />
                        <span className="text-xs text-slate-500 mt-1 block">Click to upload</span>
                        <input type="file" accept="image/*" onChange={handleTradeLicenseChange} className="hidden" data-testid="input-trade-license" />
                      </label>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">ID Photo *</Label>
                  <div className={`mt-1 border-2 border-dashed rounded-lg p-2 text-center ${errors.idPhoto ? "border-red-400 bg-red-50" : "border-slate-300"}`}>
                    {idPhotoPreview ? (
                      <div className="relative">
                        <img src={idPhotoPreview} alt="ID" className="h-20 mx-auto object-contain rounded" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute top-0 right-0 h-6 w-6 p-0"
                          onClick={() => { setFormData({ ...formData, idPhoto: null }); setIdPhotoPreview(""); }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block py-3">
                        <Upload className="h-6 w-6 mx-auto text-slate-400" />
                        <span className="text-xs text-slate-500 mt-1 block">Click to upload</span>
                        <input type="file" accept="image/*" onChange={handleIdPhotoChange} className="hidden" data-testid="input-id-photo" />
                      </label>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Store Photos * (min 1)</Label>
                  <div className={`mt-1 border-2 border-dashed rounded-lg p-2 ${errors.storePhotos ? "border-red-400 bg-red-50" : "border-slate-300"}`}>
                    <div className="grid grid-cols-3 gap-2">
                      {storePhotosPreview.map((preview, i) => (
                        <div key={i} className="relative">
                          <img src={preview} alt={`Store ${i + 1}`} className="h-16 w-full object-cover rounded" />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute top-0 right-0 h-5 w-5 p-0 bg-white/80"
                            onClick={() => removeStorePhoto(i)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <label className="cursor-pointer flex flex-col items-center justify-center h-16 border border-dashed border-slate-300 rounded hover:bg-slate-50">
                        <Plus className="h-4 w-4 text-slate-400" />
                        <span className="text-xs text-slate-400">Add</span>
                        <input type="file" accept="image/*" multiple onChange={handleStorePhotosChange} className="hidden" data-testid="input-store-photos" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>

      <Dialog open={showCredentialsModal} onOpenChange={setShowCredentialsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-green-600" />
              Customer Account Created
            </DialogTitle>
            <DialogDescription>
              Share these login credentials with the customer. The password cannot be recovered.
            </DialogDescription>
          </DialogHeader>
          
          {generatedCredentials && (
            <div className="space-y-4 py-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-800 font-medium">{generatedCredentials.businessName}</p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                  <div>
                    <p className="text-xs text-slate-500">Username</p>
                    <p className="font-mono font-medium">{generatedCredentials.username}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(generatedCredentials.username, "username")}
                    data-testid="button-copy-username"
                  >
                    {copiedField === "username" ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                  <div>
                    <p className="text-xs text-slate-500">Password</p>
                    <p className="font-mono font-medium">
                      {showPassword ? generatedCredentials.password : "••••••••••••"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(generatedCredentials.password, "password")}
                      data-testid="button-copy-password"
                    >
                      {copiedField === "password" ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
              
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={() => { setShowCredentialsModal(false); navigate("/admin/users"); }}
                data-testid="button-done"
              >
                Done - Go to Customer List
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
