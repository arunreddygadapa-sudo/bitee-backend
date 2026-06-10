// bitee-backend/server.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt'); 
const pool = require('./db'); 
const Razorpay = require('razorpay'); 
const crypto = require('crypto');     

const app = express();
app.use(cors());
app.use(express.json());

// 🚀 INITIALIZE RAZORPAY
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_YOUR_KEY_HERE',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'YOUR_SECRET_HERE',
});

// 🚀 INITIALIZE CLOUDINARY
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'YOUR_CLOUD_NAME',
  api_key: process.env.CLOUDINARY_API_KEY || 'YOUR_API_KEY',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'YOUR_API_SECRET'
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'bitee_documents', allowed_formats: ['jpg', 'png', 'pdf'] },
});
const upload = multer({ storage: storage });

// ==========================================
// 🚀 PHASE 7: PUSH NOTIFICATION ENGINE
// ==========================================
const sendPushNotification = async (expoPushToken, title, body, data = {}) => {
  if (!expoPushToken) return;
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
  };

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  } catch (error) {
    console.error("Push Notification Error:", error);
  }
};

app.put('/api/notifications/save-token', async (req, res) => {
  try {
    const { userId, userType, token } = req.body;
    let table = userType === 'RESTAURANT' ? 'Restaurants' : userType === 'RIDER' ? 'Riders' : 'Users';
    let idCol = userType === 'RESTAURANT' ? 'restaurant_id' : userType === 'RIDER' ? 'rider_id' : 'user_id';
    
    await pool.query(`UPDATE ${table} SET push_token = $1 WHERE ${idCol} = $2`, [token, userId]);
    res.status(200).json({ success: true, message: "Push token securely registered." });
  } catch (error) {
    res.status(500).json({ error: "Failed to save push token." });
  }
});

// ==========================================
// 1. AUTHENTICATION (ALL 3 USERS)
// ==========================================
app.post('/api/register', async (req, res) => {
  try {
    const { fullName, dob, email, phone, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const insertQuery = `INSERT INTO Users (full_name, dob, email, phone, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, full_name, email;`;
    const newUser = await pool.query(insertQuery, [fullName, dob, email, phone, passwordHash]);
    res.status(201).json({ message: "User registered successfully!", user: newUser.rows[0] });
  } catch (error) { 
    res.status(500).json({ error: "Server error during registration." }); 
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const userQuery = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);
    if (userQuery.rows.length === 0) return res.status(400).json({ error: "User not found." });
    
    const validPassword = await bcrypt.compare(password, userQuery.rows[0].password_hash);
    if (!validPassword) return res.status(400).json({ error: "Incorrect password." });
    
    res.status(200).json({ message: "Login successful!", user: { id: userQuery.rows[0].user_id, fullName: userQuery.rows[0].full_name }});
  } catch (error) { 
    res.status(500).json({ error: "Server error during login." }); 
  }
});

app.post('/api/partner/register', async (req, res) => {
  try {
    const { 
      restaurantName, ownerName, restaurantPhone, ownerPhone, email, password, 
      restaurantAddress, ownerAddress, timings, aadhaarNumber, panNumber, 
      bankAccountNo, bankIfsc, bankAccountName,
      restaurantPhotosUrl, licenseCopyUrl, menuCopyUrl, panCopyUrl, aadhaarCopyUrl, udyamCertUrl, gstCopyUrl
    } = req.body;
    
    const passwordHash = await bcrypt.hash(password, 10);

    const insertQuery = `
      INSERT INTO Restaurants (
        restaurant_name, owner_name, restaurant_phone, owner_phone, email, password_hash, 
        restaurant_address, owner_address, timings, aadhaar_number, pan_number, 
        bank_account_no, bank_ifsc, bank_account_name, is_approved, is_online,
        restaurant_photos_url, license_copy_url, menu_copy_url, pan_copy_url, aadhaar_copy_url, udyam_cert_url, gst_copy_url
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, FALSE, FALSE, $15, $16, $17, $18, $19, $20, $21) 
      RETURNING restaurant_id, restaurant_name, email;
    `;
    
    const newRestaurant = await pool.query(insertQuery, [
      restaurantName, ownerName, restaurantPhone, ownerPhone, email, passwordHash, 
      restaurantAddress, ownerAddress, timings, aadhaarNumber, panNumber, 
      bankAccountNo, bankIfsc, bankAccountName,
      restaurantPhotosUrl, licenseCopyUrl, menuCopyUrl, panCopyUrl, aadhaarCopyUrl, udyamCertUrl, gstCopyUrl
    ]);
    
    res.status(201).json({ message: "Application submitted successfully!", restaurant: newRestaurant.rows[0] });
  } catch (error) { 
    res.status(500).json({ error: `Database error: ${error.message}` }); 
  }
});

