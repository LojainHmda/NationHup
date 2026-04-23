import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, Plus, Edit, Camera, Settings, FileSpreadsheet, Check, X, Upload, ArrowRight, Table, EyeOff, Eye, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";

const brandFormSchema = z.object({
  name: z.string().min(1, "Brand name is required"),
  description: z.string().optional(),
});

/** Best-effort message from a failed fetch Response body (JSON or plain text). */
function messageFromFailedResponse(response: Response, bodyText: string): string {
  const trimmed = bodyText.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(trimmed) as Record<string, unknown>;
      for (const key of ["message", "error", "detail"] as const) {
        const v = data[key];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (v && typeof v === "object" && "message" in v && typeof (v as { message?: unknown }).message === "string") {
          const m = (v as { message: string }).message.trim();
          if (m) return m;
        }
      }
    } catch {
      /* use raw text */
    }
  }
  if (trimmed) return trimmed.replace(/\s+/g, " ").slice(0, 400);
  return `Upload failed (${response.status})`;
}

/** Browsers only report generic messages for network/CORS failures — explain that in UI. */
function userVisibleFetchError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message.trim();
    if (
      m === "Failed to fetch" ||
      m === "Load failed" ||
      /^NetworkError/i.test(m) ||
      /network.*fail/i.test(m)
    ) {
      return "Could not reach the server (often offline API, wrong URL/port, or a blocked request). Confirm the dev server is running and this page uses the same origin as /api.";
    }
    return m;
  }
  if (typeof err === "string" && err.trim()) return err.trim();
  return "Request failed";
}

