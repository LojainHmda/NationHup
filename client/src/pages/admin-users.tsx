import { useState, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { 
  Users, 
  Search,
  Edit2, 
  Trash2,
  KeyRound,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  RefreshCw,
  User,
  Plus,
  Upload,
  FileSpreadsheet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';

interface CustomerProfile {
  id: string;
  legalName: string | null;
  tradingName: string | null;
  type: string;
  status: string;
  taxVatNumber: string | null;
  taxRate?: string | null;
  registrationCountry: string | null;
  primaryContactName: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  } | null;
  shippingAddresses: Array<{
    label: string;
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
    isDefault: boolean;
  }>;
  companyName: string | null;
  businessType: string | null;
  taxId: string | null;
  creditLimit: string | null;
  isBlacklisted: boolean;
  blacklistReason: string | null;
  notes: string | null;
  allowPreOrders: boolean;
  defaultCurrency: string;
  createdAt: string;
  updatedAt: string;
}

interface CustomerUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  role: string;
  preferredCurrency: string | null;
  createdAt: string;
  profile: CustomerProfile | null;
}

type SortField = 'username' | 'displayName' | 'email' | 'status' | 'createdAt' | 'companyName' | 'phone';
type SortDirection = 'asc' | 'desc';

/** Read persisted customer document URLs from API profile (camelCase, snake_case, or JSON string arrays). */
function getProfileDocumentFields(profile: Record<string, unknown> | null | undefined): {
  tradeLicensePhotoUrl: string;
  idPhotoUrl: string;
  storePhotoUrls: string[];
} {
  if (!profile) {
    return { tradeLicensePhotoUrl: '', idPhotoUrl: '', storePhotoUrls: [] };
  }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const trade = str(
    profile.tradeLicensePhotoUrl ??
      profile.trade_license_photo_url,
  );
  const id = str(profile.idPhotoUrl ?? profile.id_photo_url);
  let rawStores = profile.storePhotoUrls ?? profile.store_photo_urls;
  let storePhotoUrls: string[] = [];
  if (Array.isArray(rawStores)) {
    storePhotoUrls = rawStores.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim());
  } else if (typeof rawStores === 'string') {
    try {
      const parsed = JSON.parse(rawStores);
      if (Array.isArray(parsed)) {
        storePhotoUrls = parsed.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim());
      }
    } catch {
      /* ignore */
    }
  }
  return { tradeLicensePhotoUrl: trade, idPhotoUrl: id, storePhotoUrls };
}

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  'Active': { 
    label: 'Active', 
    icon: CheckCircle2, 
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  },
  'Suspended': { 
    label: 'Suspended', 
    icon: XCircle, 
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  },
  'On-Hold': { 
    label: 'On Hold', 
    icon: Clock, 
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
  },
};

