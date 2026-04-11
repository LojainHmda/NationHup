import { useState, useCallback, useEffect } from "react";
import type { FilterState } from "@/lib/types";

const FILTERS_STORAGE_KEY = 'shop_filters';

function getStoredFilters(): FilterState {
  try {
    const stored = sessionStorage.getItem(FILTERS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to parse stored filters:', e);
  }
  return {
    categories: [],
    brands: [],
    collections: [],
    sizes: [],
    search: "",
    colors: [],
    models: [],
    styles: [],
    ageRanges: [],
    occasions: [],
    genders: [],
    supplierLocations: [],
    mainCategories: [],
    kidsGenders: [],
    kidsAgeGroups: [],
    divisions: [],
  };
}

export function useFilters() {
  const [filters, setFilters] = useState<FilterState>(getStoredFilters);

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch (e) {
      console.warn('Failed to save filters:', e);
    }
  }, [filters]);

  const updateFilter = useCallback((key: keyof FilterState, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const toggleArrayFilter = useCallback((key: 'categories' | 'brands' | 'collections' | 'sizes' | 'colors' | 'models' | 'styles' | 'ageRanges' | 'occasions' | 'genders' | 'supplierLocations' | 'mainCategories' | 'kidsGenders' | 'kidsAgeGroups' | 'divisions', value: string) => {
    setFilters(prev => {
      const currentArray = (prev[key] as string[]) || [];
      const newArray = currentArray.includes(value)
        ? currentArray.filter(item => item !== value)
        : [...currentArray, value];
      
      return {
        ...prev,
        [key]: newArray
      };
    });
  }, []);

  const removeFilter = useCallback((key: keyof FilterState, value?: string) => {
    setFilters(prev => {
      if (Array.isArray(prev[key]) && value) {
        return {
          ...prev,
          [key]: (prev[key] as string[]).filter(item => item !== value)
        };
      } else {
        return {
          ...prev,
          [key]: Array.isArray(prev[key]) ? [] : ""
        };
      }
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({
      categories: [],
      brands: [],
      collections: [],
      sizes: [],
      search: "",
      colors: [],
      models: [],
      styles: [],
      ageRanges: [],
      occasions: [],
      genders: [],
      supplierLocations: [],
      mainCategories: [],
      kidsGenders: [],
      kidsAgeGroups: [],
      divisions: [],
    });
  }, []);

  const getActiveFilters = useCallback(() => {
    const active: { key: keyof FilterState; value: string; label: string }[] = [];
    
    filters.categories.forEach(cat => {
      active.push({ key: 'categories', value: cat, label: cat });
    });
    
    filters.brands.forEach(brand => {
      active.push({ key: 'brands', value: brand, label: brand });
    });
    
    if (filters.collections && filters.collections.length > 0) {
      filters.collections.forEach(collection => {
        active.push({ key: 'collections', value: collection, label: collection });
      });
    }
    
    if (filters.colors && filters.colors.length > 0) {
      filters.colors.forEach(color => {
        active.push({ key: 'colors', value: color, label: color });
      });
    }
    
    if (filters.models && filters.models.length > 0) {
      filters.models.forEach(model => {
        active.push({ key: 'models', value: model, label: model });
      });
    }
    
    if (filters.styles && filters.styles.length > 0) {
      filters.styles.forEach(style => {
        active.push({ key: 'styles', value: style, label: style });
      });
    }
    
    if (filters.ageRanges && filters.ageRanges.length > 0) {
      filters.ageRanges.forEach(ageRange => {
        active.push({ key: 'ageRanges', value: ageRange, label: ageRange });
      });
    }
    
    if (filters.occasions && filters.occasions.length > 0) {
      filters.occasions.forEach(occasion => {
        active.push({ key: 'occasions', value: occasion, label: occasion });
      });
    }
    
    if (filters.genders && filters.genders.length > 0) {
      filters.genders.forEach(gender => {
        active.push({ key: 'genders', value: gender, label: gender });
      });
    }
    
    if (filters.supplierLocations && filters.supplierLocations.length > 0) {
      filters.supplierLocations.forEach(location => {
        active.push({ key: 'supplierLocations', value: location, label: location });
      });
    }
    
    // Three-layer category system filters
    if (filters.mainCategories && filters.mainCategories.length > 0) {
      filters.mainCategories.forEach(cat => {
        active.push({ key: 'mainCategories', value: cat, label: `Category: ${cat}` });
      });
    }
    
    if (filters.kidsGenders && filters.kidsGenders.length > 0) {
      filters.kidsGenders.forEach(kg => {
        active.push({ key: 'kidsGenders', value: kg, label: `Kids: ${kg}` });
      });
    }
    
    if (filters.kidsAgeGroups && filters.kidsAgeGroups.length > 0) {
      filters.kidsAgeGroups.forEach(age => {
        active.push({ key: 'kidsAgeGroups', value: age, label: `Age: ${age}` });
      });
    }
    
    if (filters.sizes.length > 0) {
      filters.sizes.forEach(size => {
        active.push({ key: 'sizes', value: size, label: `Size ${size}` });
      });
    }
    
    if (filters.divisions && filters.divisions.length > 0) {
      filters.divisions.forEach(div => {
        active.push({ key: 'divisions', value: div, label: `Division: ${div}` });
      });
    }
    
    if (filters.search) {
      active.push({ 
        key: 'search', 
        value: filters.search, 
        label: `"${filters.search}"` 
      });
    }

    return active;
  }, [
    filters.categories, 
    filters.brands, 
    filters.collections,
    filters.colors, 
    filters.models, 
    filters.sizes, 
    filters.search,
    filters.styles,
    filters.ageRanges,
    filters.occasions,
    filters.genders,
    filters.supplierLocations,
    filters.mainCategories,
    filters.kidsGenders,
    filters.kidsAgeGroups,
    filters.divisions
  ]);

  return {
    filters,
    updateFilter,
    toggleArrayFilter,
    removeFilter,
    clearAllFilters,
    getActiveFilters,
  };
}
