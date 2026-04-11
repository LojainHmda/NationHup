import { HierarchicalAdminPanel } from "@/components/HierarchicalAdminPanel";

export default function AdminPage() {
  return (
    <>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="heading-admin">Wholesale Catalog Management</h1>
          <p className="text-muted-foreground" data-testid="text-admin-description">
            Organize your product hierarchy for efficient bulk ordering and wholesale operations
          </p>
        </div>

        <HierarchicalAdminPanel />
      </div>
    </>
  );
}