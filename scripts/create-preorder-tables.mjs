import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function run() {
  await sql`CREATE TABLE IF NOT EXISTS warehouse_shipments (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_number TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    expected_date TEXT,
    received_date TEXT,
    created_by VARCHAR REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT now(),
    updated_at TEXT NOT NULL DEFAULT now()
  )`;
  console.log("Created warehouse_shipments");

  await sql`CREATE TABLE IF NOT EXISTS shipment_items (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id VARCHAR NOT NULL REFERENCES warehouse_shipments(id),
    product_id VARCHAR NOT NULL REFERENCES products(id),
    sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    size TEXT NOT NULL,
    quantity_expected INTEGER NOT NULL DEFAULT 0,
    quantity_received INTEGER NOT NULL DEFAULT 0,
    quantity_allocated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT now()
  )`;
  console.log("Created shipment_items");

  await sql`CREATE TABLE IF NOT EXISTS preorder_allocations (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_item_id VARCHAR NOT NULL REFERENCES shipment_items(id),
    order_id VARCHAR NOT NULL REFERENCES orders(id),
    product_id VARCHAR NOT NULL REFERENCES products(id),
    sku TEXT NOT NULL,
    size TEXT NOT NULL,
    quantity_allocated INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'allocated',
    allocated_by VARCHAR REFERENCES users(id),
    allocated_at TEXT NOT NULL DEFAULT now(),
    notes TEXT
  )`;
  console.log("Created preorder_allocations");

  await sql`CREATE TABLE IF NOT EXISTS preorder_fulfillment (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR NOT NULL REFERENCES orders(id),
    product_id VARCHAR NOT NULL REFERENCES products(id),
    sku TEXT NOT NULL,
    size TEXT NOT NULL,
    quantity_ordered INTEGER NOT NULL,
    quantity_fulfilled INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unfulfilled',
    updated_at TEXT NOT NULL DEFAULT now()
  )`;
  console.log("Created preorder_fulfillment");

  console.log("All tables created successfully!");
}

run().catch(e => { console.error(e); process.exit(1); });