app.post('/api/restaurant/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const restQuery = await pool.query('SELECT * FROM Restaurants WHERE email = $1', [email]);
    if (restQuery.rows.length === 0) return res.status(400).json({ error: "Restaurant not found." });
    
    const restaurant = restQuery.rows[0];
    const validPassword = await bcrypt.compare(password, restaurant.password_hash);
    if (!validPassword) return res.status(400).json({ error: "Incorrect password." });
    
    res.status(200).json({ message: "Login successful!", restaurant: { id: restaurant.restaurant_id, name: restaurant.restaurant_name, isOnline: restaurant.is_online }});
  } catch (error) { 
    res.status(500).json({ error: "Server error during partner login." }); 
  }
});

app.post('/api/rider/register', async (req, res) => {
  try {
    const { fullName, phone, email, password, vehicleType, vehicleNumber } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const insertQuery = `INSERT INTO Riders (full_name, phone, email, password_hash, vehicle_type, vehicle_number, is_approved) VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING rider_id, full_name;`;
    const newRider = await pool.query(insertQuery, [fullName, phone, email, passwordHash, vehicleType, vehicleNumber]);
    res.status(201).json({ message: "Rider registered successfully!", rider: newRider.rows[0] });
  } catch (error) { 
    res.status(500).json({ error: "Server error during rider registration." }); 
  }
});

app.post('/api/rider/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const riderQuery = await pool.query('SELECT * FROM Riders WHERE email = $1', [email]);
    if (riderQuery.rows.length === 0) return res.status(400).json({ error: "Rider not found." });
    
    const validPassword = await bcrypt.compare(password, riderQuery.rows[0].password_hash);
    if (!validPassword) return res.status(400).json({ error: "Incorrect password." });
    if (!riderQuery.rows[0].is_approved) return res.status(403).json({ error: "Account pending admin approval." });
    
    res.status(200).json({ message: "Login successful!", rider: { id: riderQuery.rows[0].rider_id, name: riderQuery.rows[0].full_name }});
  } catch (error) { 
    res.status(500).json({ error: "Server error during rider login." }); 
  }
});

// ==========================================
// 2. MENU ENGINE 
// ==========================================
app.post('/api/menu', async (req, res) => {
  try {
    const { restaurantId, name, price, description, isVeg, imageUrl } = req.body;
    const insertQuery = `INSERT INTO MenuItems (restaurant_id, name, price, description, is_veg, image_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;`;
    const newItem = await pool.query(insertQuery, [restaurantId, name, price, description, isVeg, imageUrl || 'default_food.jpg']);
    res.status(201).json({ message: "Menu item added!", item: newItem.rows[0] });
  } catch (error) { 
    res.status(500).json({ error: "Server error while adding item." }); 
  }
});

app.get('/api/menu/:restaurantId', async (req, res) => {
  try {
    const menuQuery = await pool.query('SELECT * FROM MenuItems WHERE restaurant_id = $1 ORDER BY created_at DESC', [req.params.restaurantId]);
    const formattedMenu = menuQuery.rows.map(item => ({
      id: item.item_id, name: item.name, price: `₹${item.price}`, desc: item.description, veg: item.is_veg, image: item.image_url, is_available: item.is_available 
    }));
    res.json(formattedMenu);
  } catch (error) { 
    res.status(500).json({ error: "Error fetching menu." }); 
  }
});

app.put('/api/menu/:itemId/toggle', async (req, res) => {
  try {
    const { isAvailable } = req.body;
    await pool.query('UPDATE MenuItems SET is_available = $1 WHERE item_id = $2', [isAvailable, req.params.itemId]);
    res.status(200).json({ message: "Item availability updated!" });
  } catch (error) { 
    res.status(500).json({ error: "Failed to toggle item." }); 
  }
});

