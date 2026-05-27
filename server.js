// bitee-backend/server.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt'); 
const pool = require('./db'); 

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 1. AUTHENTICATION (ALL 3 USERS)
// ==========================================
// Customer Auth
app.post('/api/register', async (req, res) => {
  try {
    const { fullName, dob, email, phone, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const insertQuery = `INSERT INTO Users (full_name, dob, email, phone, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, full_name, email;`;
    const newUser = await pool.query(insertQuery, [fullName, dob, email, phone, passwordHash]);
    res.status(201).json({ message: "User registered successfully!", user: newUser.rows[0] });
  } catch (error) { res.status(500).json({ error: "Server error during registration." }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const userQuery = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);
    if (userQuery.rows.length === 0) return res.status(400).json({ error: "User not found." });
    const validPassword = await bcrypt.compare(password, userQuery.rows[0].password_hash);
    if (!validPassword) return res.status(400).json({ error: "Incorrect password." });
    res.status(200).json({ message: "Login successful!", user: { id: userQuery.rows[0].user_id, fullName: userQuery.rows[0].full_name }});
  } catch (error) { res.status(500).json({ error: "Server error during login." }); }
});

// Partner Auth
app.post('/api/partner/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const restQuery = await pool.query('SELECT * FROM Restaurants WHERE email = $1', [email]);
    if (restQuery.rows.length === 0) return res.status(400).json({ error: "Restaurant not found." });
    const restaurant = restQuery.rows[0];
    const validPassword = await bcrypt.compare(password, restaurant.password_hash);
    if (!validPassword) return res.status(400).json({ error: "Incorrect password." });
    res.status(200).json({ message: "Login successful!", restaurant: { id: restaurant.restaurant_id, name: restaurant.restaurant_name, isOnline: restaurant.is_online }});
  } catch (error) { res.status(500).json({ error: "Server error during partner login." }); }
});

// Rider Auth
app.post('/api/rider/register', async (req, res) => {
  try {
    const { fullName, phone, email, password, vehicleType, vehicleNumber } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const insertQuery = `INSERT INTO Riders (full_name, phone, email, password_hash, vehicle_type, vehicle_number, is_approved) VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING rider_id, full_name;`;
    const newRider = await pool.query(insertQuery, [fullName, phone, email, passwordHash, vehicleType, vehicleNumber]);
    res.status(201).json({ message: "Rider registered successfully!", rider: newRider.rows[0] });
  } catch (error) { res.status(500).json({ error: "Server error during rider registration." }); }
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
  } catch (error) { res.status(500).json({ error: "Server error during rider login." }); }
});

// ==========================================
// 2. MENU ENGINE (RESTORED!)
// ==========================================
app.post('/api/menu', async (req, res) => {
  try {
    const { restaurantId, name, price, description, isVeg, imageUrl } = req.body;
    const insertQuery = `INSERT INTO MenuItems (restaurant_id, name, price, description, is_veg, image_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;`;
    const newItem = await pool.query(insertQuery, [restaurantId, name, price, description, isVeg, imageUrl || 'default_food.jpg']);
    res.status(201).json({ message: "Menu item added!", item: newItem.rows[0] });
  } catch (error) { res.status(500).json({ error: "Server error while adding item." }); }
});

app.get('/api/menu/:restaurantId', async (req, res) => {
  try {
    const menuQuery = await pool.query('SELECT * FROM MenuItems WHERE restaurant_id = $1 ORDER BY created_at DESC', [req.params.restaurantId]);
    const formattedMenu = menuQuery.rows.map(item => ({
      id: item.item_id, name: item.name, price: `₹${item.price}`, desc: item.description, veg: item.is_veg, image: item.image_url
    }));
    res.json(formattedMenu);
  } catch (error) { res.status(500).json({ error: "Error fetching menu." }); }
});

// ==========================================
// 3. RESTAURANT DASHBOARD & ORDER MANAGEMENT
// ==========================================
app.put('/api/restaurant/:id/toggle-online', async (req, res) => {
  try {
    await pool.query('UPDATE Restaurants SET is_online = $1 WHERE restaurant_id = $2', [req.body.isOnline, req.params.id]);
    res.status(200).json({ message: `Updated!` });
  } catch (error) { res.status(500).json({ error: "Error toggling status." }); }
});

