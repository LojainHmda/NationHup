import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClipboardList } from "lucide-react";
import { format } from "date-fns";

interface StockBatch {
  id: string;
  fileName: string;
  status: string;
  processingStartedAt: string;
  processingCompletedAt?: string;
  totalRecords?: number;
  processedRecords?: number;
  errorRecords?: number;
  notes?: string;
  createdAt: string;
}

export default function StockBatchesPage() {
  // Fetch stock batches
  const { data: stockBatches = [], isLoading } = useQuery<StockBatch[]>({
    queryKey: ["/api/stock/batches"],
  });

  return (
    <>
      <div className="p-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <ClipboardList className="w-8 h-8 text-blue-600" />
              Stock Batches
            </h1>
            <p className="text-muted-foreground mt-2">
              View history of stock upload batches and their processing status
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Batch History</CardTitle>
              <CardDescription>
                All stock import batches and their processing status
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-muted-foreground">Loading batches...</div>
                </div>
              ) : stockBatches.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ClipboardList className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No batches found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload stock files to see batch history here
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Total Records</TableHead>
                        <TableHead>Processed</TableHead>
                        <TableHead>Errors</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead>Completed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockBatches.map((batch) => (
                        <TableRow key={batch.id}>
                          <TableCell className="font-medium">{batch.fileName}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                batch.status === 'completed' ? 'default' :
                                batch.status === 'processing' ? 'secondary' :
                                batch.status === 'failed' ? 'destructive' : 'outline'
                              }
                            >
                              {batch.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{batch.totalRecords || 0}</TableCell>
                          <TableCell>{batch.processedRecords || 0}</TableCell>
                          <TableCell>
                            {batch.errorRecords ? (
                              <span className="text-red-600 font-semibold">{batch.errorRecords}</span>
                            ) : (
                              0
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(batch.processingStartedAt), "MMM d, yyyy HH:mm")}
                          </TableCell>
                          <TableCell className="text-sm">
                            {batch.processingCompletedAt 
                              ? format(new Date(batch.processingCompletedAt), "MMM d, yyyy HH:mm")
                              : '-'
                            }
                          </TableCell>
                        </TableRow>
                      ))}
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
