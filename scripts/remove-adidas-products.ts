/**
 * Remove all Adidas products from the system.
 * Keeps the Adidas brand - only deletes products under it.
 * Run: npx tsx scripts/remove-adidas-products.ts
 */
import "dotenv/config";
import { db } from "../server/db";
import { brands, products, cartItems, stockAdjustments, collections } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";

async function removeAdidasProducts() {
  console.log("🔍 Finding Adidas brand...");
  
  const adidasBrands = await db
    .select()
    .from(brands)
    .where(sql`LOWER(${brands.name}) = 'adidas'`);
  
  if (adidasBrands.length === 0) {
    console.log("ℹ️ No Adidas brand found. Nothing to remove.");
    process.exit(0);
    return;
  }

  const adidasBrandId = adidasBrands[0].id;
  console.log(`✅ Found Adidas brand (id: ${adidasBrandId})`);

  const adidasProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.brand, adidasBrandId));

  if (adidasProducts.length === 0) {
    console.log("ℹ️ No Adidas products found. Nothing to remove.");
    process.exit(0);
    return;
  }

  const productIds = adidasProducts.map((p) => p.id);
  const productIdSet = new Set(productIds);
  console.log(`📦 Found ${productIds.length} Adidas products to remove`);

  // Delete cart items referencing these products
  await db.delete(cartItems).where(inArray(cartItems.productId, productIds));
  console.log("🗑️ Cleaned cart items");

  // Delete stock adjustments referencing these products
  await db.delete(stockAdjustments).where(inArray(stockAdjustments.productId, productIds));
  console.log("🗑️ Cleaned stock adjustments");

  // Remove Adidas product IDs from collections
  const allCollections = await db.select().from(collections);
  for (const col of allCollections) {
    const ids = (col.productIds as string[]) || [];
    const filtered = ids.filter((id) => !productIdSet.has(id));
    if (filtered.length !== ids.length) {
      await db.update(collections).set({ productIds: filtered }).where(eq(collections.id, col.id));
    }
  }
  console.log("🗑️ Cleaned collections");

  // Delete the products
  await db.delete(products).where(eq(products.brand, adidasBrandId));
  console.log(`✅ Removed ${productIds.length} Adidas products`);

  console.log("🎉 Done. Adidas brand kept, all products removed.");
  process.exit(0);
}

removeAdidasProducts().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
