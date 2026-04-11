import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Users, 
  Plus, 
  Trash2, 
  Edit2, 
  Shield, 
  DollarSign, 
  ShoppingBag,
  UserCog,
  Warehouse,
  Crown,
  RefreshCw,
  Search,
  Filter,
  X,
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

interface StaffUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  role: string;
  createdAt: string;
}

const ROLE_CONFIG: Record<string, { label: string; icon: any; color: string; description: string }> = {
  admin: { 
    label: 'Admin', 
    icon: Crown, 
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    description: 'Full system access. Final approval in order workflow.'
  },
  sales: { 
    label: 'Sales', 
    icon: ShoppingBag, 
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    description: 'First approval stage for orders. Can view and approve/reject orders.'
  },
  finance: { 
    label: 'Finance', 
    icon: DollarSign, 
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    description: 'Second approval stage. Reviews orders after Sales approval.'
  },
  account_manager: { 
    label: 'Account Manager', 
    icon: UserCog, 
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    description: 'Manages customer accounts and relationships.'
  },
  warehouse: { 
    label: 'Warehouse', 
    icon: Warehouse, 
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    description: 'Handles inventory and order fulfillment.'
  },
};

const STAFF_ROLE_FILTERS = ['admin', 'sales', 'finance', 'account_manager', 'warehouse'] as const;
type StaffRoleFilter = (typeof STAFF_ROLE_FILTERS)[number];

