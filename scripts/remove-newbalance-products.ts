/**
 * Remove all New Balance products from the system.
 * Keeps the New Balance brand - only deletes products under it.
 * Run: npx tsx scripts/remove-newbalance-products.ts
 */
import "dotenv/config";
import { db } from "../server/db";
import { brands, products, cartItems, stockAdjustments, collections } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";

async function removeNewBalanceProducts() {
  console.log("🔍 Finding New Balance brand...");

  const brandResults = await db
    .select()
    .from(brands)
    .where(sql`LOWER(${brands.name}) IN ('newbalance', 'new balance')`);

  if (brandResults.length === 0) {
    console.log("ℹ️ No New Balance brand found. Nothing to remove.");
    process.exit(0);
    return;
  }

  const brandId = brandResults[0].id;
  console.log(`✅ Found New Balance brand (id: ${brandId})`);

  const brandProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.brand, brandId));

  if (brandProducts.length === 0) {
    console.log("ℹ️ No New Balance products found. Nothing to remove.");
    process.exit(0);
    return;
  }

  const productIds = brandProducts.map((p) => p.id);
  const productIdSet = new Set(productIds);
  console.log(`📦 Found ${productIds.length} New Balance products to remove`);

  // Delete cart items referencing these products
  await db.delete(cartItems).where(inArray(cartItems.productId, productIds));
  console.log("🗑️ Cleaned cart items");

  // Delete stock adjustments referencing these products
  await db.delete(stockAdjustments).where(inArray(stockAdjustments.productId, productIds));
  console.log("🗑️ Cleaned stock adjustments");

  // Remove product IDs from collections
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
  await db.delete(products).where(eq(products.brand, brandId));
  console.log(`✅ Removed ${productIds.length} New Balance products`);

  console.log("🎉 Done. New Balance brand kept, all products removed.");
  process.exit(0);
}

removeNewBalanceProducts().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