app.put('/api/menu/:itemId', async (req, res) => {
  try {
    const { name, price, description, isVeg, imageUrl, isAvailable } = req.body;
    await pool.query(
      `UPDATE MenuItems 
       SET name = COALESCE($1, name), price = COALESCE($2, price), description = COALESCE($3, description), is_veg = COALESCE($4, is_veg), image_url = COALESCE($5, image_url), is_available = COALESCE($6, is_available) 
       WHERE item_id = $7`,
      [name, price, description, isVeg, imageUrl, isAvailable, req.params.itemId]
    );
    res.status(200).json({ message: "Item updated successfully!" });
  } catch (error) { 
    res.status(500).json({ error: "Failed to update item." }); 
  }
});

app.delete('/api/menu/:itemId', async (req, res) => {
  try {
    await pool.query('DELETE FROM MenuItems WHERE item_id = $1', [req.params.itemId]);
    res.status(200).json({ message: "Item deleted." });
  } catch (error) { 
    res.status(500).json({ error: "Failed to delete item." }); 
  }
});

// ==========================================
// 3. RESTAURANT DASHBOARD & ORDER MANAGEMENT
// ==========================================
app.put('/api/restaurant/:id/toggle-online', async (req, res) => {
  try {
    await pool.query('UPDATE Restaurants SET is_online = $1 WHERE restaurant_id = $2', [req.body.isOnline, req.params.id]);
    res.status(200).json({ message: `Updated!` });
  } catch (error) { 
    res.status(500).json({ error: "Error toggling status." }); 
  }
});

app.get('/api/restaurants', async (req, res) => {
  try {
    const query = `SELECT restaurant_id as id, restaurant_name as name, restaurant_address as distance, timings as time FROM Restaurants WHERE is_approved = TRUE AND is_online = TRUE`;
    const activeRestaurants = await pool.query(query);
    const formattedData = activeRestaurants.rows.map(r => ({ ...r, cuisine: 'Various Options', rating: 4.8, image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=500&auto=format&fit=crop&q=60' }));
    res.json(formattedData);
  } catch (error) { 
    res.status(500).json({ error: "Error fetching restaurants." }); 
  }
});

app.get('/api/restaurant/orders/:restaurantId/live', async (req, res) => {
  try {
    const ordersQuery = await pool.query("SELECT * FROM Orders WHERE status IN ('PENDING', 'PREPARING') AND restaurant_id = $1 ORDER BY created_at ASC", [req.params.restaurantId]);
    res.status(200).json(ordersQuery.rows);
  } catch (error) { 
    res.status(500).json({ error: "Error fetching live orders." }); 
  }
});

app.get('/api/restaurant/orders/:restaurantId/history', async (req, res) => {
  try {
    const ordersQuery = await pool.query("SELECT * FROM Orders WHERE status IN ('READY FOR PICKUP', 'DELIVERED', 'REJECTED', 'CANCELLED') AND restaurant_id = $1 ORDER BY created_at DESC", [req.params.restaurantId]);
    res.status(200).json(ordersQuery.rows);
  } catch (error) { 
    res.status(500).json({ error: "Error fetching order history." }); 
  }
});

// 🚀 UPGRADED: Trigger Customer Push Notification when Restaurant changes status
app.put('/api/orders/:id/status', async (req, res) => {
  try {
    await pool.query('UPDATE Orders SET status = $1 WHERE order_id = $2', [req.body.status, req.params.id]);
    
    // Find the customer's push token to notify them
    const orderData = await pool.query("SELECT customer_name FROM Orders WHERE order_id = $1", [req.params.id]);
    const userQuery = await pool.query("SELECT push_token FROM Users WHERE full_name = $1", [orderData.rows[0]?.customer_name]);
    
    if (userQuery.rows[0]?.push_token) {
      await sendPushNotification(
        userQuery.rows[0].push_token, 
        "Order Update 🛵", 
        `Your Bitee order is now: ${req.body.status}`
      );
    }

    res.status(200).json({ message: `Order marked as ${req.body.status}!` });
  } catch (error) { 
    res.status(500).json({ error: "Error updating status." }); 
  }
});

app.put('/api/orders/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    await pool.query('UPDATE Orders SET status = $1, rejection_reason = $2 WHERE order_id = $3', ['REJECTED', reason, req.params.id]);
    res.status(200).json({ message: `Order rejected.` });
  } catch (error) { 
    res.status(500).json({ error: "Error rejecting order." }); 
  }
});

// ==========================================
// 3.5 DIGITAL WALLETS & DOCUMENTS 
// ==========================================
app.get('/api/restaurant/:id/wallet', async (req, res) => {
  try {
    const restId = req.params.id;
    await pool.query("INSERT INTO Wallets (restaurant_id, balance) VALUES ($1, 0) ON CONFLICT DO NOTHING", [restId]);
    const balanceQuery = await pool.query("SELECT balance FROM Wallets WHERE restaurant_id = $1", [restId]);
    const historyQuery = await pool.query("SELECT * FROM WalletTransactions WHERE restaurant_id = $1 ORDER BY created_at DESC LIMIT 50", [restId]);
    
    res.status(200).json({ balance: balanceQuery.rows[0]?.balance || 0.00, transactions: historyQuery.rows });
  } catch (error) { 
    res.status(500).json({ error: "Failed to fetch wallet data." }); 
  }
});

app.post('/api/restaurant/:id/upload-doc', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    await pool.query("UPDATE Restaurants SET document_url = $1 WHERE restaurant_id = $2", [req.file.path, req.params.id]);
    res.status(200).json({ message: `Uploaded successfully!`, url: req.file.path });
  } catch (error) { 
    res.status(500).json({ error: "Failed to process document." }); 
  }
});

