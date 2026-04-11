/**
 * Remove all Under Armour products from the system.
 * Keeps the Under Armour brand - only deletes products under it.
 * Run: npx tsx scripts/remove-under-armour-products.ts
 */
import "dotenv/config";
import { db } from "../server/db";
import { brands, products, cartItems, stockAdjustments, collections } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";

async function removeUnderArmourProducts() {
  console.log("🔍 Finding Under Armour brand...");

  const underArmourBrands = await db
    .select()
    .from(brands)
    .where(sql`LOWER(${brands.name}) LIKE '%under%armour%'`);

  if (underArmourBrands.length === 0) {
    console.log("ℹ️ No Under Armour brand found. Nothing to remove.");
    process.exit(0);
    return;
  }

  const brandId = underArmourBrands[0].id;
  console.log(`✅ Found Under Armour brand (id: ${brandId})`);

  const brandProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.brand, brandId));

  if (brandProducts.length === 0) {
    console.log("ℹ️ No Under Armour products found. Nothing to remove.");
    process.exit(0);
    return;
  }

  const productIds = brandProducts.map((p) => p.id);
  const productIdSet = new Set(productIds);
  console.log(`📦 Found ${productIds.length} Under Armour products to remove`);

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
  console.log(`✅ Removed ${productIds.length} Under Armour products`);

  console.log("🎉 Done. Under Armour brand kept, all products removed.");
  process.exit(0);
}

removeUnderArmourProducts().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
