import { db } from "./db";
import { users, customerProfiles } from "@shared/schema";
import { hashPassword } from "./auth";
import { eq } from "drizzle-orm";

async function seedUsers() {
  console.log("🌱 Seeding test users...");

  try {
    // Check if admin user already exists
    const existingAdmin = await db.select().from(users).where(eq(users.username, "admin"));
    
    if (existingAdmin.length === 0) {
      const adminPasswordHash = await hashPassword("admin");
      const [adminUser] = await db.insert(users).values({
        username: "admin",
        password: adminPasswordHash,
        email: "admin@wholesale.com",
        displayName: "Admin User",
        role: "admin",
      }).returning();
      
      console.log("✅ Created admin user: username=admin, password=admin");
    } else {
      console.log("ℹ️  Admin user already exists");
    }

    // Check if customer test user already exists
    const existingCustomer = await db.select().from(users).where(eq(users.username, "user"));
    
    if (existingCustomer.length === 0) {
      const userPasswordHash = await hashPassword("user");
      const [customerUser] = await db.insert(users).values({
        username: "user",
        password: userPasswordHash,
        email: "customer@example.com",
        displayName: "Test Customer",
        role: "customer",
      }).returning();

      // Create customer profile
      await db.insert(customerProfiles).values({
        userId: customerUser.id,
        companyName: "Test Company LLC",
        businessType: "Retail",
        phone: "+1 (555) 123-4567",
        creditLimit: "10000",
        isBlacklisted: false,
      });
      
      console.log("✅ Created customer user: username=user, password=user");
    } else {
      console.log("ℹ️  Customer test user already exists");
    }

    // Check if Account Manager user already exists
    const existingAccountManager = await db.select().from(users).where(eq(users.username, "AccountManager"));
    
    if (existingAccountManager.length === 0) {
      const accountManagerPasswordHash = await hashPassword("AccountManager");
      await db.insert(users).values({
        username: "AccountManager",
        password: accountManagerPasswordHash,
        email: "accountmanager@wholesale.com",
        displayName: "Account Manager",
        role: "account_manager",
      });
      
      console.log("✅ Created Account Manager user: username=AccountManager, password=AccountManager");
    } else {
      console.log("ℹ️  Account Manager user already exists");
    }

    // Check if Sales user already exists
    const existingSales = await db.select().from(users).where(eq(users.username, "Sales"));
    
    if (existingSales.length === 0) {
      const salesPasswordHash = await hashPassword("Sales");
      await db.insert(users).values({
        username: "Sales",
        password: salesPasswordHash,
        email: "sales@wholesale.com",
        displayName: "Sales Manager",
        role: "sales",
      });
      
      console.log("✅ Created Sales user: username=Sales, password=Sales");
    } else {
      console.log("ℹ️  Sales user already exists");
    }

    // Check if Finance user already exists
    const existingFinance = await db.select().from(users).where(eq(users.username, "Finance"));
    
    if (existingFinance.length === 0) {
      const financePasswordHash = await hashPassword("Finance");
      await db.insert(users).values({
        username: "Finance",
        password: financePasswordHash,
        email: "finance@wholesale.com",
        displayName: "Finance Manager",
        role: "finance",
      });
      
      console.log("✅ Created Finance user: username=Finance, password=Finance");
    } else {
      console.log("ℹ️  Finance user already exists");
    }

    console.log("🎉 User seeding completed!");
  } catch (error) {
    console.error("❌ Error seeding users:", error);
    throw error;
  }
}

seedUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