app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image provided." });
    res.status(200).json({ url: req.file.path });
  } catch (error) { 
    res.status(500).json({ error: "Failed to upload image." }); 
  }
});

// ==========================================
// 4. CUSTOMER CHECKOUT 
// ==========================================
app.post('/api/orders/verify', async (req, res) => {
  try {
    const { customerName, totalAmount, paymentMethod, transactionId, items, restaurantId, deliveryAddress, deliveryDistanceKm, taxBreakdown } = req.body;
    
    const itemsJson = JSON.stringify(items);
    const taxBreakdownJson = JSON.stringify(taxBreakdown); 
    const restOtp = Math.floor(10000 + Math.random() * 90000).toString();
    const custOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const riderPayout = taxBreakdown ? taxBreakdown.deliveryFee : 0.00;

    const insertQuery = `
      INSERT INTO Orders (
        customer_name, total_amount, payment_method, payment_id, items_json, 
        restaurant_id, rider_payout, rest_otp, cust_otp, 
        delivery_address, delivery_distance_km, tax_breakdown
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING order_id, status;
    `;
    const newOrder = await pool.query(insertQuery, [
      customerName, totalAmount, paymentMethod, transactionId || 'COD', 
      itemsJson, restaurantId || '1', riderPayout, restOtp, custOtp, 
      deliveryAddress || 'Not Provided', deliveryDistanceKm || 0.0, taxBreakdownJson || '{}'
    ]);
    
    // 🚀 UPGRADED: Trigger Restaurant Push Notification for new order
    const restQuery = await pool.query("SELECT push_token FROM Restaurants WHERE restaurant_id = $1", [restaurantId || '1']);
    if (restQuery.rows[0]?.push_token) {
      await sendPushNotification(
        restQuery.rows[0].push_token, 
        "🚨 NEW KOT RECEIVED!", 
        `Order #${newOrder.rows[0].order_id} - ₹${totalAmount} has been paid.`
      );
    }

    res.status(201).json({ message: "Order placed.", order: newOrder.rows[0] });
  } catch (error) { 
    res.status(500).json({ error: `Server Error` }); 
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const ordersQuery = await pool.query("SELECT * FROM Orders ORDER BY order_id DESC");
    res.status(200).json(ordersQuery.rows);
  } catch (error) { 
    res.status(500).json({ error: "Failed to fetch orders." }); 
  }
});

