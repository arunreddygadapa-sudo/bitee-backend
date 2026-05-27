// bitee-backend/db.js
const { Pool } = require('pg');

// 1. Connect to Supabase Cloud Database (Replaced local credentials)
const pool = new Pool({
  connectionString: "postgresql://postgres:Arun@123@Arun@123@db.rtmdfrcajrphoryqkydy.supabase.co:5432/postgres",
  ssl: {
    rejectUnauthorized: false // Required for cloud databases
  }
});

// 2. Keep your existing Auto-Upgrade script to build the cloud tables!
const initializeDatabase = async () => {
  try {
    // 1. Create Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Users (
        user_id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        dob VARCHAR(15) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        phone VARCHAR(15) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'Customer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Users table ready");

    // 2. Create Orders Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Orders (
        order_id SERIAL PRIMARY KEY,
        customer_name VARCHAR(100) DEFAULT 'Guest',
        total_amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50),
        status VARCHAR(50) DEFAULT 'PENDING',
        items_json TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // 3. Upgrade Orders Table (Added Sequentially!)
    await pool.query(`ALTER TABLE Orders ADD COLUMN IF NOT EXISTS restaurant_id VARCHAR(50) DEFAULT '1';`);
    console.log("✅ Orders table ready & upgraded");

    // 4. Create Advanced KYC Restaurants Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Restaurants (
        restaurant_id SERIAL PRIMARY KEY,
        restaurant_name VARCHAR(100) NOT NULL,
        owner_name VARCHAR(100) NOT NULL,
        restaurant_phone VARCHAR(15) NOT NULL,
        owner_phone VARCHAR(15) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        restaurant_address TEXT NOT NULL,
        owner_address TEXT NOT NULL,
        timings VARCHAR(100),
        aadhaar_number VARCHAR(20),
        pan_number VARCHAR(20),
        food_license_url TEXT,
        menu_card_url TEXT,
        restaurant_photos_url TEXT,
        pan_copy_url TEXT,
        aadhaar_copy_url TEXT,
        udyam_cert_url TEXT,
        gst_copy_url TEXT,
        bank_account_no VARCHAR(50),
        bank_ifsc VARCHAR(20),
        bank_account_name VARCHAR(100),
        is_approved BOOLEAN DEFAULT FALSE,
        is_online BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Enterprise Restaurants table ready");

    // 5. Create Dynamic Menu Items Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS MenuItems (
        item_id SERIAL PRIMARY KEY,
        restaurant_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        description TEXT,
        is_veg BOOLEAN DEFAULT TRUE,
        image_url TEXT,
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Dynamic Menu table ready");

    // 6. Upgrade Orders Table for Riders
    await pool.query("ALTER TABLE Orders ADD COLUMN IF NOT EXISTS rider_id INT;");

    // 7. Create Riders Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Riders (
        rider_id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        phone VARCHAR(15) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        vehicle_type VARCHAR(50) DEFAULT 'Bike',
        vehicle_number VARCHAR(20) NOT NULL,
        is_online BOOLEAN DEFAULT FALSE,
        is_approved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Delivery Riders table ready");

  } catch (error) {
    console.error("❌ Database initialization error:", error.message);
  }
};

// Run the initialization
initializeDatabase();

module.exports = pool;