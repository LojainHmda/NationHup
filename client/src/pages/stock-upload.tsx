import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { PreOrderUploadV2 } from "@/components/PreOrderUploadV2";

const uploadCardClassName =
  "cursor-pointer border border-border bg-card shadow-sm transition-colors hover:bg-muted/50 hover:border-muted-foreground/25";

type UploadType = "stock" | "preorder" | null;

export default function StockUploadPage() {
  const [selectedType, setSelectedType] = useState<UploadType>(null);

  if (selectedType === "stock" || selectedType === "preorder") {
    return (
      <div className="min-h-screen bg-background">
        <div className="p-6">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setSelectedType(null)}
              className="gap-2 text-muted-foreground hover:text-foreground"
              data-testid="button-back-to-selection"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Upload Type Selection
            </Button>
          </div>
          <PreOrderUploadV2 uploadType={selectedType} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full flex flex-col justify-center bg-background p-6 box-border">
      <div className="max-w-4xl mx-auto w-full">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">Upload Products</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Choose how you want to add products to your inventory. Select the upload type that matches your product source.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card
            className={uploadCardClassName}
            onClick={() => setSelectedType("stock")}
            data-testid="card-stock-upload"
          >
            <CardHeader className="pb-3 text-center items-center">
              <CardTitle className="text-xl text-foreground">Stock Upload</CardTitle>
              <CardDescription>In-warehouse products</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pt-0 pb-6">
              <Button className="gap-2" data-testid="button-select-stock">
                Select Stock Upload
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>

          <Card
            className={uploadCardClassName}
            onClick={() => setSelectedType("preorder")}
            data-testid="card-preorder-upload"
          >
            <CardHeader className="pb-3 text-center items-center">
              <CardTitle className="text-xl text-foreground">Pre-Order Upload</CardTitle>
              <CardDescription>Upcoming collections</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pt-0 pb-6">
              <Button className="gap-2" data-testid="button-select-preorder">
                Select Pre-Order Upload
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Both upload types support Excel files with embedded images, column mapping, and batch processing.</p>
        </div>
      </div>
    </div>
  );
}
