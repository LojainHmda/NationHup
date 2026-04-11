import { PreOrderUploadV2 } from "@/components/PreOrderUploadV2";

export default function AdminCatalogueUploadPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 dark:from-slate-900 dark:via-gray-900 dark:to-slate-800">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Product Catalogue Upload
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Upload products to your catalogue. These products will remain hidden until assigned to a Pre-Order or Stock collection.
          </p>
        </div>
        <PreOrderUploadV2 uploadType="catalogue" />
      </div>
    </div>
  );
}