export default function AdminUsersPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<{
    open: boolean;
    title: string;
    url: string;
  }>({
    open: false,
    title: '',
    url: '',
  });
  const [uploadingDocument, setUploadingDocument] = useState<'tradeLicense' | 'id' | 'store' | null>(null);
  const tradeLicenseInputRef = useRef<HTMLInputElement | null>(null);
  const idPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const storePhotosInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedUser, setSelectedUser] = useState<CustomerUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '',
    displayName: '',
    email: '',
    preferredCurrency: 'USD',
    status: 'Active',
    phone: '',
    businessName: '',
    ownerName: '',
    primaryContactName: '',
    taxVatNumber: '',
    taxRate: '',
    type: 'Retail',
    accountManagerId: '',
    phoneNumbers: [] as string[],
    billingAddress: {
      line1: '',
      line2: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
    },
    shippingAddresses: [] as Array<{
      label: string;
      line1: string;
      line2?: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
      isDefault: boolean;
    }>,
    creditLimit: '0',
    allowPreOrders: true,
    notes: '',
    tradeLicensePhotoUrl: '',
    idPhotoUrl: '',
    storePhotoUrls: [] as string[],
  });
  
  const [newPassword, setNewPassword] = useState('');

  const { data: users = [], isLoading, refetch } = useQuery<CustomerUser[]>({
    queryKey: ['/api/admin/customer-users'],
  });

  const { data: accountManagers = [] } = useQuery<Array<{ id: string; name: string; email: string }>>({
    queryKey: ['/api/account-managers'],
  });

  const { data: currencies = [] } = useQuery<Array<{ code: string; name: string; symbol: string; isDefault: boolean }>>({
    queryKey: ['/api/currencies'],
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, userData, profileData }: { 
      userId: string; 
      userData: { username?: string; displayName?: string; email?: string; preferredCurrency?: string };
      profileData?: Partial<CustomerProfile>;
    }) => {
      await apiRequest(`/api/admin/customer-users/${userId}`, 'PATCH', userData);
      if (profileData) {
        await apiRequest(`/api/admin/customer-users/${userId}/profile`, 'PATCH', profileData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/customer-users'] });
      setEditDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "User Updated",
        description: "The customer has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Update User",
        description: error.message || "Could not update the user.",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      return await apiRequest(`/api/admin/customer-users/${userId}`, 'PATCH', { newPassword: password });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/customer-users'] });
      setPasswordDialogOpen(false);
      setNewPassword('');
      toast({
        title: "Password Reset",
        description: "The password has been reset successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Reset Password",
        description: error.message || "Could not reset the password.",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/admin/customer-users/${userId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/customer-users'] });
      setDeleteDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "User Deleted",
        description: "The customer has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Delete User",
        description: error.message || "Could not delete the user.",
        variant: "destructive",
      });
    },
  });

  const filteredAndSortedUsers = useMemo(() => {
    let result = [...users];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(user => 
        user.username?.toLowerCase().includes(query) ||
        user.displayName?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query) ||
        user.profile?.phone?.toLowerCase().includes(query) ||
        user.profile?.companyName?.toLowerCase().includes(query) ||
        user.profile?.legalName?.toLowerCase().includes(query) ||
        user.profile?.tradingName?.toLowerCase().includes(query)
      );
    }
    
    if (statusFilter !== 'all') {
      result = result.filter(user => user.profile?.status === statusFilter);
    }
    
    result.sort((a, b) => {
      let aVal: string | null = null;
      let bVal: string | null = null;
      
      switch (sortField) {
        case 'username':
          aVal = a.username;
          bVal = b.username;
          break;
        case 'displayName':
          aVal = a.displayName;
          bVal = b.displayName;
          break;
        case 'email':
          aVal = a.email;
          bVal = b.email;
          break;
        case 'status':
          aVal = a.profile?.status || '';
          bVal = b.profile?.status || '';
          break;
        case 'createdAt':
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
        case 'companyName':
          aVal = a.profile?.companyName || a.profile?.legalName || '';
          bVal = b.profile?.companyName || b.profile?.legalName || '';
          break;
        case 'phone':
          aVal = a.profile?.phone || '';
          bVal = b.profile?.phone || '';
          break;
      }
      
      if (!aVal && !bVal) return 0;
      if (!aVal) return sortDirection === 'asc' ? 1 : -1;
      if (!bVal) return sortDirection === 'asc' ? -1 : 1;
      
      const comparison = aVal.localeCompare(bVal);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [users, searchQuery, statusFilter, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-2 w-2 ml-0.5 shrink-0 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-2 w-2 ml-0.5 shrink-0" /> 
      : <ArrowDown className="h-2 w-2 ml-0.5 shrink-0" />;
  };

  const openEditDialog = (user: CustomerUser) => {
    setSelectedUser(user);
    const profile = user.profile as Record<string, unknown> | null | undefined;
    const docs = getProfileDocumentFields(profile ?? null);
    setFormData({
      username: user.username || '',
      displayName: user.displayName || '',
      email: user.email || (profile?.email as string) || '',
      preferredCurrency: user.preferredCurrency || 'USD',
      status: (profile?.status as string) || 'Active',
      phone: (profile?.phone as string) || '',
      businessName: (profile?.businessName as string) || (profile?.companyName as string) || '',
      ownerName: (profile?.ownerName as string) || (profile?.primaryContactName as string) || '',
      primaryContactName: (profile?.primaryContactName as string) || '',
      taxVatNumber: (profile?.taxVatNumber as string) || '',
      taxRate: profile?.taxRate != null && String(profile.taxRate) !== '' ? String(profile.taxRate) : '',
      type: (profile?.type as string) || 'Retail',
      accountManagerId: (profile?.accountManagerId as string) || '',
      phoneNumbers: (profile?.phoneNumbers as string[]) || [],
      billingAddress: {
        line1: (profile?.billingAddress as { line1?: string })?.line1 || '',
        line2: (profile?.billingAddress as { line2?: string })?.line2 || '',
        city: (profile?.billingAddress as { city?: string })?.city || '',
        state: (profile?.billingAddress as { state?: string })?.state || '',
        postalCode: (profile?.billingAddress as { postalCode?: string })?.postalCode || '',
        country: (profile?.billingAddress as { country?: string })?.country || '',
      },
      creditLimit: (profile?.creditLimit as string) || '0',
      allowPreOrders: (profile?.allowPreOrders as boolean) ?? true,
      shippingAddresses: (profile?.shippingAddresses as typeof formData.shippingAddresses) || [],
      notes: (profile?.notes as string) || '',
      tradeLicensePhotoUrl: docs.tradeLicensePhotoUrl,
      idPhotoUrl: docs.idPhotoUrl,
      storePhotoUrls: docs.storePhotoUrls,
    });
    setEditDialogOpen(true);
  };

  const openPasswordDialog = (user: CustomerUser) => {
    setSelectedUser(user);
    setNewPassword('');
    setShowPassword(false);
    setPasswordDialogOpen(true);
  };

  const handleSaveUser = () => {
    if (!selectedUser) return;
    
    const userData = {
      username: formData.username,
      displayName: formData.displayName,
      email: formData.email || undefined,
      preferredCurrency: formData.preferredCurrency,
    };
    
    const profileData = {
      status: formData.status,
      phone: formData.phone || undefined,
      businessName: formData.businessName || undefined,
      ownerName: formData.ownerName || undefined,
      primaryContactName: formData.primaryContactName || undefined,
      taxVatNumber: formData.taxVatNumber || undefined,
      taxRate: formData.taxRate || undefined,
      type: formData.type || undefined,
      companyName: formData.businessName || undefined,
      accountManagerId: formData.accountManagerId || undefined,
      phoneNumbers: formData.phoneNumbers,
      billingAddress: formData.billingAddress,
      creditLimit: formData.creditLimit || undefined,
      allowPreOrders: formData.allowPreOrders,
      shippingAddresses: formData.shippingAddresses,
      notes: formData.notes || undefined,
      tradeLicensePhotoUrl: formData.tradeLicensePhotoUrl || undefined,
      idPhotoUrl: formData.idPhotoUrl || undefined,
      storePhotoUrls: formData.storePhotoUrls,
    };
    
    updateUserMutation.mutate({ userId: selectedUser.id, userData, profileData });
  };

  const uploadDocumentPhoto = async (type: 'tradeLicense' | 'id' | 'store', file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('type', type);

    const response = await fetch('/api/customer/profile/upload-photo', {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });

    if (!response.ok) {
      let message = `Upload failed (${response.status})`;
      try {
        const data = await response.json();
        if (data?.message) message = data.message;
      } catch {
        // ignore non-json responses
      }
      throw new Error(message);
    }

    const data = await response.json() as { url?: string };
    if (!data.url) {
      throw new Error('Upload completed but no URL was returned');
    }
    return data.url;
  };

  const handleUploadSingleDocument = async (
    type: 'tradeLicense' | 'id',
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setUploadingDocument(type);
      const url = await uploadDocumentPhoto(type, file);
      setFormData((prev) => ({
        ...prev,
        ...(type === 'tradeLicense'
          ? { tradeLicensePhotoUrl: url }
          : { idPhotoUrl: url }),
      }));
      toast({ title: 'Uploaded', description: 'Document uploaded successfully.' });
    } catch (error: any) {
      toast({
        title: 'Upload Failed',
        description: error?.message || 'Could not upload document.',
        variant: 'destructive',
      });
    } finally {
      setUploadingDocument(null);
    }
  };

  const handleAddStorePhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    try {
      setUploadingDocument('store');
      const uploadedUrls = await Promise.all(files.map((file) => uploadDocumentPhoto('store', file)));
      setFormData((prev) => ({
        ...prev,
        storePhotoUrls: [...prev.storePhotoUrls, ...uploadedUrls],
      }));
      toast({
        title: 'Store Photos Uploaded',
        description: `${uploadedUrls.length} photo${uploadedUrls.length > 1 ? 's' : ''} added.`,
      });
    } catch (error: any) {
      toast({
        title: 'Upload Failed',
        description: error?.message || 'Could not upload store photos.',
        variant: 'destructive',
      });
    } finally {
      setUploadingDocument(null);
    }
  };

  const handleDeleteDocument = (type: 'tradeLicense' | 'id') => {
    setFormData((prev) => ({
      ...prev,
      ...(type === 'tradeLicense'
        ? { tradeLicensePhotoUrl: '' }
        : { idPhotoUrl: '' }),
    }));
  };

  const handleRemoveStorePhoto = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      storePhotoUrls: prev.storePhotoUrls.filter((_, i) => i !== index),
    }));
  };

  const keepDigitsOnly = (value: string) => value.replace(/\D/g, '');
  const keepDecimalOnly = (value: string) => {
    const cleaned = value.replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length <= 1) return cleaned;
    return `${parts[0]}.${parts.slice(1).join('')}`;
  };

  const addPhoneNumber = () => {
    setFormData({
      ...formData,
      phoneNumbers: [...formData.phoneNumbers, ''],
    });
  };

  const removePhoneNumber = (index: number) => {
    setFormData({
      ...formData,
      phoneNumbers: formData.phoneNumbers.filter((_, i) => i !== index),
    });
  };

  const updatePhoneNumber = (index: number, value: string) => {
    const newPhoneNumbers = [...formData.phoneNumbers];
    newPhoneNumbers[index] = value;
    setFormData({
      ...formData,
      phoneNumbers: newPhoneNumbers,
    });
  };

  const handleResetPassword = () => {
    if (!selectedUser || !newPassword) return;
    resetPasswordMutation.mutate({ userId: selectedUser.id, password: newPassword });
  };

  const getStatusBadge = (status: string | undefined) => {
    const config = STATUS_CONFIG[status || 'Active'] || STATUS_CONFIG['Active'];
    const Icon = config.icon;
    return (
      <Badge
        className={`${config.color} flex items-center gap-0.5 px-1.5 py-0 text-[9px] font-normal leading-none`}
        data-testid={`badge-status-${status?.toLowerCase()}`}
      >
        <Icon className="h-2.5 w-2.5 shrink-0" />
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleExportUsersExcel = () => {
    const rows = users.map((user) => {
      const profile = user.profile;
      return {
        UserID: user.id,
        Username: user.username || '',
        DisplayName: user.displayName || '',
        Email: user.email || '',
        Role: user.role || '',
        PreferredCurrency: user.preferredCurrency || '',
        Status: profile?.status || 'Active',
        BusinessName: profile?.companyName || profile?.legalName || '',
        OwnerName: profile?.primaryContactName || '',
        Phone: profile?.phone || '',
        TaxVatNumber: profile?.taxVatNumber || '',
        CreditLimit: profile?.creditLimit || '',
        AllowPreOrders: profile?.allowPreOrders ? 'Yes' : 'No',
        BillingAddressLine1: profile?.billingAddress?.line1 || '',
        BillingAddressLine2: profile?.billingAddress?.line2 || '',
        BillingCity: profile?.billingAddress?.city || '',
        BillingState: profile?.billingAddress?.state || '',
        BillingPostalCode: profile?.billingAddress?.postalCode || '',
        BillingCountry: profile?.billingAddress?.country || '',
        ShippingAddressesCount: profile?.shippingAddresses?.length || 0,
        Notes: profile?.notes || '',
        TradeLicensePhotoUrl: (profile as any)?.tradeLicensePhotoUrl || '',
        IdPhotoUrl: (profile as any)?.idPhotoUrl || '',
        StorePhotoUrls: Array.isArray((profile as any)?.storePhotoUrls) ? (profile as any).storePhotoUrls.join(', ') : '',
        CreatedAt: formatDate(user.createdAt),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'CustomerUsers');
    XLSX.writeFile(workbook, `customer_users_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: 'Excel Export Complete',
      description: `Exported ${rows.length} users.`,
    });
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: users.length, Active: 0, Suspended: 0, 'On-Hold': 0 };
    users.forEach(user => {
      const status = user.profile?.status || 'Active';
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [users]);

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="p-4">
          <CardHeader className="space-y-1 p-0">
            <CardTitle className="text-base">Access Denied</CardTitle>
            <CardDescription className="text-xs">You don't have permission to access this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 dark:from-slate-900 dark:via-gray-900 dark:to-slate-800 p-3 sm:p-4 lg:p-5">
      <div className="max-w-7xl mx-auto space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-600 shrink-0" />
              Customer Management
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm mt-0.5 leading-tight">
              View and manage all registered customer accounts
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              onClick={() => navigate('/create-customer')}
              className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs"
              data-testid="button-create-customer"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create New Customer
            </Button>
            <Button 
              variant="outline"
              size="sm"
              onClick={handleExportUsersExcel}
              className="h-8 flex items-center gap-1.5 text-xs"
              data-testid="button-export-excel"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="py-2 px-3 sm:px-4 space-y-0">
            <div className="flex flex-col gap-1.5">
              <CardTitle className="text-sm font-semibold leading-tight tracking-tight">
                Customer Users
              </CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-1 sm:min-w-0">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    data-testid="card-filter-all"
                    className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-left transition-all ${
                      statusFilter === 'all'
                        ? 'border-blue-400 bg-blue-50/80 ring-2 ring-blue-500 dark:bg-blue-950/40'
                        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="text-[10px] font-medium leading-none text-slate-600 dark:text-slate-300">
                      All Users
                    </span>
                    <span className="text-xs font-bold tabular-nums leading-none text-slate-900 dark:text-white">
                      {statusCounts.all}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('Active')}
                    data-testid="card-filter-active"
                    className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-left transition-all ${
                      statusFilter === 'Active'
                        ? 'border-green-400 bg-green-50/80 ring-2 ring-green-500 dark:bg-green-950/40'
                        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                    <span className="text-[10px] font-medium leading-none text-slate-600 dark:text-slate-300">
                      Active
                    </span>
                    <span className="text-xs font-bold tabular-nums leading-none text-green-700 dark:text-green-400">
                      {statusCounts.Active}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('Suspended')}
                    data-testid="card-filter-suspended"
                    className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-left transition-all ${
                      statusFilter === 'Suspended'
                        ? 'border-red-400 bg-red-50/80 ring-2 ring-red-500 dark:bg-red-950/40'
                        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50'
                    }`}
                  >
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                    <span className="text-[10px] font-medium leading-none text-slate-600 dark:text-slate-300">
                      Suspended
                    </span>
                    <span className="text-xs font-bold tabular-nums leading-none text-red-700 dark:text-red-400">
                      {statusCounts.Suspended}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('On-Hold')}
                    data-testid="card-filter-onhold"
                    className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-left transition-all ${
                      statusFilter === 'On-Hold'
                        ? 'border-yellow-400 bg-yellow-50/80 ring-2 ring-yellow-500 dark:bg-yellow-950/40'
                        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50'
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0 text-yellow-600" />
                    <span className="text-[10px] font-medium leading-none text-slate-600 dark:text-slate-300">
                      On Hold
                    </span>
                    <span className="text-xs font-bold tabular-nums leading-none text-yellow-700 dark:text-yellow-500">
                      {statusCounts['On-Hold']}
                    </span>
                  </button>
                </div>
                <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:max-w-md sm:flex-row sm:shrink-0">
                  <div className="relative min-w-0 flex-1 sm:w-56">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 pl-9 text-xs"
                      data-testid="input-search"
                    />
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-0.5 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                        onClick={() => setSearchQuery('')}
                        data-testid="button-clear-search"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 w-full text-xs sm:w-36" data-testid="select-status-filter">
                      <Filter className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                      <SelectValue placeholder="Filter Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Suspended">Suspended</SelectItem>
                      <SelectItem value="On-Hold">On Hold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 py-2 sm:px-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : filteredAndSortedUsers.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No customers found</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <Table className="border-collapse text-[9px] leading-tight border border-slate-200 dark:border-slate-700 [&_th]:font-normal [&_td]:font-normal [&_th]:border-r [&_td]:border-r [&_th]:border-slate-200 [&_td]:border-slate-200 dark:[&_th]:border-slate-600 dark:[&_td]:border-slate-600 [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
                  <TableHeader className="bg-slate-100 dark:bg-slate-800 [&_tr]:border-b border-slate-200 dark:border-slate-700">
                    <TableRow className="hover:bg-transparent border-transparent">
                      <TableHead 
                        className="cursor-pointer h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/90 dark:hover:bg-slate-700/90 border-b border-slate-200 dark:border-slate-700"
                        onClick={() => handleSort('username')}
                      >
                        <div className="flex items-center gap-1 font-normal">
                          Username {getSortIcon('username')}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/90 dark:hover:bg-slate-700/90 border-b border-slate-200 dark:border-slate-700"
                        onClick={() => handleSort('displayName')}
                      >
                        <div className="flex items-center gap-1 font-normal">
                          Display Name {getSortIcon('displayName')}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/90 dark:hover:bg-slate-700/90 border-b border-slate-200 dark:border-slate-700"
                        onClick={() => handleSort('email')}
                      >
                        <div className="flex items-center gap-1 font-normal">
                          Email {getSortIcon('email')}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/90 dark:hover:bg-slate-700/90 border-b border-slate-200 dark:border-slate-700"
                        onClick={() => handleSort('phone')}
                      >
                        <div className="flex items-center gap-1 font-normal">
                          Phone {getSortIcon('phone')}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/90 dark:hover:bg-slate-700/90 border-b border-slate-200 dark:border-slate-700"
                        onClick={() => handleSort('companyName')}
                      >
                        <div className="flex items-center gap-1 font-normal">
                          Company {getSortIcon('companyName')}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/90 dark:hover:bg-slate-700/90 border-b border-slate-200 dark:border-slate-700"
                        onClick={() => handleSort('status')}
                      >
                        <div className="flex items-center gap-1 font-normal">
                          Status {getSortIcon('status')}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/90 dark:hover:bg-slate-700/90 border-b border-slate-200 dark:border-slate-700"
                        onClick={() => handleSort('createdAt')}
                      >
                        <div className="flex items-center gap-1 font-normal">
                          Joined {getSortIcon('createdAt')}
                        </div>
                      </TableHead>
                      <TableHead className="text-right h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedUsers.map((user) => (
                      <TableRow key={user.id} className="[&>td]:py-1 text-[9px] font-normal" data-testid={`row-user-${user.id}`}>
                        <TableCell className="px-2 py-1 text-[9px] font-normal text-slate-700 dark:text-slate-300 max-w-[8rem] truncate" data-testid={`text-username-${user.id}`}>
                          {user.username}
                        </TableCell>
                        <TableCell className="px-2 py-1 text-[9px] font-normal text-slate-700 dark:text-slate-300 max-w-[10rem] truncate" data-testid={`text-displayname-${user.id}`}>
                          {user.displayName || '-'}
                        </TableCell>
                        <TableCell className="px-2 py-1 text-[9px] font-normal text-slate-700 dark:text-slate-300 max-w-[12rem] truncate" data-testid={`text-email-${user.id}`}>
                          {user.email || user.profile?.email || '-'}
                        </TableCell>
                        <TableCell className="px-2 py-1 text-[9px] font-normal text-slate-700 dark:text-slate-300" data-testid={`text-phone-${user.id}`}>
                          {user.profile?.phone || '-'}
                        </TableCell>
                        <TableCell className="px-2 py-1 text-[9px] font-normal text-slate-700 dark:text-slate-300 max-w-[10rem] truncate" data-testid={`text-company-${user.id}`}>
                          {user.profile?.companyName || user.profile?.legalName || '-'}
                        </TableCell>
                        <TableCell className="px-2 py-1 text-[9px] font-normal text-slate-700 dark:text-slate-300">
                          {getStatusBadge(user.profile?.status)}
                        </TableCell>
                        <TableCell className="px-2 py-1 text-[9px] font-normal text-slate-700 dark:text-slate-300 tabular-nums" data-testid={`text-joined-${user.id}`}>
                          {formatDate(user.createdAt)}
                        </TableCell>
                        <TableCell className="text-right px-2 py-1">
                          <div className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => openEditDialog(user)}
                              data-testid={`button-edit-${user.id}`}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => openPasswordDialog(user)}
                              data-testid={`button-reset-password-${user.id}`}
                            >
                              <KeyRound className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto gap-2 p-4 sm:p-5">
          <DialogHeader className="pb-1 space-y-0">
            <DialogTitle className="flex items-center gap-1.5 text-sm font-semibold">
              <User className="h-3.5 w-3.5 shrink-0" />
              Edit: {selectedUser?.displayName || selectedUser?.username}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-2">
            <div className="text-[11px] font-medium text-slate-500 border-b pb-0.5">Business Information</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
              <div>
                <Label className="text-[11px]">Business Name</Label>
                <Input
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className="h-7 text-xs"
                  data-testid="input-edit-businessname"
                />
              </div>
              <div>
                <Label className="text-[11px]">Owner Name</Label>
                <Input
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                  className="h-7 text-xs"
                  data-testid="input-edit-ownername"
                />
              </div>
              <div>
                <Label className="text-[11px]">Business Type</Label>
                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-edit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Retail">Retail</SelectItem>
                    <SelectItem value="Wholesale">Wholesale</SelectItem>
                    <SelectItem value="Distributor">Distributor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-[11px] font-medium text-slate-500 border-b py-0.5">Account Settings</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
              <div>
                <Label className="text-[11px]">Username</Label>
                <Input value={formData.username} className="h-7 text-xs bg-muted" readOnly data-testid="input-edit-username" />
              </div>
              <div>
                <Label className="text-[11px]">Account Manager</Label>
                <Select value={formData.accountManagerId || 'none'} onValueChange={(value) => setFormData({ ...formData, accountManagerId: value === 'none' ? '' : value })}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-edit-account-manager">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {accountManagers.map((am) => (
                      <SelectItem key={am.id} value={String(am.id)}>{am.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Suspended">Suspended</SelectItem>
                    <SelectItem value="On-Hold">On-Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Currency</Label>
                <Select value={formData.preferredCurrency} onValueChange={(value) => setFormData({ ...formData, preferredCurrency: value })}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-edit-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.length > 0 ? currencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                    )) : (
                      <>
                        <SelectItem value="USD">$ USD</SelectItem>
                        <SelectItem value="EUR">€ EUR</SelectItem>
                        <SelectItem value="AED">د.إ AED</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-[11px] font-medium text-slate-500 border-b py-0.5">Contact Information</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
              <div>
                <Label className="text-[11px]">Primary Contact</Label>
                <Input
                  value={formData.primaryContactName}
                  onChange={(e) => setFormData({ ...formData, primaryContactName: e.target.value })}
                  className="h-7 text-xs"
                  data-testid="input-edit-primarycontactname"
                />
              </div>
              <div>
                <Label className="text-[11px]">Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="h-7 text-xs"
                  data-testid="input-edit-email"
                />
              </div>
              <div>
                <Label className="text-[11px]">Phone</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: keepDigitsOnly(e.target.value) })}
                  className="h-7 text-xs"
                  data-testid="input-edit-phone"
                />
              </div>
              <div>
                <Label className="text-[11px]">Tax/VAT Number *</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formData.taxVatNumber}
                  onChange={(e) => setFormData({ ...formData, taxVatNumber: keepDigitsOnly(e.target.value) })}
                  className="h-7 text-xs"
                  data-testid="input-edit-taxvatnumber"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
              <div>
                <Label className="text-[11px]">Tax Rate (%) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={formData.taxRate}
                  onKeyDown={(e) => {
                    if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                  }}
                  onChange={(e) => setFormData({ ...formData, taxRate: keepDecimalOnly(e.target.value) })}
                  placeholder="e.g. 5"
                  className="h-7 text-xs"
                  data-testid="input-edit-taxrate"
                />
              </div>
              <div>
                <Label className="text-[11px]">Credit Limit</Label>
                <Input
                  type="number"
                  value={formData.creditLimit}
                  onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                  className="h-7 text-xs"
                  data-testid="input-edit-creditlimit"
                />
              </div>
              <div className="flex items-center gap-1.5 pt-1.5">
                <input
                  type="checkbox"
                  id="allowPreOrders"
                  checked={formData.allowPreOrders}
                  onChange={(e) => setFormData({ ...formData, allowPreOrders: e.target.checked })}
                  className="h-3.5 w-3.5"
                  data-testid="checkbox-edit-allow-preorders"
                />
                <Label htmlFor="allowPreOrders" className="text-[11px] cursor-pointer">Allow Pre-Orders</Label>
              </div>
            </div>

            <div className="text-[11px] font-medium text-slate-500 border-b py-0.5">Billing Address</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              <div>
                <Label className="text-[11px]">Address Line 1</Label>
                <Input
                  value={formData.billingAddress.line1}
                  onChange={(e) => setFormData({ ...formData, billingAddress: { ...formData.billingAddress, line1: e.target.value } })}
                  className="h-7 text-xs"
                  data-testid="input-edit-billing-line1"
                />
              </div>
              <div>
                <Label className="text-[11px]">Address Line 2</Label>
                <Input
                  value={formData.billingAddress.line2}
                  onChange={(e) => setFormData({ ...formData, billingAddress: { ...formData.billingAddress, line2: e.target.value } })}
                  className="h-7 text-xs"
                  data-testid="input-edit-billing-line2"
                />
              </div>
              <div>
                <Label className="text-[11px]">City</Label>
                <Input
                  value={formData.billingAddress.city}
                  onChange={(e) => setFormData({ ...formData, billingAddress: { ...formData.billingAddress, city: e.target.value } })}
                  className="h-7 text-xs"
                  data-testid="input-edit-billing-city"
                />
              </div>
              <div>
                <Label className="text-[11px]">State</Label>
                <Input
                  value={formData.billingAddress.state}
                  onChange={(e) => setFormData({ ...formData, billingAddress: { ...formData.billingAddress, state: e.target.value } })}
                  className="h-7 text-xs"
                  data-testid="input-edit-billing-state"
                />
              </div>
              <div>
                <Label className="text-[11px]">Postal Code</Label>
                <Input
                  value={formData.billingAddress.postalCode}
                  onChange={(e) => setFormData({ ...formData, billingAddress: { ...formData.billingAddress, postalCode: e.target.value } })}
                  className="h-7 text-xs"
                  data-testid="input-edit-billing-postalcode"
                />
              </div>
              <div>
                <Label className="text-[11px]">Country</Label>
                <Input
                  value={formData.billingAddress.country}
                  onChange={(e) => setFormData({ ...formData, billingAddress: { ...formData.billingAddress, country: e.target.value } })}
                  className="h-7 text-xs"
                  data-testid="input-edit-billing-country"
                />
              </div>
            </div>

            <div className="text-[11px] font-medium text-slate-500 border-b py-0.5">Documents</div>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="border rounded p-1.5 text-center">
                {formData.tradeLicensePhotoUrl ? (
                  <img src={formData.tradeLicensePhotoUrl} alt="Trade License" className="h-12 mx-auto object-contain rounded" />
                ) : (
                  <button
                    type="button"
                    className="h-12 w-full flex flex-col items-center justify-center text-[10px] text-slate-500 hover:bg-slate-50 rounded"
                    onClick={() => tradeLicenseInputRef.current?.click()}
                    disabled={uploadingDocument === 'tradeLicense'}
                  >
                    <Upload className="h-3.5 w-3.5 mb-0.5 text-slate-400" />
                    Click to upload
                  </button>
                )}
                <p className="text-[10px] text-slate-500 mt-0.5">Trade License</p>
                <div className="mt-1 flex items-center justify-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-[10px]"
                    onClick={() => setDocumentPreview({ open: true, title: 'Trade License', url: formData.tradeLicensePhotoUrl })}
                    disabled={!formData.tradeLicensePhotoUrl}
                  >
                    <Eye className="h-3 w-3 mr-0.5" />
                    Review
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-[10px]"
                    onClick={() => handleDeleteDocument('tradeLicense')}
                    disabled={!formData.tradeLicensePhotoUrl}
                  >
                    <Trash2 className="h-3 w-3 mr-0.5" />
                    Delete
                  </Button>
                </div>
                <input
                  ref={tradeLicenseInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUploadSingleDocument('tradeLicense', e)}
                />
              </div>
              <div className="border rounded p-1.5 text-center">
                {formData.idPhotoUrl ? (
                  <img src={formData.idPhotoUrl} alt="ID" className="h-12 mx-auto object-contain rounded" />
                ) : (
                  <button
                    type="button"
                    className="h-12 w-full flex flex-col items-center justify-center text-[10px] text-slate-500 hover:bg-slate-50 rounded"
                    onClick={() => idPhotoInputRef.current?.click()}
                    disabled={uploadingDocument === 'id'}
                  >
                    <Upload className="h-3.5 w-3.5 mb-0.5 text-slate-400" />
                    Click to upload
                  </button>
                )}
                <p className="text-[10px] text-slate-500 mt-0.5">ID Photo</p>
                <div className="mt-1 flex items-center justify-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-[10px]"
                    onClick={() => setDocumentPreview({ open: true, title: 'ID Photo', url: formData.idPhotoUrl })}
                    disabled={!formData.idPhotoUrl}
                  >
                    <Eye className="h-3 w-3 mr-0.5" />
                    Review
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-[10px]"
                    onClick={() => handleDeleteDocument('id')}
                    disabled={!formData.idPhotoUrl}
                  >
                    <Trash2 className="h-3 w-3 mr-0.5" />
                    Delete
                  </Button>
                </div>
                <input
                  ref={idPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUploadSingleDocument('id', e)}
                />
              </div>
              <div className="border rounded p-1.5 text-center">
                {formData.storePhotoUrls?.length > 0 ? (
                  <div className="h-12 flex items-center justify-center gap-0.5">
                    {formData.storePhotoUrls.slice(0, 2).map((url, i) => (
                      <button
                        key={`${url}-${i}`}
                        type="button"
                        className="relative"
                        onClick={() => setDocumentPreview({ open: true, title: `Store Photo ${i + 1}`, url })}
                      >
                        <img src={url} alt={`Store ${i + 1}`} className="h-10 w-10 object-cover rounded" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="h-12 w-full flex flex-col items-center justify-center text-[10px] text-slate-500 hover:bg-slate-50 rounded"
                    onClick={() => storePhotosInputRef.current?.click()}
                    disabled={uploadingDocument === 'store'}
                  >
                    <Plus className="h-3.5 w-3.5 mb-0.5 text-slate-400" />
                    Add photos
                  </button>
                )}
                <p className="text-[10px] text-slate-500 mt-0.5">Store ({formData.storePhotoUrls?.length || 0})</p>
                <div className="mt-1 flex items-center justify-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-[10px]"
                    onClick={() => storePhotosInputRef.current?.click()}
                    disabled={uploadingDocument === 'store'}
                  >
                    <Plus className="h-3 w-3 mr-0.5" />
                    Upload
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-[10px]"
                    onClick={() => setDocumentPreview({ open: true, title: 'Store Photos', url: formData.storePhotoUrls[0] || '' })}
                    disabled={!formData.storePhotoUrls?.length}
                  >
                    <Eye className="h-3 w-3 mr-0.5" />
                    Review
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-[10px]"
                    onClick={() => handleRemoveStorePhoto(formData.storePhotoUrls.length - 1)}
                    disabled={!formData.storePhotoUrls?.length}
                  >
                    <Trash2 className="h-3 w-3 mr-0.5" />
                    Delete
                  </Button>
                </div>
                <input
                  ref={storePhotosInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleAddStorePhotos}
                />
              </div>
            </div>

            {formData.shippingAddresses && formData.shippingAddresses.length > 0 && (
              <>
                <div className="text-[11px] font-medium text-slate-500 border-b py-0.5">Shipping Addresses ({formData.shippingAddresses.length})</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {formData.shippingAddresses.map((addr, idx) => (
                    <div key={idx} className="border rounded p-1.5 text-[11px] leading-snug">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{addr.label || `Address ${idx + 1}`}</span>
                        {addr.isDefault && <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded">Default</span>}
                      </div>
                      <p className="text-slate-600">{addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}</p>
                      <p className="text-slate-600">{addr.city}{addr.state ? `, ${addr.state}` : ''} {addr.postalCode}</p>
                      <p className="text-slate-600">{addr.country}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="text-[11px] font-medium text-slate-500 border-b py-0.5">Settings</div>
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <Label className="text-[11px]">Credit Limit</Label>
                <Input
                  type="number"
                  value={formData.creditLimit}
                  onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                  className="h-7 text-xs"
                  data-testid="input-edit-creditlimit"
                />
              </div>
              <div className="flex items-center gap-1.5 pt-1.5">
                <input
                  type="checkbox"
                  id="allow-pre-orders-settings"
                  checked={formData.allowPreOrders}
                  onChange={(e) => setFormData({ ...formData, allowPreOrders: e.target.checked })}
                  className="h-3.5 w-3.5"
                  data-testid="checkbox-allow-pre-orders"
                />
                <Label htmlFor="allow-pre-orders-settings" className="text-[11px]">Allow Pre-Orders</Label>
              </div>
            </div>
            
            <div>
              <Label className="text-[11px]">Notes</Label>
              <textarea
                className="w-full h-12 p-1.5 border rounded-md resize-none text-xs"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                data-testid="textarea-edit-notes"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-1.5 pt-2 border-t">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs" onClick={handleSaveUser} disabled={updateUserMutation.isPending} data-testid="button-save-user">
              {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={documentPreview.open}
        onOpenChange={(open) =>
          setDocumentPreview((prev) => ({
            ...prev,
            open,
          }))
        }
      >
        <DialogContent className="max-w-3xl p-3">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-sm">{documentPreview.title || 'Document Preview'}</DialogTitle>
            <DialogDescription className="text-xs">
              Click outside this window or press Escape to close.
            </DialogDescription>
          </DialogHeader>
          {documentPreview.url ? (
            <div className="max-h-[70vh] overflow-auto rounded border bg-slate-50 p-2">
              <img
                src={documentPreview.url}
                alt={documentPreview.title || 'Document'}
                className="mx-auto max-h-[65vh] w-auto rounded object-contain"
              />
            </div>
          ) : (
            <p className="text-xs text-slate-500">No document available for preview.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-md gap-2 p-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-1.5 text-sm">
              <KeyRound className="h-4 w-4 shrink-0" />
              Reset Password
            </DialogTitle>
            <DialogDescription className="text-xs">
              Set a new password for {selectedUser?.displayName || selectedUser?.username}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 py-1">
            <div className="space-y-1">
              <Label htmlFor="newPassword" className="text-xs">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="h-9 pr-9 text-sm"
                  data-testid="input-new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0.5 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
          
          <DialogFooter className="gap-1.5 sm:gap-1.5">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPasswordDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              size="sm"
              className="h-8 text-xs"
              onClick={handleResetPassword}
              disabled={!newPassword || resetPasswordMutation.isPending}
              data-testid="button-confirm-reset-password"
            >
              {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedUser?.displayName || selectedUser?.username}? 
              This will permanently remove their account and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedUser && deleteUserMutation.mutate(selectedUser.id)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              {deleteUserMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