// ==========================================
// 4.5 PRIVACY & SUPPORT ENGINE
// ==========================================
app.get('/api/orders/:id/track', async (req, res) => {
  try {
    const query = `
      SELECT o.*, 
             r.restaurant_name, r.restaurant_phone,
             rd.full_name as rider_name, rd.phone as rider_phone
      FROM Orders o
      LEFT JOIN Restaurants r ON CAST(o.restaurant_id AS INTEGER) = r.restaurant_id
      LEFT JOIN Riders rd ON o.rider_id = rd.rider_id
      WHERE o.order_id = $1
    `;
    const result = await pool.query(query, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Order not found." });

    const order = result.rows[0];
    const restPhone = order.restaurant_phone || "0000000000";
    const maskedRestPhone = "******" + restPhone.slice(-4);

    res.status(200).json({
      ...order,
      restaurant_phone_masked: maskedRestPhone,
      rider_phone: order.rider_name ? order.rider_phone : null 
    });
  } catch (error) { 
    res.status(500).json({ error: "Failed to track order." }); 
  }
});

app.put('/api/orders/:id/customer-cancel', async (req, res) => {
  try {
    const check = await pool.query("SELECT status FROM Orders WHERE order_id = $1", [req.params.id]);
    if (check.rows[0]?.status !== 'PENDING') {
      return res.status(400).json({ error: "Order is already being prepared. Request cancellation via Support." });
    }
    await pool.query("UPDATE Orders SET status = 'CANCELLED' WHERE order_id = $1", [req.params.id]);
    res.status(200).json({ message: "Order cancelled successfully." });
  } catch (error) { 
    res.status(500).json({ error: "Failed to cancel order." }); 
  }
});

app.post('/api/support/request', async (req, res) => {
  try {
    const { orderId, customerName, requestType, reason, description } = req.body;
    await pool.query(
      "INSERT INTO SupportRequests (order_id, customer_name, request_type, reason, description) VALUES ($1, $2, $3, $4, $5)",
      [orderId, customerName, requestType, reason, description]
    );
    res.status(201).json({ message: "Request sent to Admin successfully!" });
  } catch (error) { 
    res.status(500).json({ error: "Failed to submit request." }); 
  }
});

app.get('/api/orders/:id/bill', async (req, res) => {
  try {
    const query = `
      SELECT o.*, r.restaurant_name, r.restaurant_address, r.restaurant_phone
      FROM Orders o
      JOIN Restaurants r ON CAST(o.restaurant_id AS INTEGER) = r.restaurant_id
      WHERE o.order_id = $1
    `;
    const result = await pool.query(query, [req.params.id]);
    
    if (result.rows.length === 0) return res.status(404).json({ error: "Order not found." });
    
    const order = result.rows[0];
    const foodTotal = parseFloat((order.total_amount - order.rider_payout - 5 - (order.total_amount * 0.05)).toFixed(2));
    const platformFee = 5.00;
    const taxAmount = parseFloat((order.total_amount * 0.05).toFixed(2));

    res.status(200).json({
      bill_no: `BTEE-${String(order.order_id).padStart(5, '0')}`,
      date: order.created_at,
      restaurant: { name: order.restaurant_name, address: order.restaurant_address, phone: order.restaurant_phone },
      customer: { name: order.customer_name, address: order.delivery_address },
      items: typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json,
      financials: { gross_total: order.total_amount, rider_fee: order.rider_payout, platform_fee: platformFee, taxes: taxAmount, restaurant_net_payout: foodTotal },
      payment_method: order.payment_method
    });
  } catch (error) { 
    res.status(500).json({ error: "Failed to generate bill." }); 
  }
});

// ==========================================
// 5. RIDER DISPATCH ALGORITHM 
// ==========================================
app.get('/api/rider/orders/available', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const query = `
      SELECT o.order_id, o.customer_name, o.total_amount, o.status, 
             o.delivery_distance_km, o.rider_payout, o.rest_otp, o.cust_otp, o.cust_lat, o.cust_lng,
             r.restaurant_id, r.restaurant_name, r.lat as rest_lat, r.lng as rest_lng 
      FROM Orders o
      JOIN Restaurants r ON CAST(o.restaurant_id AS INTEGER) = r.restaurant_id
      WHERE o.status IN ('PREPARING', 'READY FOR PICKUP')
    `;
    const result = await pool.query(query);
    let availableOrders = result.rows;

    if (lat && lng) {
      const riderLat = parseFloat(lat);
      const riderLng = parseFloat(lng);
      
      availableOrders = availableOrders.filter(order => {
        const restLat = parseFloat(order.rest_lat) || 17.4400; 
        const restLng = parseFloat(order.rest_lng) || 78.3800;
        const R = 6371; 
        const dLat = (restLat - riderLat) * Math.PI / 180;
        const dLng = (restLng - riderLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(riderLat * Math.PI / 180) * Math.cos(restLat * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2);
        const distance = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
        
        order.pickup_distance_km = distance.toFixed(1); 
        return distance <= 50.0;
      });
    }
    res.status(200).json(availableOrders.slice(0, 5));
  } catch (error) { 
    res.status(500).json({ error: "Failed to fetch orders." }); 
  }
});

