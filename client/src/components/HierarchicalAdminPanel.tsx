import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  X, 
  ChevronRight, 
  Building2, 
  Package, 
  Award,
  Warehouse,
  TrendingUp,
  Users
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Brand, Category, Collection, InsertBrand, InsertCategory, InsertCollection } from "@shared/schema";

interface HierarchyViewProps {
  categories: Category[];
  collections: Collection[];
  brands: Brand[];
  onEdit: (type: 'category' | 'collection' | 'brand', item: any) => void;
  onDelete: (type: 'category' | 'collection' | 'brand', id: string) => void;
}

function HierarchyView({ categories, collections, brands, onEdit, onDelete }: HierarchyViewProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const getCollectionsByCategory = (categoryId: string) => {
    return collections.filter(c => c.categoryId === categoryId);
  };

  const getBrandsByCollection = (collectionId: string) => {
    return brands.filter(b => b.collectionId === collectionId);
  };

  const getUnassignedBrands = () => {
    return brands.filter(b => !b.collectionId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Building2 className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Wholesale Catalog Hierarchy</h2>
        </div>
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <Warehouse className="w-4 h-4" />
          <span>Organize for bulk ordering efficiency</span>
        </div>
      </div>

      {/* Hierarchy Tree */}
      <div className="space-y-3">
        {categories.map((category) => {
          const categoryCollections = getCollectionsByCategory(category.id);
          const isExpanded = expandedCategories.has(category.id);

          return (
            <Card key={category.id} className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                {/* Category Level */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCategory(category.id)}
                      className="p-1 h-auto"
                    >
                      <ChevronRight 
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                      />
                    </Button>
                    <Package className="w-5 h-5 text-blue-600" />
                    <div>
                      <h3 className="font-semibold text-lg">{category.name}</h3>
                      <p className="text-sm text-muted-foreground">{category.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={category.isActive ? "default" : "secondary"}>
                      {category.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant="outline">Collections: {categoryCollections.length}</Badge>
                    <Button size="sm" variant="outline" onClick={() => onEdit('category', category)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => onDelete('category', category.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Collections Level */}
                {isExpanded && (
                  <div className="ml-8 mt-4 space-y-3">
                    {categoryCollections.map((collection) => {
                      const collectionBrands = getBrandsByCollection(collection.id);
                      
                      return (
                        <Card key={collection.id} className="border-l-4 border-l-green-500 bg-muted/20">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <Award className="w-4 h-4 text-green-600" />
                                <div>
                                  <h4 className="font-medium">{collection.name}</h4>
                                  <p className="text-xs text-muted-foreground">{collection.description}</p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Badge variant={collection.isActive ? "default" : "secondary"} className="text-xs">
                                  {collection.isActive ? "Active" : "Inactive"}
                                </Badge>
                                <Badge variant="outline" className="text-xs">Brands: {collectionBrands.length}</Badge>
                                <Button size="sm" variant="outline" onClick={() => onEdit('collection', collection)}>
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => onDelete('collection', collection.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>

                            {/* Brands Level */}
                            {collectionBrands.length > 0 && (
                              <div className="ml-6 mt-3 space-y-2">
                                {collectionBrands.map((brand) => (
                                  <div key={brand.id} className="flex items-center justify-between p-2 bg-background rounded border">
                                    <div className="flex items-center space-x-3">
                                      <TrendingUp className="w-3 h-3 text-red-600" />
                                      {brand.logoUrl && (
                                        <img src={brand.logoUrl} alt={brand.name} className="w-6 h-6 object-contain" />
                                      )}
                                      <div>
                                        <span className="font-medium text-sm">{brand.name}</span>
                                        <p className="text-xs text-muted-foreground">{brand.description}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Badge variant={brand.isActive ? "default" : "secondary"} className="text-xs">
                                        {brand.isActive ? "Active" : "Inactive"}
                                      </Badge>
                                      <Badge variant="outline" className="text-xs">Priority: {brand.priority}</Badge>
                                      <Button size="sm" variant="outline" onClick={() => onEdit('brand', brand)}>
                                        <Edit className="w-3 h-3" />
                                      </Button>
                                      <Button size="sm" variant="destructive" onClick={() => onDelete('brand', brand.id)}>
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Unassigned Brands */}
        {getUnassignedBrands().length > 0 && (
          <Card className="border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/20">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3 mb-3">
                <Users className="w-5 h-5 text-red-600" />
                <h3 className="font-semibold">Unassigned Brands</h3>
                <Badge variant="outline">Needs Collection Assignment</Badge>
              </div>
              <div className="space-y-2">
                {getUnassignedBrands().map((brand) => (
                  <div key={brand.id} className="flex items-center justify-between p-2 bg-background rounded border">
                    <div className="flex items-center space-x-3">
                      {brand.logoUrl && (
                        <img src={brand.logoUrl} alt={brand.name} className="w-6 h-6 object-contain" />
                      )}
                      <span className="font-medium">{brand.name}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="outline" onClick={() => onEdit('brand', brand)}>
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => onDelete('brand', brand.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export function HierarchicalAdminPanel() {
  const { toast } = useToast();
  const [activeForm, setActiveForm] = useState<'category' | 'collection' | 'brand' | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Fetch data
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"] });
  const { data: collections = [] } = useQuery<Collection[]>({ queryKey: ["/api/collections"] });
  const { data: brands = [] } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });

  // Quick actions for wholesale setup
  const QuickActions = () => (
    <Card className="bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <span>Wholesale Quick Setup</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <Button onClick={() => setActiveForm('category')} className="h-20 flex-col space-y-2">
            <Package className="w-6 h-6" />
            <span>Add Category</span>
          </Button>
          <Button onClick={() => setActiveForm('collection')} variant="outline" className="h-20 flex-col space-y-2">
            <Award className="w-6 h-6" />
            <span>Add Collection</span>
          </Button>
          <Button onClick={() => setActiveForm('brand')} variant="outline" className="h-20 flex-col space-y-2">
            <TrendingUp className="w-6 h-6" />
            <span>Add Brand</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const handleEdit = (type: 'category' | 'collection' | 'brand', item: any) => {
    setActiveForm(type);
    setEditingItem(item);
  };

  const handleDelete = (type: 'category' | 'collection' | 'brand', id: string) => {
    // Handle deletion with confirmation
    console.log(`Delete ${type} with id: ${id}`);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <QuickActions />
      
      <HierarchyView 
        categories={categories as Category[]}
        collections={collections as Collection[]}
        brands={brands as Brand[]}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Forms will be added here based on activeForm state */}
    </div>
  );
}