export default function UserRolesPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  
  const [roleFilter, setRoleFilter] = useState<'all' | StaffRoleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null);
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    displayName: '',
    email: '',
    role: 'sales',
  });

  const { data: users = [], isLoading } = useQuery<StaffUser[]>({
    queryKey: ['/api/admin/users'],
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest('/api/admin/users', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setCreateDialogOpen(false);
      resetForm();
      toast({
        title: "User Created",
        description: "The staff user has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create User",
        description: error.message || "Could not create the user.",
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: Partial<typeof formData> }) => {
      return await apiRequest(`/api/admin/users/${userId}`, 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setEditDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "User Updated",
        description: "The user has been updated successfully.",
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

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/admin/users/${userId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setDeleteDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "User Deleted",
        description: "The user has been deleted.",
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

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      displayName: '',
      email: '',
      role: 'sales',
    });
  };

  const handleCreateUser = () => {
    if (!formData.username || !formData.password || !formData.role) {
      toast({
        title: "Missing Fields",
        description: "Username, password, and role are required.",
        variant: "destructive",
      });
      return;
    }
    createUserMutation.mutate(formData);
  };

  const handleEditUser = () => {
    if (!selectedUser) return;
    updateUserMutation.mutate({
      userId: selectedUser.id,
      data: {
        displayName: formData.displayName,
        email: formData.email,
        role: formData.role,
      },
    });
  };

  const openEditDialog = (user: StaffUser) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      password: '',
      displayName: user.displayName || '',
      email: user.email || '',
      role: user.role,
    });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (user: StaffUser) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const getRoleConfig = (role: string) => {
    return ROLE_CONFIG[role] || { 
      label: role, 
      icon: Shield, 
      color: 'bg-gray-100 text-gray-800',
      description: 'Unknown role'
    };
  };

  const roleCounts = useMemo(() => {
    const counts: Record<'all' | StaffRoleFilter, number> = {
      all: users.length,
      admin: 0,
      sales: 0,
      finance: 0,
      account_manager: 0,
      warehouse: 0,
    };
    users.forEach((u) => {
      if (STAFF_ROLE_FILTERS.includes(u.role as StaffRoleFilter)) {
        counts[u.role as StaffRoleFilter]++;
      }
    });
    return counts;
  }, [users]);

  const filteredUsers = useMemo(() => {
    let list = roleFilter === 'all' ? users : users.filter((u) => u.role === roleFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          (u.displayName?.toLowerCase().includes(q) ?? false) ||
          (u.email?.toLowerCase().includes(q) ?? false)
      );
    }
    return list;
  }, [users, roleFilter, searchQuery]);

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 dark:from-slate-900 dark:via-gray-900 dark:to-slate-800 p-3 sm:p-4 lg:p-5"
      data-testid="page-user-roles"
    >
      <div className="max-w-7xl mx-auto space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h1
              className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"
              data-testid="text-page-title"
            >
              <Users className="h-6 w-6 text-blue-600 shrink-0" />
              User Roles Management
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm mt-0.5 leading-tight">
              Manage staff accounts and their roles in the approval workflow
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <Button
              size="sm"
              className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs"
              onClick={() => {
                resetForm();
                setCreateDialogOpen(true);
              }}
              data-testid="button-create-user"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Staff User
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="py-2 px-3 sm:px-4 space-y-0">
            <div className="flex flex-col gap-1.5">
              <div>
                <CardTitle className="text-sm font-semibold leading-tight tracking-tight">
                  Staff Users
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 dark:text-slate-400 pt-0.5">
                  Users with administrative access to the system
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-1 sm:min-w-0">
                  <button
                    type="button"
                    onClick={() => setRoleFilter('all')}
                    data-testid="staff-filter-all"
                    className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-left transition-all ${
                      roleFilter === 'all'
                        ? 'border-blue-400 bg-blue-50/80 ring-2 ring-blue-500 dark:bg-blue-950/40'
                        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="text-[10px] font-medium leading-none text-slate-600 dark:text-slate-300">
                      All Users
                    </span>
                    <span className="text-xs font-bold tabular-nums leading-none text-slate-900 dark:text-white">
                      {roleCounts.all}
                    </span>
                  </button>
                  {STAFF_ROLE_FILTERS.map((key) => {
                    const cfg = ROLE_CONFIG[key];
                    const Icon = cfg.icon;
                    const selected = roleFilter === key;
                    const ring =
                      key === 'admin'
                        ? 'border-purple-400 bg-purple-50/80 ring-2 ring-purple-500 dark:bg-purple-950/40'
                        : key === 'sales'
                          ? 'border-green-400 bg-green-50/80 ring-2 ring-green-500 dark:bg-green-950/40'
                          : key === 'finance'
                            ? 'border-emerald-400 bg-emerald-50/80 ring-2 ring-emerald-500 dark:bg-emerald-950/40'
                            : key === 'account_manager'
                              ? 'border-red-400 bg-red-50/80 ring-2 ring-red-500 dark:bg-red-950/40'
                              : 'border-slate-400 bg-slate-50/80 ring-2 ring-slate-500 dark:bg-slate-900/40';
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setRoleFilter(key)}
                        data-testid={`staff-filter-${key}`}
                        className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-left transition-all ${
                          selected ? ring : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                        <span className="text-[10px] font-medium leading-none text-slate-600 dark:text-slate-300">
                          {cfg.label}
                        </span>
                        <span className="text-xs font-bold tabular-nums leading-none text-slate-900 dark:text-white">
                          {roleCounts[key]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:max-w-md sm:flex-row sm:shrink-0">
                  <div className="relative min-w-0 flex-1 sm:w-56">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Search staff..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 pl-9 text-xs"
                      data-testid="input-staff-search"
                    />
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-0.5 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                        onClick={() => setSearchQuery('')}
                        data-testid="button-clear-staff-search"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Select
                    value={roleFilter}
                    onValueChange={(v) => setRoleFilter(v as 'all' | StaffRoleFilter)}
                  >
                    <SelectTrigger className="h-8 w-full text-xs sm:w-40" data-testid="select-staff-role-filter">
                      <Filter className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                      <SelectValue placeholder="Filter role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All roles</SelectItem>
                      {STAFF_ROLE_FILTERS.map((key) => (
                        <SelectItem key={key} value={key}>
                          {ROLE_CONFIG[key].label}
                        </SelectItem>
                      ))}
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
            ) : users.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No staff users found. Use &quot;Add Staff User&quot; to create an account.</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No staff match the current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <Table className="border-collapse text-[9px] leading-tight border border-slate-200 dark:border-slate-700 [&_th]:font-normal [&_td]:font-normal [&_th]:border-r [&_td]:border-r [&_th]:border-slate-200 [&_td]:border-slate-200 dark:[&_th]:border-slate-600 dark:[&_td]:border-slate-600 [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
                  <TableHeader className="bg-slate-100 dark:bg-slate-800 [&_tr]:border-b border-slate-200 dark:border-slate-700">
                    <TableRow className="hover:bg-transparent border-transparent">
                      <TableHead className="h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        Username
                      </TableHead>
                      <TableHead className="h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        Display Name
                      </TableHead>
                      <TableHead className="h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        Email
                      </TableHead>
                      <TableHead className="h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        Role
                      </TableHead>
                      <TableHead className="h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        Created
                      </TableHead>
                      <TableHead className="text-right h-9 px-2 text-[9px] font-normal text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => {
                      const config = getRoleConfig(user.role);
                      const IconComponent = config.icon;
                      const isCurrentUser = currentUser?.id === user.id;

                      return (
                        <TableRow
                          key={user.id}
                          data-testid={`row-user-${user.id}`}
                          className="[&>td]:py-1 text-[9px] font-normal"
                        >
                          <TableCell className="px-2 py-1 text-[9px] font-normal text-slate-700 dark:text-slate-300 max-w-[10rem] truncate">
                            {user.username}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-[9px] font-normal text-slate-700 dark:text-slate-300 max-w-[10rem] truncate">
                            {user.displayName || '-'}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-[9px] font-normal text-slate-700 dark:text-slate-300 max-w-[14rem] truncate">
                            {user.email || '-'}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-[9px] font-normal text-slate-700 dark:text-slate-300">
                            <Badge
                              className={`${config.color} px-1.5 py-0 text-[9px] font-normal gap-0.5 leading-none rounded-sm`}
                            >
                              <IconComponent className="w-2 h-2 shrink-0" />
                              {config.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-2 py-1 text-[9px] font-normal text-slate-700 dark:text-slate-300 tabular-nums">
                            {new Date(user.createdAt).toLocaleDateString()}
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
                                onClick={() => openDeleteDialog(user)}
                                disabled={isCurrentUser}
                                className={`h-6 w-6 p-0 ${isCurrentUser ? 'opacity-50' : 'text-red-600 hover:text-red-700 hover:bg-red-50'}`}
                                data-testid={`button-delete-${user.id}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto gap-2 p-4 sm:max-w-md">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base">Create Staff User</DialogTitle>
            <DialogDescription className="text-xs">
              Add a new user with a specific role in the approval workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 py-1">
            <div className="space-y-1">
              <Label htmlFor="username" className="text-xs">Username *</Label>
              <Input
                id="username"
                className="h-8 text-sm"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="Enter username"
                data-testid="input-username"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password" className="text-xs">Password *</Label>
              <Input
                id="password"
                className="h-8 text-sm"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Enter password"
                data-testid="input-password"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="displayName" className="text-xs">Display Name</Label>
              <Input
                id="displayName"
                className="h-8 text-sm"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                placeholder="Enter display name"
                data-testid="input-display-name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <Input
                id="email"
                className="h-8 text-sm"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter email"
                data-testid="input-email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="role" className="text-xs">Role *</Label>
              <Select 
                value={formData.role} 
                onValueChange={(value) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger data-testid="select-role" className="h-8 text-sm">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <config.icon className="w-4 h-4" />
                        {config.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.role && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {ROLE_CONFIG[formData.role]?.description}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 pt-1">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              size="sm"
              className="h-8 text-xs"
              onClick={handleCreateUser}
              disabled={createUserMutation.isPending}
              data-testid="button-confirm-create"
            >
              {createUserMutation.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto gap-2 p-4 sm:max-w-md">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base">Edit User</DialogTitle>
            <DialogDescription className="text-xs">
              Update user information and role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 py-1">
            <div className="space-y-1">
              <Label className="text-xs">Username</Label>
              <Input value={formData.username} disabled className="bg-muted h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="editDisplayName" className="text-xs">Display Name</Label>
              <Input
                id="editDisplayName"
                className="h-8 text-sm"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                placeholder="Enter display name"
                data-testid="input-edit-display-name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="editEmail" className="text-xs">Email</Label>
              <Input
                id="editEmail"
                className="h-8 text-sm"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter email"
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="editRole" className="text-xs">Role</Label>
              <Select 
                value={formData.role} 
                onValueChange={(value) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger data-testid="select-edit-role" className="h-8 text-sm">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <config.icon className="w-4 h-4" />
                        {config.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 pt-1">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              size="sm"
              className="h-8 text-xs"
              onClick={handleEditUser}
              disabled={updateUserMutation.isPending}
              data-testid="button-confirm-edit"
            >
              {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="gap-2 p-4">
          <AlertDialogHeader className="space-y-1">
            <AlertDialogTitle className="text-base">Delete User</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-snug">
              Are you sure you want to delete &quot;{selectedUser?.displayName || selectedUser?.username}&quot;? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="h-8 text-xs mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedUser && deleteUserMutation.mutate(selectedUser.id)}
              className="bg-red-500 hover:bg-red-600 h-8 text-xs"
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