app.put('/api/rider/orders/:id/accept', async (req, res) => {
  try {
    await pool.query("UPDATE Orders SET status = 'EN ROUTE', rider_id = $1 WHERE order_id = $2", [req.body.riderId || '1', req.params.id]);
    res.status(200).json({ message: "Order accepted!" });
  } catch (error) { 
    res.status(500).json({ error: "Failed to accept order." }); 
  }
});

app.put('/api/rider/orders/:id/complete', async (req, res) => {
  try {
    const orderId = req.params.id;
    const orderQuery = await pool.query("SELECT * FROM Orders WHERE order_id = $1", [orderId]);
    
    if (orderQuery.rows.length === 0) return res.status(404).json({ error: "Order not found." });
    const order = orderQuery.rows[0];

    if (order.payment_method === 'UPI' && order.payment_id && order.payment_id !== 'COD') {
      const restaurantAccountId = "acc_Rest123_Placeholder"; 
      const deliveryPartnerId = "acc_Rider456_Placeholder";  
      const foodTotal = order.total_amount - order.rider_payout - 5 - (order.total_amount * 0.05); 
      
      try {
        await razorpay.payments.transfer(order.payment_id, {
          transfers: [
            { account: restaurantAccountId, amount: Math.round(foodTotal * 100), currency: "INR" },
            { account: deliveryPartnerId, amount: Math.round(order.rider_payout * 100), currency: "INR" }
          ]
        });
      } catch (rzpErr) { 
        console.error("Razorpay Notice:", rzpErr.error?.description || rzpErr); 
      }
    }

    await pool.query("UPDATE Orders SET status = 'DELIVERED' WHERE order_id = $1", [orderId]);
    const foodTotal = parseFloat((order.total_amount - order.rider_payout - 5 - (order.total_amount * 0.05)).toFixed(2)); 

    await pool.query("INSERT INTO Wallets (restaurant_id, balance) VALUES ($1, 0) ON CONFLICT DO NOTHING", [order.restaurant_id]);
    await pool.query("UPDATE Wallets SET balance = balance + $1 WHERE restaurant_id = $2", [foodTotal, order.restaurant_id]);
    await pool.query("INSERT INTO WalletTransactions (restaurant_id, order_id, amount, type) VALUES ($1, $2, $3, 'CREDIT')", [order.restaurant_id, orderId, foodTotal]);

    // 🚀 UPGRADED: Notify Customer of Delivery
    const userQuery = await pool.query("SELECT push_token FROM Users WHERE full_name = $1", [order.customer_name]);
    if (userQuery.rows[0]?.push_token) {
      await sendPushNotification(userQuery.rows[0].push_token, "Delivered! 🎉", "Your food has arrived. Enjoy your meal!");
    }

    res.status(200).json({ message: "Delivery completed!" });
  } catch (error) { 
    res.status(500).json({ error: "Failed to complete delivery." }); 
  }
});

app.get('/api/rider/:riderId/earnings', async (req, res) => {
  try {
    const query = `SELECT COUNT(order_id) as total_deliveries, SUM(rider_payout) as total_earnings FROM Orders WHERE rider_id = $1 AND status = 'DELIVERED'`;
    const result = await pool.query(query, [req.params.riderId]);
    res.status(200).json({ deliveries: result.rows[0].total_deliveries || 0, earnings: result.rows[0].total_earnings || 0 });
  } catch (error) { 
    res.status(500).json({ error: "Failed to fetch earnings." }); 
  }
});

const PORT = process.env.PORT || 5000;

// ==========================================
// 6. ADMIN "GOD MODE" ENDPOINTS
// ==========================================
app.get('/api/admin/stats', async (req, res) => {
  try {
    const revQuery = await pool.query("SELECT SUM(total_amount) as revenue, COUNT(order_id) as total_orders FROM Orders WHERE status = 'DELIVERED'");
    const activeRestQuery = await pool.query("SELECT COUNT(*) FROM Restaurants WHERE is_online = TRUE");
    res.status(200).json({ 
      revenue: revQuery.rows[0].revenue || 0, 
      totalOrders: revQuery.rows[0].total_orders || 0, 
      activeRestaurants: activeRestQuery.rows[0].count || 0 
    });
  } catch (error) { 
    res.status(500).json({ error: "Failed to fetch admin stats." }); 
  }
});

