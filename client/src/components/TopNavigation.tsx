import { ShoppingCart } from "lucide-react";

export function TopNavigation() {
  return (
    <header className="bg-white/90 dark:bg-slate-800/95 border-b border-slate-200 dark:border-slate-700 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex items-center justify-end gap-3">
          <button className="relative p-2 rounded-xl transition-all bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600" data-testid="button-cart">
            <ShoppingCart className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-xl transition-all bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600" data-testid="button-language">
            <span className="text-sm font-semibold">EN</span>
          </button>
        </div>
      </div>
    </header>
  );
}