app.get('/api/restaurants', async (req, res) => {
  try {
    const query = `SELECT restaurant_id as id, restaurant_name as name, restaurant_address as distance, timings as time FROM Restaurants WHERE is_approved = TRUE AND is_online = TRUE`;
    const activeRestaurants = await pool.query(query);
    const formattedData = activeRestaurants.rows.map(r => ({ ...r, cuisine: 'Various Options', rating: 4.8, image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=500&auto=format&fit=crop&q=60' }));
    res.json(formattedData);
  } catch (error) { res.status(500).json({ error: "Error fetching restaurants." }); }
});

app.get('/api/restaurant/orders/:restaurantId/live', async (req, res) => {
  try {
    const ordersQuery = await pool.query("SELECT * FROM Orders WHERE status IN ('PENDING', 'PREPARING') AND restaurant_id = $1 ORDER BY created_at ASC", [req.params.restaurantId]);
    res.status(200).json(ordersQuery.rows);
  } catch (error) { res.status(500).json({ error: "Error fetching live orders." }); }
});

// RESTORED HISTORY ENDPOINT
app.get('/api/restaurant/orders/:restaurantId/history', async (req, res) => {
  try {
    const ordersQuery = await pool.query("SELECT * FROM Orders WHERE status IN ('READY FOR PICKUP', 'DELIVERED', 'REJECTED') AND restaurant_id = $1 ORDER BY created_at DESC", [req.params.restaurantId]);
    res.status(200).json(ordersQuery.rows);
  } catch (error) { res.status(500).json({ error: "Error fetching order history." }); }
});

app.put('/api/orders/:id/status', async (req, res) => {
  try {
    await pool.query('UPDATE Orders SET status = $1 WHERE order_id = $2', [req.body.status, req.params.id]);
    res.status(200).json({ message: `Order marked as ${req.body.status}!` });
  } catch (error) { res.status(500).json({ error: "Error updating status." }); }
});

// RESTORED REJECT ENDPOINT
app.put('/api/orders/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    await pool.query('UPDATE Orders SET status = $1, rejection_reason = $2 WHERE order_id = $3', ['REJECTED', reason, req.params.id]);
    res.status(200).json({ message: `Order rejected.` });
  } catch (error) { res.status(500).json({ error: "Error rejecting order." }); }
});

// ==========================================
// 4. CUSTOMER CHECKOUT (OTPs)
// ==========================================
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, totalAmount, paymentMethod, items, restaurantId } = req.body;
    const itemsJson = JSON.stringify(items);

    const restOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const custOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const mockDeliveryDistance = (Math.random() * 8 + 2).toFixed(1);
    const riderPayout = (mockDeliveryDistance * 21).toFixed(2);

    const insertQuery = `
      INSERT INTO Orders (customer_name, total_amount, payment_method, items_json, restaurant_id, delivery_distance_km, rider_payout, rest_otp, cust_otp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING order_id, status;
    `;
    const newOrder = await pool.query(insertQuery, [customerName, totalAmount, paymentMethod, itemsJson, restaurantId || '1', mockDeliveryDistance, riderPayout, restOtp, custOtp]);

    res.status(201).json({ message: "Order saved!", order: newOrder.rows[0] });
  } catch (error) { res.status(500).json({ error: "Server error while saving order." }); }
});

app.get('/api/orders', async (req, res) => {
  try {
    const ordersQuery = await pool.query("SELECT * FROM Orders ORDER BY order_id DESC");
    res.status(200).json(ordersQuery.rows);
  } catch (error) { res.status(500).json({ error: "Failed to fetch orders." }); }
});

app.get('/api/orders/:id/track', async (req, res) => {
  try {
    const query = "SELECT status, total_amount FROM Orders WHERE order_id = $1";
    const result = await pool.query(query, [req.params.id]);
    res.status(200).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: "Failed to track order." }); }
});

// ==========================================
// 5. RIDER DISPATCH ALGORITHM & LOGISTICS
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
        return distance <= 50.0; // 50km for testing
      });
    }

    res.status(200).json(availableOrders.slice(0, 5));
  } catch (error) { res.status(500).json({ error: "Failed to fetch orders." }); }
});

app.put('/api/rider/orders/:id/accept', async (req, res) => {
  try {
    await pool.query("UPDATE Orders SET status = 'EN ROUTE', rider_id = $1 WHERE order_id = $2", [req.body.riderId || '1', req.params.id]);
    res.status(200).json({ message: "Order accepted!" });
  } catch (error) { res.status(500).json({ error: "Failed to accept order." }); }
});

app.put('/api/rider/orders/:id/complete', async (req, res) => {
  try {
    await pool.query("UPDATE Orders SET status = 'DELIVERED' WHERE order_id = $1", [req.params.id]);
    res.status(200).json({ message: "Delivery completed!" });
  } catch (error) { res.status(500).json({ error: "Failed to complete delivery." }); }
});

app.get('/api/rider/:riderId/earnings', async (req, res) => {
  try {
    const query = `
      SELECT COUNT(order_id) as total_deliveries, SUM(rider_payout) as total_earnings 
      FROM Orders WHERE rider_id = $1 AND status = 'DELIVERED'
    `;
    const result = await pool.query(query, [req.params.riderId]);
    res.status(200).json({
      deliveries: result.rows[0].total_deliveries || 0,
      earnings: result.rows[0].total_earnings || 0
    });
  } catch (error) { res.status(500).json({ error: "Failed to fetch earnings." }); }
});

const PORT = process.env.PORT || 5000;

// ==========================================
// 6. ADMIN "GOD MODE" ENDPOINTS
// ==========================================

// Get Platform Analytics
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

// Get Every Live Order on the Platform
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

app.listen(PORT, () => { console.log(`🚀 Bitee Backend running on port ${PORT}`); });