export default function StockBrandsPage() {
  const { toast } = useToast();
  const [isBrandDialogOpen, setIsBrandDialogOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<any>(null);
  const [isBrandLogoDialogOpen, setIsBrandLogoDialogOpen] = useState(false);
  const [brandLogoUploadBrand, setBrandLogoUploadBrand] = useState<any>(null);
  const [brandLogoFile, setBrandLogoFile] = useState<File | null>(null);
  const [brandLogoPreview, setBrandLogoPreview] = useState<string | null>(null);
  const [isSizeStandardsDialogOpen, setIsSizeStandardsDialogOpen] = useState(false);
  const [sizeStandardsUploadBrand, setSizeStandardsUploadBrand] = useState<any>(null);
  const [sizeStandardsFile, setSizeStandardsFile] = useState<File | null>(null);
  const [sizeStandardsPreview, setSizeStandardsPreview] = useState<any>(null);
  const [categoryMapping, setCategoryMapping] = useState<Record<string, string>>({});
  const [uploadStep, setUploadStep] = useState<1 | 2 | 3>(1); // 1: upload, 2: column mapping, 3: category mapping
  const [columnMapping, setColumnMapping] = useState<{usIndex: number, euIndex: number, ukIndex: number, categoryIndex: number}>({
    usIndex: -1, euIndex: -1, ukIndex: -1, categoryIndex: -1
  });
  const [categoriesData, setCategoriesData] = useState<{categories: string[], previewRows: any[]}>({ categories: [], previewRows: [] });

  const brandForm = useForm<z.infer<typeof brandFormSchema>>({
    resolver: zodResolver(brandFormSchema),
    defaultValues: {
      name: "",
      description: "",
    }
  });

  // Fetch brands
  const { data: brands = [] } = useQuery({
    queryKey: ["/api/brands"],
  });

  // Create/Update brand mutation
  const saveBrandMutation = useMutation({
    mutationFn: async (data: any) => {
      // Auto-generate slug from name and add defaults
      const brandData = {
        ...data,
        slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        isActive: true,
        priority: 0,
      };
      
      if (editingBrand) {
        return await apiRequest(`/api/brands/${editingBrand.id}`, "PATCH", brandData);
      } else {
        return await apiRequest("/api/brands", "POST", brandData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({ title: "Success", description: `Brand ${editingBrand ? 'updated' : 'created'} successfully` });
      setIsBrandDialogOpen(false);
      brandForm.reset();
      setEditingBrand(null);
    },
    onError: (error: any) => {
      console.error('Brand save error:', error);
      toast({ title: "Error", description: "Failed to save brand", variant: "destructive" });
    },
  });

  // Hide/unhide brand mutation (toggle isActive)
  const toggleBrandVisibilityMutation = useMutation({
    mutationFn: async ({ brandId, isActive }: { brandId: string; isActive: boolean }) => {
      return await apiRequest(`/api/brands/${brandId}`, "PATCH", { isActive });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ 
        title: "Success", 
        description: `Brand ${variables.isActive ? 'shown' : 'hidden'} successfully` 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update brand visibility", variant: "destructive" });
    },
  });

  // Delete brand with all products mutation
  const deleteBrandWithProductsMutation = useMutation({
    mutationFn: async (brandId: string) => {
      return await apiRequest(`/api/brands/${brandId}/with-products`, "DELETE");
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock/inventory"] });
      toast({ 
        title: "Brand Deleted", 
        description: `Brand and ${data.deletedProducts} products have been removed.` 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete brand", variant: "destructive" });
    },
  });

  // Upload brand logo mutation
  const uploadBrandLogoMutation = useMutation({
    mutationFn: async ({ brandId, file }: { brandId: string; file: File }) => {
      const formData = new FormData();
      formData.append('logo', file);
      
      try {
        const response = await fetch(`/api/brands/${brandId}/logo`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
      
        if (!response.ok) {
          const bodyText = await response.text();
          throw new Error(messageFromFailedResponse(response, bodyText));
        }
        return response.json();
      } catch (e) {
        throw new Error(userVisibleFetchError(e));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({ title: "Success", description: "Logo uploaded successfully" });
      setIsBrandLogoDialogOpen(false);
      setBrandLogoFile(null);
      setBrandLogoPreview(null);
      setBrandLogoUploadBrand(null);
    },
    onError: (error: unknown) => {
      const description = userVisibleFetchError(error);
      toast({
        title: "Error",
        description: description || "Failed to upload logo",
        variant: "destructive",
      });
    },
  });

  // Preview size standards mutation (Step 1 -> Step 2)
  const previewSizeStandardsMutation = useMutation({
    mutationFn: async ({ brandId, file }: { brandId: string; file: File }) => {
      const formData = new FormData();
      formData.append('sizeStandards', file);
      
      const response = await fetch(`/api/brands/${brandId}/size-standards/preview`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(errorData.message || 'Upload failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setSizeStandardsPreview(data);
      // Reset column mapping
      setColumnMapping({ usIndex: -1, euIndex: -1, ukIndex: -1, categoryIndex: -1 });
      setUploadStep(2);
      toast({ title: "File Uploaded", description: `Found ${data.headers.length} columns. Map them below.` });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Upload Failed", 
        description: error.message || "Failed to parse size standards file.", 
        variant: "destructive" 
      });
    },
  });

  // Extract categories mutation (Step 2 -> Step 3)
  const extractCategoriesMutation = useMutation({
    mutationFn: async ({ brandId, tempFileId, columnMapping }: { brandId: string; tempFileId: string; columnMapping: any }) => {
      const response = await fetch(`/api/brands/${brandId}/size-standards/extract-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempFileId, columnMapping }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Extraction failed' }));
        throw new Error(errorData.message || 'Extraction failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setCategoriesData({ categories: data.categories, previewRows: data.previewRows });
      setCategoryMapping({});
      setUploadStep(3);
      toast({ title: "Columns Mapped", description: `Found ${data.categories.length} categories to map.` });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Extraction Failed", 
        description: error.message || "Failed to extract categories.", 
        variant: "destructive" 
      });
    },
  });

  // Save size standards mutation (Step 2)
  const saveSizeStandardsMutation = useMutation({
    mutationFn: async ({ brandId, tempFileId, categoryMapping }: { brandId: string; tempFileId: string; categoryMapping: Record<string, string> }) => {
      const response = await fetch(`/api/brands/${brandId}/size-standards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempFileId, categoryMapping }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Save failed' }));
        throw new Error(errorData.message || 'Save failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      const categories = data.sizeStandards ? Object.keys(data.sizeStandards).join(', ') : 'None';
      toast({ 
        title: "Success", 
        description: `Size standards saved for categories: ${categories}` 
      });
      setIsSizeStandardsDialogOpen(false);
      setSizeStandardsFile(null);
      setSizeStandardsUploadBrand(null);
      setSizeStandardsPreview(null);
      setCategoryMapping({});
    },
    onError: (error: Error) => {
      toast({ 
        title: "Save Failed", 
        description: error.message || "Failed to save size standards.", 
        variant: "destructive" 
      });
    },
  });

  const handleSizeStandardsUpload = () => {
    if (sizeStandardsFile && sizeStandardsUploadBrand) {
      previewSizeStandardsMutation.mutate({ brandId: sizeStandardsUploadBrand.id, file: sizeStandardsFile });
    }
  };

  const handleColumnMappingNext = () => {
    if (sizeStandardsPreview && sizeStandardsUploadBrand) {
      extractCategoriesMutation.mutate({ 
        brandId: sizeStandardsUploadBrand.id, 
        tempFileId: sizeStandardsPreview.tempFileId,
        columnMapping 
      });
    }
  };

  const handleSizeStandardsSave = () => {
    if (sizeStandardsPreview && sizeStandardsUploadBrand) {
      saveSizeStandardsMutation.mutate({ 
        brandId: sizeStandardsUploadBrand.id, 
        tempFileId: sizeStandardsPreview.tempFileId,
        categoryMapping 
      });
    }
  };

  // Target categories for mapping - must match product-detail size chart keys for correct product-to-size-chart mapping
  const standardCategories = ['Adult Female', 'Adult Male', 'Unisex', 'Kids Female', 'Kids Male', 'Kids Unisex', 'Infant'];
  
  // Check if column mapping is complete
  const columnMappingComplete = columnMapping.categoryIndex >= 0 && 
    (columnMapping.usIndex >= 0 || columnMapping.euIndex >= 0 || columnMapping.ukIndex >= 0);
  
  // Check if all categories are mapped to valid standard categories
  const allCategoriesMapped = categoriesData.categories.length > 0 && 
    categoriesData.categories.every(
      (cat: string) => standardCategories.includes(categoryMapping[cat] || '')
    );

  const onSubmit = (data: z.infer<typeof brandFormSchema>) => {
    saveBrandMutation.mutate(data);
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBrandLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setBrandLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoUpload = () => {
    if (brandLogoFile && brandLogoUploadBrand) {
      uploadBrandLogoMutation.mutate({ brandId: brandLogoUploadBrand.id, file: brandLogoFile });
    }
  };

  const pendingVisibilityBrandId =
    toggleBrandVisibilityMutation.isPending
      ? toggleBrandVisibilityMutation.variables?.brandId
      : null;

  return (
    <>
      <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Layers className="w-8 h-8 text-blue-600" />
                Brand Management
              </h1>
              <p className="text-muted-foreground mt-2">Manage brands and their logos</p>
            </div>
            <Button 
              onClick={() => {
                setEditingBrand(null);
                brandForm.reset({ name: "", description: "" });
                setIsBrandDialogOpen(true);
              }} 
              data-testid="button-add-brand"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Brand
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Brands</CardTitle>
              <CardDescription>
                View and manage product brands
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(brands as any[]).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Layers className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No brands yet. Add your first brand to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(brands as any[]).map((brand: any) => (
                    <Card key={brand.id} className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center border">
                          {brand.logoUrl ? (
                            <img 
                              src={brand.logoUrl} 
                              alt={brand.name}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <Settings className="h-8 w-8 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{brand.name}</h3>
                            {!brand.isActive && (
                              <Badge variant="outline" className="text-xs bg-gray-100 border-gray-300 text-gray-600">
                                <EyeOff className="h-3 w-3 mr-1" />
                                Hidden
                              </Badge>
                            )}
                            {brand.sizeStandards && Object.keys(brand.sizeStandards).length > 0 ? (
                              <Badge variant="outline" className="text-xs bg-green-50 border-green-200 text-green-700">
                                <Check className="h-3 w-3 mr-1" />
                                Size Chart
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs bg-amber-50 border-amber-200 text-amber-700">
                                <X className="h-3 w-3 mr-1" />
                                No Size Chart
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{brand.description || 'No description'}</p>
                          <div className="flex flex-wrap gap-2 mt-3">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setEditingBrand(brand);
                                brandForm.reset({ 
                                  name: brand.name, 
                                  description: brand.description || "" 
                                });
                                setIsBrandDialogOpen(true);
                              }}
                              data-testid={`button-edit-brand-${brand.id}`}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setBrandLogoUploadBrand(brand);
                                setBrandLogoFile(null);
                                setBrandLogoPreview(null);
                                setIsBrandLogoDialogOpen(true);
                              }}
                              data-testid={`button-upload-brand-logo-${brand.id}`}
                            >
                              <Camera className="h-3 w-3 mr-1" />
                              Logo
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setSizeStandardsUploadBrand(brand);
                                setSizeStandardsFile(null);
                                setIsSizeStandardsDialogOpen(true);
                              }}
                              data-testid={`button-upload-size-standards-${brand.id}`}
                            >
                              <FileSpreadsheet className="h-3 w-3 mr-1" />
                              Size Chart
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => toggleBrandVisibilityMutation.mutate({ 
                                brandId: brand.id, 
                                isActive: !brand.isActive 
                              })}
                              disabled={pendingVisibilityBrandId === brand.id}
                              data-testid={`button-toggle-brand-${brand.id}`}
                            >
                              {pendingVisibilityBrandId === brand.id ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : brand.isActive ? (
                                <EyeOff className="h-3 w-3 mr-1" />
                              ) : (
                                <Eye className="h-3 w-3 mr-1" />
                              )}
                              {brand.isActive ? 'Hide' : 'Show'}
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                if (confirm(`Delete "${brand.name}" and all its products? This action cannot be undone.`)) {
                                  deleteBrandWithProductsMutation.mutate(brand.id);
                                }
                              }}
                              disabled={deleteBrandWithProductsMutation.isPending}
                              data-testid={`button-delete-brand-${brand.id}`}
                            >
                              {deleteBrandWithProductsMutation.isPending ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3 mr-1" />
                              )}
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Brand Dialog */}
          <Dialog open={isBrandDialogOpen} onOpenChange={setIsBrandDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingBrand ? 'Edit Brand' : 'Add New Brand'}</DialogTitle>
                <DialogDescription>
                  {editingBrand ? 'Update brand information' : 'Create a new brand for your products'}
                </DialogDescription>
              </DialogHeader>
              <Form {...brandForm}>
                <form onSubmit={brandForm.handleSubmit(onSubmit)} className="space-y-3">
                  <FormField
                    control={brandForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brand Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Nike, Adidas, etc." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={brandForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Brief description of the brand" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Size Chart Preview - only show when editing a brand with size standards */}
                  {editingBrand?.sizeStandards && Object.keys(editingBrand.sizeStandards).length > 0 && (
                    <div className="border rounded-lg p-2 bg-muted/30">
                      <div className="flex items-center gap-2 mb-1">
                        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Current Size Chart</span>
                        <span className="text-xs text-muted-foreground">({Object.keys(editingBrand.sizeStandards).length} categories)</span>
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                        {Object.entries(editingBrand.sizeStandards).map(([category, standards]: [string, any]) => (
                          <div key={category} className="bg-background rounded p-1.5 border">
                            <div className="font-medium text-xs text-primary">{category}</div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 text-xs">
                              {standards.EU && (
                                <div className="flex gap-1 flex-wrap overflow-hidden">
                                  <span className="text-muted-foreground font-medium shrink-0">EU:</span>
                                  <span className="text-foreground truncate">{standards.EU.filter((s: string) => s && s !== '-').slice(0, 6).join(', ')}{standards.EU.length > 6 ? '...' : ''}</span>
                                </div>
                              )}
                              {standards.UK && (
                                <div className="flex gap-1 flex-wrap overflow-hidden">
                                  <span className="text-muted-foreground font-medium shrink-0">UK:</span>
                                  <span className="text-foreground truncate">{standards.UK.filter((s: string) => s && s !== '-').slice(0, 6).join(', ')}{standards.UK.length > 6 ? '...' : ''}</span>
                                </div>
                              )}
                              {standards.US && (
                                <div className="flex gap-1 flex-wrap overflow-hidden">
                                  <span className="text-muted-foreground font-medium shrink-0">US:</span>
                                  <span className="text-foreground truncate">{standards.US.filter((s: string) => s && s !== '-').slice(0, 6).join(', ')}{standards.US.length > 6 ? '...' : ''}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setIsBrandDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={saveBrandMutation.isPending}>
                      {editingBrand ? 'Update' : 'Create'} Brand
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Brand Logo Upload Dialog */}
          <Dialog open={isBrandLogoDialogOpen} onOpenChange={setIsBrandLogoDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Brand Logo</DialogTitle>
                <DialogDescription>
                  Upload a logo for {brandLogoUploadBrand?.name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Select Logo Image</Label>
                  <Input 
                    type="file" 
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    className="mt-2"
                  />
                </div>
                {brandLogoPreview && (
                  <div className="border rounded-lg p-4">
                    <Label className="text-sm text-muted-foreground">Preview</Label>
                    <img 
                      src={brandLogoPreview} 
                      alt="Logo preview"
                      className="w-32 h-32 object-contain mx-auto mt-2 border rounded"
                    />
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setIsBrandLogoDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleLogoUpload}
                    disabled={!brandLogoFile || uploadBrandLogoMutation.isPending}
                  >
                    Upload Logo
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Size Standards Upload Dialog - 3 Step Process */}
          <Dialog open={isSizeStandardsDialogOpen} onOpenChange={(open) => {
            setIsSizeStandardsDialogOpen(open);
            if (!open) {
              setSizeStandardsPreview(null);
              setSizeStandardsFile(null);
              setCategoryMapping({});
              setUploadStep(1);
              setColumnMapping({ usIndex: -1, euIndex: -1, ukIndex: -1, categoryIndex: -1 });
              setCategoriesData({ categories: [], previewRows: [] });
            }
          }}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    {uploadStep === 1 && 'Upload Size Chart'}
                    {uploadStep === 2 && 'Step 1: Map Columns'}
                    {uploadStep === 3 && 'Step 2: Map Categories'}
                  </div>
                </DialogTitle>
                <DialogDescription>
                  {uploadStep === 1 && `Upload an Excel file with size data for ${sizeStandardsUploadBrand?.name}`}
                  {uploadStep === 2 && 'Select which columns contain US, EU, UK sizes and Category'}
                  {uploadStep === 3 && 'Map each category to the correct size chart (Adult Female, Adult Male, Unisex, Kids Female, Kids Male, Kids Unisex, Infant)'}
                </DialogDescription>
              </DialogHeader>
              
              {/* Progress indicator */}
              <div className="flex items-center gap-2 mb-4">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${uploadStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>1</div>
                <div className={`flex-1 h-1 ${uploadStep >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`} />
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${uploadStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
                <div className={`flex-1 h-1 ${uploadStep >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`} />
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${uploadStep >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>3</div>
              </div>
              
              <div className="space-y-4">
                {/* Current size standards status */}
                {uploadStep === 1 && sizeStandardsUploadBrand?.sizeStandards && Object.keys(sizeStandardsUploadBrand.sizeStandards).length > 0 && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                      <Check className="h-4 w-4" />
                      Current Size Standards
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(sizeStandardsUploadBrand.sizeStandards).map((category: string) => (
                        <Badge key={category} variant="secondary" className="bg-green-100">
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 1: File Upload */}
                {uploadStep === 1 && (
                  <div className="p-4 border-2 border-dashed rounded-lg hover:border-primary/50 transition-colors">
                    <Label className="text-sm font-medium">Select Excel File</Label>
                    <p className="text-xs text-muted-foreground mb-3">
                      Upload an Excel file containing size data
                    </p>
                    <Input 
                      type="file" 
                      accept=".xlsx,.xls"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSizeStandardsFile(file);
                        }
                      }}
                      data-testid="input-size-standards-file"
                    />
                    {sizeStandardsFile && (
                      <div className="flex items-center gap-2 mt-2 p-2 bg-blue-50 rounded text-sm text-blue-700">
                        <FileSpreadsheet className="h-4 w-4" />
                        {sizeStandardsFile.name}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2: Column Mapping */}
                {uploadStep === 2 && sizeStandardsPreview && (
                  <div className="space-y-4">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 text-blue-700 font-medium mb-1">
                        <Table className="h-4 w-4" />
                        File Summary
                      </div>
                      <p className="text-sm text-blue-600">
                        {sizeStandardsPreview.totalRows} rows, {sizeStandardsPreview.headers.length} columns
                      </p>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Map Columns to Size Standards</Label>
                      <p className="text-xs text-muted-foreground">
                        Select which column contains each type of data. At least one size column (US, EU, or UK) and Category are required.
                      </p>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs mb-1">US Size Column</Label>
                          <Select
                            value={columnMapping.usIndex >= 0 ? String(columnMapping.usIndex) : ''}
                            onValueChange={(value) => setColumnMapping(prev => ({ ...prev, usIndex: value ? parseInt(value) : -1 }))}
                          >
                            <SelectTrigger data-testid="select-column-us">
                              <SelectValue placeholder="Select column..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="-1">Not Available</SelectItem>
                              {sizeStandardsPreview.headers.map((h: any) => (
                                <SelectItem key={h.index} value={String(h.index)}>{h.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs mb-1">EU Size Column</Label>
                          <Select
                            value={columnMapping.euIndex >= 0 ? String(columnMapping.euIndex) : ''}
                            onValueChange={(value) => setColumnMapping(prev => ({ ...prev, euIndex: value ? parseInt(value) : -1 }))}
                          >
                            <SelectTrigger data-testid="select-column-eu">
                              <SelectValue placeholder="Select column..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="-1">Not Available</SelectItem>
                              {sizeStandardsPreview.headers.map((h: any) => (
                                <SelectItem key={h.index} value={String(h.index)}>{h.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs mb-1">UK Size Column</Label>
                          <Select
                            value={columnMapping.ukIndex >= 0 ? String(columnMapping.ukIndex) : ''}
                            onValueChange={(value) => setColumnMapping(prev => ({ ...prev, ukIndex: value ? parseInt(value) : -1 }))}
                          >
                            <SelectTrigger data-testid="select-column-uk">
                              <SelectValue placeholder="Select column..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="-1">Not Available</SelectItem>
                              {sizeStandardsPreview.headers.map((h: any) => (
                                <SelectItem key={h.index} value={String(h.index)}>{h.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs mb-1">Category Column <span className="text-red-500">*</span></Label>
                          <Select
                            value={columnMapping.categoryIndex >= 0 ? String(columnMapping.categoryIndex) : ''}
                            onValueChange={(value) => setColumnMapping(prev => ({ ...prev, categoryIndex: value ? parseInt(value) : -1 }))}
                          >
                            <SelectTrigger data-testid="select-column-category">
                              <SelectValue placeholder="Select column..." />
                            </SelectTrigger>
                            <SelectContent>
                              {sizeStandardsPreview.headers.map((h: any) => (
                                <SelectItem key={h.index} value={String(h.index)}>{h.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Raw Preview Table */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Data Preview (first 10 rows)</Label>
                      <div className="border rounded-lg overflow-hidden overflow-x-auto max-h-[200px]">
                        <table className="w-full text-xs">
                          <thead className="bg-muted sticky top-0">
                            <tr>
                              {sizeStandardsPreview.headers.map((h: any) => (
                                <th key={h.index} className="p-2 text-left whitespace-nowrap">
                                  {h.name}
                                  {columnMapping.usIndex === h.index && <Badge className="ml-1 text-[10px] px-1" variant="secondary">US</Badge>}
                                  {columnMapping.euIndex === h.index && <Badge className="ml-1 text-[10px] px-1" variant="secondary">EU</Badge>}
                                  {columnMapping.ukIndex === h.index && <Badge className="ml-1 text-[10px] px-1" variant="secondary">UK</Badge>}
                                  {columnMapping.categoryIndex === h.index && <Badge className="ml-1 text-[10px] px-1" variant="outline">Category</Badge>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {sizeStandardsPreview.rawPreviewRows.slice(0, 10).map((row: any[], idx: number) => (
                              <tr key={idx} className="hover:bg-muted/50">
                                {row.map((cell: string, cellIdx: number) => (
                                  <td key={cellIdx} className="p-2 whitespace-nowrap">{cell || '-'}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Category Mapping */}
                {uploadStep === 3 && (
                  <div className="space-y-4">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 text-blue-700 font-medium mb-1">
                        <Table className="h-4 w-4" />
                        Categories Found
                      </div>
                      <p className="text-sm text-blue-600">
                        {categoriesData.categories.length} unique categories to map
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Map Categories to Age Groups</Label>
                        {!allCategoriesMapped && (
                          <span className="text-xs text-amber-600">
                            {categoriesData.categories.filter((c: string) => !standardCategories.includes(categoryMapping[c] || '')).length} unmapped
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Assign each category from your file to Adult Female, Adult Male, Unisex, Kids Female, Kids Male, Kids Unisex, or Infant
                      </p>
                      
                      <div className="border rounded-lg overflow-hidden">
                        <div className="grid grid-cols-2 gap-0 bg-muted p-2 text-sm font-medium">
                          <div>File Category</div>
                          <div>Map To</div>
                        </div>
                        <div className="divide-y max-h-[250px] overflow-y-auto">
                          {categoriesData.categories.map((category: string) => (
                            <div key={category} className="grid grid-cols-2 gap-2 p-2 items-center">
                              <div className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                                {category}
                              </div>
                              <Select
                                value={categoryMapping[category] || ''}
                                onValueChange={(value) => {
                                  setCategoryMapping(prev => ({
                                    ...prev,
                                    [category]: value
                                  }));
                                }}
                              >
                                <SelectTrigger className="h-8" data-testid={`select-category-${category}`}>
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {standardCategories.map((std) => (
                                    <SelectItem key={std} value={std}>
                                      {std}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Preview Table with mapped columns */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Data Preview (with mapped columns)</Label>
                      <div className="border rounded-lg overflow-hidden overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="p-2 text-left">Category</th>
                              <th className="p-2 text-left">US</th>
                              <th className="p-2 text-left">UK</th>
                              <th className="p-2 text-left">EU</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {categoriesData.previewRows.slice(0, 10).map((row: any, idx: number) => (
                              <tr key={idx} className="hover:bg-muted/50">
                                <td className="p-2 font-mono text-xs">{row.category}</td>
                                <td className="p-2">{row.us || '-'}</td>
                                <td className="p-2">{row.uk || '-'}</td>
                                <td className="p-2">{row.eu || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-2 border-t">
                  <Button variant="outline" onClick={() => {
                    if (uploadStep === 3) {
                      setUploadStep(2);
                      setCategoriesData({ categories: [], previewRows: [] });
                    } else if (uploadStep === 2) {
                      setUploadStep(1);
                      setSizeStandardsPreview(null);
                      setSizeStandardsFile(null);
                    } else {
                      setIsSizeStandardsDialogOpen(false);
                    }
                  }}>
                    {uploadStep > 1 ? 'Back' : 'Cancel'}
                  </Button>
                  
                  {uploadStep === 1 && (
                    <Button 
                      onClick={handleSizeStandardsUpload}
                      disabled={!sizeStandardsFile || previewSizeStandardsMutation.isPending}
                      data-testid="button-parse-size-standards"
                    >
                      {previewSizeStandardsMutation.isPending ? 'Uploading...' : (
                        <>Next <ArrowRight className="h-4 w-4 ml-2" /></>
                      )}
                    </Button>
                  )}
                  
                  {uploadStep === 2 && (
                    <Button 
                      onClick={handleColumnMappingNext}
                      disabled={!columnMappingComplete || extractCategoriesMutation.isPending}
                      data-testid="button-column-mapping-next"
                    >
                      {extractCategoriesMutation.isPending ? 'Processing...' : (
                        <>Next <ArrowRight className="h-4 w-4 ml-2" /></>
                      )}
                    </Button>
                  )}
                  
                  {uploadStep === 3 && (
                    <Button 
                      onClick={handleSizeStandardsSave}
                      disabled={!allCategoriesMapped || saveSizeStandardsMutation.isPending}
                      data-testid="button-save-size-standards"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {saveSizeStandardsMutation.isPending ? 'Saving...' : 'Save Size Standards'}
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
    </>
  );
}
