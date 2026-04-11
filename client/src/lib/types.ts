export interface FilterState {
  categories: string[];
  brands: string[];
  collections: string[];
  minPrice?: number;
  maxPrice?: number;
  sizes: string[];
  search: string;
  colors?: string[];
  models?: string[];
  styles?: string[];
  ageRanges?: string[];
  occasions?: string[];
  genders?: string[];
  supplierLocations?: string[];
  // Three-layer category system
  mainCategories?: string[];
  kidsGenders?: string[];
  kidsAgeGroups?: string[];
  // Division/Department filter
  divisions?: string[];
}

export interface CartSelection {
  size: string;
  quantity: number;
}

export interface CartBatch {
  name: string;
  items: {
    productId: string;
    selections: CartSelection[];
  }[];
}

export interface OrderSummary {
  subtotal: number;
  discount: number;
  total: number;
  totalPairs: number;
}