app.get('/api/admin/all-orders', async (req, res) => {
  try {
    const query = `
      SELECT o.order_id, o.customer_name, o.total_amount, o.status, r.restaurant_name 
      FROM Orders o 
      JOIN Restaurants r ON CAST(o.restaurant_id AS INTEGER) = r.restaurant_id 
      ORDER BY o.created_at DESC LIMIT 50
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) { 
    res.status(500).json({ error: "Failed to fetch platform orders." }); 
  }
});

app.put('/api/admin/restaurants/:id/approve', async (req, res) => {
  try {
    const updateQuery = `UPDATE Restaurants SET is_approved = TRUE WHERE restaurant_id = $1 RETURNING restaurant_name;`;
    const result = await pool.query(updateQuery, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Restaurant not found." });
    res.status(200).json({ message: `${result.rows[0].restaurant_name} has been approved!` });
  } catch (error) { 
    res.status(500).json({ error: "Failed to approve restaurant." }); 
  }
});

// ==========================================
// 🚀 AUTO-PATCH LIVE DATABASE 
// ==========================================
pool.query(`
  ALTER TABLE Orders ADD COLUMN IF NOT EXISTS payment_id VARCHAR(255);
  ALTER TABLE Orders ADD COLUMN IF NOT EXISTS delivery_address VARCHAR(500);
  ALTER TABLE Orders ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(10, 2);
  ALTER TABLE Orders ADD COLUMN IF NOT EXISTS tax_breakdown JSONB;
  ALTER TABLE Orders ADD COLUMN IF NOT EXISTS rider_payout NUMERIC(10, 2);
  ALTER TABLE Orders ADD COLUMN IF NOT EXISTS rest_otp VARCHAR(10);
  ALTER TABLE Orders ADD COLUMN IF NOT EXISTS cust_otp VARCHAR(10);
  ALTER TABLE Orders ADD COLUMN IF NOT EXISTS items_json JSONB;

  CREATE TABLE IF NOT EXISTS Wallets (
    restaurant_id VARCHAR(255) PRIMARY KEY,
    balance NUMERIC(10, 2) DEFAULT 0.00
  );
  
  CREATE TABLE IF NOT EXISTS WalletTransactions (
    transaction_id SERIAL PRIMARY KEY,
    restaurant_id VARCHAR(255),
    order_id VARCHAR(255),
    amount NUMERIC(10, 2),
    type VARCHAR(50), 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  ALTER TABLE Restaurants ADD COLUMN IF NOT EXISTS document_url VARCHAR(500);
  ALTER TABLE MenuItems ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;

  ALTER TABLE Restaurants ADD COLUMN IF NOT EXISTS restaurant_photos_url VARCHAR(500);
  ALTER TABLE Restaurants ADD COLUMN IF NOT EXISTS license_copy_url VARCHAR(500);
  ALTER TABLE Restaurants ADD COLUMN IF NOT EXISTS menu_copy_url VARCHAR(500);
  ALTER TABLE Restaurants ADD COLUMN IF NOT EXISTS pan_copy_url VARCHAR(500);
  ALTER TABLE Restaurants ADD COLUMN IF NOT EXISTS aadhaar_copy_url VARCHAR(500);
  ALTER TABLE Restaurants ADD COLUMN IF NOT EXISTS udyam_cert_url VARCHAR(500);
  ALTER TABLE Restaurants ADD COLUMN IF NOT EXISTS gst_copy_url VARCHAR(500);

  CREATE TABLE IF NOT EXISTS SupportRequests (
    ticket_id SERIAL PRIMARY KEY,
    order_id VARCHAR(255),
    customer_name VARCHAR(255),
    request_type VARCHAR(50), 
    reason VARCHAR(255),
    description TEXT,
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- 🚀 PHASE 7: PUSH NOTIFICATION TOKENS
  ALTER TABLE Users ADD COLUMN IF NOT EXISTS push_token VARCHAR(255);
  ALTER TABLE Restaurants ADD COLUMN IF NOT EXISTS push_token VARCHAR(255);
  ALTER TABLE Riders ADD COLUMN IF NOT EXISTS push_token VARCHAR(255);

`).then(() => console.log("✅ Live Database patched successfully!"))
  .catch(err => console.log("Database patch note:", err.message));

app.listen(PORT, () => { console.log(`🚀 Bitee Backend running on port ${PORT}`); });