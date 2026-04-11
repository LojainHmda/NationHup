import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";

interface StockAdjustment {
  id: string;
  batchId?: string;
  productId: string;
  sku: string;
  color: string;
  size: string;
  previousStock: number;
  newStock: number;
  adjustmentType: string;
  reason?: string;
  notes?: string;
  adjustedBy: string;
  createdAt: string;
}

export default function StockAdjustmentsPage() {
  const [selectedBatch, setSelectedBatch] = useState<string>("all-batches");
  const [selectedProduct, setSelectedProduct] = useState<string>("all-products");

  // Fetch stock adjustments
  const { data: stockAdjustments = [], isLoading } = useQuery<StockAdjustment[]>({
    queryKey: ["/api/stock/adjustments", selectedBatch, selectedProduct],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedBatch && selectedBatch !== "all-batches") {
        params.append("batchId", selectedBatch);
      }
      if (selectedProduct && selectedProduct !== "all-products") {
        params.append("productId", selectedProduct);
      }
      
      const response = await fetch(`/api/stock/adjustments?${params}`);
      if (!response.ok) throw new Error("Failed to fetch adjustments");
      return response.json();
    },
  });

  // Fetch batches for filter
  const { data: stockBatches = [] } = useQuery({
    queryKey: ["/api/stock/batches"],
  });

  // Fetch products for filter
  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
  });

  return (
    <>
      <div className="p-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-blue-600" />
              Stock Adjustments
            </h1>
            <p className="text-muted-foreground mt-2">
              View all stock adjustments and changes over time
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Adjustment History</CardTitle>
              <CardDescription>
                All stock level changes and adjustments
              </CardDescription>
              
              {/* Filters */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <Label className="text-xs text-muted-foreground">Batch</Label>
                  <Select value={selectedBatch} onValueChange={setSelectedBatch}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="All batches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-batches">All batches</SelectItem>
                      {(stockBatches as any[]).map((batch: any) => (
                        <SelectItem key={batch.id} value={batch.id}>
                          {batch.fileName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label className="text-xs text-muted-foreground">Product</Label>
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="All products" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-products">All products</SelectItem>
                      {(products as any[]).map((product: any) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-muted-foreground">Loading adjustments...</div>
                </div>
              ) : stockAdjustments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <TrendingUp className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No adjustments found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Stock adjustments will appear here when stock levels change
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Color</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Previous</TableHead>
                        <TableHead>New</TableHead>
                        <TableHead>Change</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockAdjustments.map((adjustment) => {
                        const diff = adjustment.newStock - adjustment.previousStock;
                        const isIncrease = diff > 0;
                        
                        return (
                          <TableRow key={adjustment.id}>
                            <TableCell className="font-mono text-sm">{adjustment.sku}</TableCell>
                            <TableCell>{adjustment.color}</TableCell>
                            <TableCell>{adjustment.size}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {adjustment.adjustmentType}
                              </Badge>
                            </TableCell>
                            <TableCell>{adjustment.previousStock}</TableCell>
                            <TableCell className="font-semibold">{adjustment.newStock}</TableCell>
                            <TableCell>
                              <div className={`flex items-center gap-1 font-semibold ${
                                isIncrease ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {isIncrease ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                {isIncrease ? '+' : ''}{diff}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {format(new Date(adjustment.createdAt), "MMM d, yyyy HH:mm")}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
    </>
  );
}
