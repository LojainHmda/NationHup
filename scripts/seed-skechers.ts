import { db } from "../server/db";
import { categories, collections, brands, products } from "@shared/schema";

async function seedSkechersData() {
  console.log("🌱 Starting database seed for Skechers...");

  try {
    // Seed Categories
    console.log("📁 Seeding categories...");
    const categoryData = [
      {
        name: "Athletic Shoes",
        slug: "athletic-shoes",
        iconUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Running, training, and sports performance footwear",
        isActive: true,
        priority: 10
      },
      {
        name: "Sneakers Men",
        slug: "sneakers-men",
        iconUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Casual and lifestyle sneakers for men",
        isActive: true,
        priority: 7
      },
      {
        name: "Sneakers Women",
        slug: "sneakers-women",
        iconUrl: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Casual and lifestyle sneakers for women",
        isActive: true,
        priority: 6
      }
    ];

    const insertedCategories = await db.insert(categories).values(categoryData).returning();
    console.log(`✅ Inserted ${insertedCategories.length} categories`);

    // Find specific categories
    const athleticCategory = insertedCategories.find(c => c.name === "Athletic Shoes");
    const menSneakersCategory = insertedCategories.find(c => c.name === "Sneakers Men");
    const womenSneakersCategory = insertedCategories.find(c => c.name === "Sneakers Women");

    // Seed Collections
    console.log("📦 Seeding collections...");
    const collectionData = [
      {
        name: "Lifestyle Men",
        slug: "lifestyle-men",
        categoryId: menSneakersCategory?.id || insertedCategories[1].id,
        iconUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Casual lifestyle sneakers for men",
        isActive: true,
        priority: 7
      }
    ];

    const insertedCollections = await db.insert(collections).values(collectionData).returning();
    console.log(`✅ Inserted ${insertedCollections.length} collections`);

    const lifestyleMenCollection = insertedCollections[0];

    // Seed Brands (Skechers only)
    console.log("🏷️ Seeding Skechers brand...");
    const brandData = [
      {
        name: "Skechers",
        slug: "skechers",
        collectionId: lifestyleMenCollection.id,
        logoUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100",
        description: "Comfort and style for everyday wear",
        isActive: true,
        priority: 10
      }
    ];

    const insertedBrands = await db.insert(brands).values(brandData).returning();
    console.log(`✅ Inserted ${insertedBrands.length} brands`);

    // Seed Skechers Products
    console.log("👟 Seeding Skechers products...");
    const productData = [
      {
        name: "Skechers Go Walk Max",
        sku: "SK-GW100",
        category: "Sneakers Men",
        brand: "Skechers",
        gender: "men",
        description: "Ultra-comfortable walking shoe with Air Cooled Goga Mat insole",
        wholesalePrice: "35.00",
        retailPrice: "70.00",
        imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colors: ["Black", "Navy", "Grey"],
        availableSizes: [
          {size: "7", stock: 30}, {size: "8", stock: 35}, {size: "9", stock: 40},
          {size: "10", stock: 38}, {size: "11", stock: 32}, {size: "12", stock: 25}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      {
        name: "Skechers D'Lites",
        sku: "SK-DL200",
        category: "Sneakers Women",
        brand: "Skechers",
        gender: "women",
        description: "Trendy chunky sneaker with Memory Foam cushioning",
        wholesalePrice: "40.00",
        retailPrice: "80.00",
        imageUrl: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colors: ["White", "Black", "Pink"],
        availableSizes: [
          {size: "5", stock: 25}, {size: "6", stock: 30}, {size: "7", stock: 35},
          {size: "8", stock: 32}, {size: "9", stock: 28}, {size: "10", stock: 20}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      {
        name: "Skechers Flex Advantage",
        sku: "SK-FA300",
        category: "Athletic Shoes",
        brand: "Skechers",
        gender: "men",
        description: "Flexible athletic shoe perfect for training and running",
        wholesalePrice: "38.00",
        retailPrice: "76.00",
        imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colors: ["Black", "Blue", "Red"],
        availableSizes: [
          {size: "7", stock: 28}, {size: "8", stock: 32}, {size: "9", stock: 35},
          {size: "10", stock: 30}, {size: "11", stock: 25}, {size: "12", stock: 20}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      {
        name: "Skechers Summits",
        sku: "SK-SM400",
        category: "Sneakers Women",
        brand: "Skechers",
        gender: "women",
        description: "Sporty slip-on with breathable mesh and Memory Foam",
        wholesalePrice: "32.50",
        retailPrice: "65.00",
        imageUrl: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colors: ["Grey", "Black", "Lavender"],
        availableSizes: [
          {size: "5", stock: 22}, {size: "6", stock: 28}, {size: "7", stock: 30},
          {size: "8", stock: 26}, {size: "9", stock: 24}, {size: "10", stock: 18}
        ],
        inStock: true,
        stockLevel: "in_stock"
      },
      {
        name: "Skechers Max Cushioning Elite",
        sku: "SK-MC500",
        category: "Athletic Shoes",
        brand: "Skechers",
        gender: "men",
        description: "Maximum cushioning for superior comfort during workouts",
        wholesalePrice: "45.00",
        retailPrice: "90.00",
        imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300",
        colors: ["Black", "White", "Navy"],
        availableSizes: [
          {size: "7", stock: 25}, {size: "8", stock: 30}, {size: "9", stock: 32},
          {size: "10", stock: 28}, {size: "11", stock: 22}, {size: "12", stock: 18}
        ],
        inStock: true,
        stockLevel: "in_stock"
      }
    ];

    const insertedProducts = await db.insert(products).values(productData).returning();
    console.log(`✅ Inserted ${insertedProducts.length} products`);

    console.log("🎉 Seed completed successfully!");
    console.log(`Total: ${insertedCategories.length} categories, ${insertedCollections.length} collections, ${insertedBrands.length} brands, ${insertedProducts.length} products`);

  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }

  process.exit(0);
}

seedSkechersData();
