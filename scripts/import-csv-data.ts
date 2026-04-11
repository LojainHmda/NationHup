import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { db } from '../server/db';
import { products, categories, brands } from '../shared/schema';
import { sql } from 'drizzle-orm';

interface CSVRow {
  upc: string; // This is the SKU
  name: string;
  Brand: string; // Capital B in CSV
  Category: string; // Capital C in CSV
  gender: string; // Gender field (MENS, WOMENS, etc.)
  cost: string; // This is wholesale price
  rrp: string; // This is retail price
  color: string;
  'Size US/UK': string;
  'Ordered QTY': string;
}

function mapGender(gender: string): string {
  const genderUpper = gender.toUpperCase().trim();
  
  switch (genderUpper) {
    case 'WOMENS':
    case 'WOMEN':
    case 'WOMAN':
      return 'women';
    case 'MENS':
    case 'MEN':
    case 'MAN':
      return 'men';
    case 'KIDS':
    case 'CHILDREN':
    case 'CHILD':
    case 'YOUTH':
      return 'kids';
    case 'UNISEX':
    case 'UNIVERSAL':
      return 'unisex';
    default:
      // Fallback based on common patterns
      const genderLower = gender.toLowerCase();
      if (genderLower.includes('women') || genderLower.includes('female')) return 'women';
      if (genderLower.includes('men') || genderLower.includes('male')) return 'men';
      if (genderLower.includes('kid') || genderLower.includes('child') || genderLower.includes('youth')) return 'kids';
      return 'unisex';
  }
}

function generateDescription(name: string, brand: string, gender: string): string {
  const genderTitle = gender.charAt(0).toUpperCase() + gender.slice(1);
  return `${name} - ${genderTitle.toUpperCase()} Footwear`;
}

function calculateStockLevel(totalStock: number): string {
  if (totalStock === 0) return 'out_of_stock';
  if (totalStock <= 5) return 'low_stock';
  return 'in_stock';
}

function generateImageUrl(brand: string): string {
  // Using Unsplash with shoe-specific search terms
  const searchTerms = [
    'shoe', 'sneaker', 'footwear', 'boot', 'running-shoe', 
    'athletic-shoe', 'casual-shoe', 'sports-shoe'
  ];
  const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
  return `https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=500&h=500&q=80&sig=${randomTerm}-${brand}`;
}

async function importCSVData() {
  try {
    console.log('🚀 Starting CSV import process...');
    
    // Read and parse CSV
    const csvContent = readFileSync('../attached_assets/cleaned_data_with_category_1758741036192.csv', 'utf-8');
    const rows: CSVRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    console.log(`📊 Found ${rows.length} rows in CSV`);

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await db.delete(products);
    await db.delete(brands);
    await db.delete(categories);

    // Group data by product (SKU)
    const productMap = new Map();
    const brandSet = new Set<string>();
    const categorySet = new Set<string>();

    for (const row of rows) {
      if (!row.upc || !row.name || !row.Brand || !row.gender) {
        console.log(`⚠️  Skipping invalid row: ${JSON.stringify(row)}`);
        continue;
      }

      const sku = row.upc.trim();
      const name = row.name.trim();
      const brand = row.Brand.trim();
      const category = row.Category?.trim() || 'Footwear';
      const gender = mapGender(row.gender || '');
      const color = row.color?.trim() || 'Default';
      const size = row['Size US/UK']?.trim() || 'One Size';
      const stock = parseInt(row['Ordered QTY'] || '0');
      
      const wholesalePrice = parseFloat(row.cost?.replace(/[^0-9.]/g, '') || '0');
      const retailPrice = parseFloat(row.rrp?.replace(/[^0-9.]/g, '') || '0');

      brandSet.add(brand);
      categorySet.add(category);

      if (!productMap.has(sku)) {
        productMap.set(sku, {
          sku,
          name,
          brand,
          category,
          gender,
          description: generateDescription(name, brand, gender),
          wholesalePrice: wholesalePrice.toFixed(2),
          retailPrice: retailPrice.toFixed(2),
          imageUrl: generateImageUrl(brand),
          colors: new Set<string>(),
          availableSizes: new Map(),
          totalStock: 0
        });
      }

      const product = productMap.get(sku);
      product.colors.add(color);
      
      const sizeKey = `${size}`;
      if (product.availableSizes.has(sizeKey)) {
        product.availableSizes.set(sizeKey, product.availableSizes.get(sizeKey) + stock);
      } else {
        product.availableSizes.set(sizeKey, stock);
      }
      
      product.totalStock += stock;
    }

    // Insert categories
    console.log('📁 Inserting categories...');
    const categoryInserts = Array.from(categorySet).map(name => ({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      description: `${name} collection`,
      isActive: true,
      priority: 0
    }));
    
    if (categoryInserts.length > 0) {
      await db.insert(categories).values(categoryInserts);
    }

    // Insert brands
    console.log('🏷️  Inserting brands...');
    const brandInserts = Array.from(brandSet).map(name => ({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      description: `${name} brand footwear`,
      isActive: true,
      priority: 0
    }));
    
    if (brandInserts.length > 0) {
      await db.insert(brands).values(brandInserts);
    }

    // Insert products
    console.log('👟 Inserting products...');
    const productInserts = Array.from(productMap.values()).map(product => ({
      sku: product.sku,
      name: product.name,
      category: product.category,
      brand: product.brand,
      gender: product.gender, // Now properly mapped from CSV target field
      description: product.description,
      wholesalePrice: product.wholesalePrice,
      retailPrice: product.retailPrice,
      imageUrl: product.imageUrl,
      colors: Array.from(product.colors),
      availableSizes: Array.from(product.availableSizes.entries()).map(([size, stock]) => ({
        size,
        stock
      })),
      inStock: product.totalStock > 0,
      stockLevel: calculateStockLevel(product.totalStock)
    }));

    if (productInserts.length > 0) {
      await db.insert(products).values(productInserts);
    }

    console.log(`✅ Import completed successfully!`);
    console.log(`📊 Imported: ${productInserts.length} products, ${brandInserts.length} brands, ${categoryInserts.length} categories`);
    
    // Log gender distribution
    const genderCounts = productInserts.reduce((acc, product) => {
      acc[product.gender] = (acc[product.gender] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('🎯 Gender distribution:', genderCounts);

  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  }
}

// Run import if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  importCSVData()
    .then(() => {
      console.log('🎉 CSV import completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 CSV import failed:', error);
      process.exit(1);
    });
}

export { importCSVData };