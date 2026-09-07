const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// 1. Middleware CORS & Parsing JSON
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 2. Setup Database PostgreSQL (Supabase Pooler)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 3. Setup Multer (Absensi Foto)
const upload = multer({ storage: multer.memoryStorage() });

// -------------------------------------------------------------
// ENDPOINT 1: LOGIN (AMT & ADMIN)
// -------------------------------------------------------------
app.post('/api/login', async (req, res) => {
  const { username, password, role } = req.body;

  try {
    if (role === 'admin') {
      const result = await pool.query(
        'SELECT * FROM admin_users WHERE username = $1 AND password = $2', 
        [username, password]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Username/Password Admin salah!' });
      }
      return res.json({ success: true, role: 'admin', user: result.rows[0] });
    } else {
      const result = await pool.query(
        'SELECT * FROM drivers WHERE username = $1 AND password = $2', 
        [username, password]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Username/Password AMT salah!' });
      }
      return res.json({ success: true, role: 'driver', user: result.rows[0] });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal koneksi database atau query login!' });
  }
});

// -------------------------------------------------------------
// ENDPOINT 2: MASTER DATA ALL
// -------------------------------------------------------------
app.get('/api/master-data', async (req, res) => {
  try {
    const vehicles = await pool.query('SELECT * FROM vehicles ORDER BY plate_number ASC');
    const drivers = await pool.query('SELECT * FROM drivers ORDER BY name ASC');
    const destinations = await pool.query('SELECT * FROM destinations ORDER BY location_name ASC');

    res.json({
      vehicles: vehicles.rows,
      drivers: drivers.rows,
      destinations: destinations.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil master data' });
  }
});

// ENDPOINT START TRIP (DENGAN CATATAN/KENDALA)
app.post('/api/trips/start', upload.single('photo'), async (req, res) => {
  const { vehicle_id, amt1_id, amt2_id, destination_name, customer_name, fuel_type, fuel_volume, notes, start_gps, photo_base64 } = req.body;

  try {
    const query = `
      INSERT INTO trips (vehicle_id, amt1_id, amt2_id, destination_name, customer_name, fuel_type, fuel_volume, notes, start_time, start_gps, start_photo, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, 'IN_PROGRESS')
      RETURNING *;
    `;
    const values = [
      vehicle_id, 
      amt1_id, 
      amt2_id && amt2_id !== '' ? amt2_id : null, 
      destination_name,
      customer_name || destination_name,
      fuel_type || 'Biosolar',
      fuel_volume || 0,
      notes || null,
      start_gps,
      photo_base64 || null
    ];
    
    const result = await pool.query(query, values);
    await pool.query("UPDATE vehicles SET status = 'IN_USE' WHERE vehicle_id = $1", [vehicle_id]);

    res.json({ message: 'Perjalanan dimulai!', trip: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memulai perjalanan' });
  }
});

// ENDPOINT END TRIP (UPDATE CATATAN KEDATANGAN)
app.post('/api/trips/end', upload.single('photo'), async (req, res) => {
  const { trip_id, vehicle_id, end_gps, photo_base64, notes } = req.body;

  try {
    const query = `
      UPDATE trips 
      SET end_time = NOW(), end_gps = $1, end_photo = $2, notes = COALESCE(NULLIF($3, ''), notes), status = 'COMPLETED'
      WHERE trip_id = $4
      RETURNING *;
    `;
    const result = await pool.query(query, [end_gps, photo_base64 || null, notes || null, trip_id]);
    await pool.query("UPDATE vehicles SET status = 'AVAILABLE' WHERE vehicle_id = $1", [vehicle_id]);

    res.json({ message: 'Perjalanan selesai!', trip: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengakhiri perjalanan' });
  }
});

// ENDPOINT REPORTS DENGAN DYNAMIC FILTER (TANGGAL & ARMADA)
app.get('/api/reports', async (req, res) => {
  const { start_date, end_date, vehicle_id } = req.query;

  let whereClauses = [];
  let queryParams = [];

  if (start_date) {
    queryParams.push(start_date);
    whereClauses.push(`t.start_time >= $${queryParams.length}`);
  }
  if (end_date) {
    queryParams.push(`${end_date} 23:59:59`);
    whereClauses.push(`t.start_time <= $${queryParams.length}`);
  }
  if (vehicle_id) {
    queryParams.push(vehicle_id);
    whereClauses.push(`t.vehicle_id = $${queryParams.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  try {
    const query = `
      SELECT 
        t.trip_id,
        v.plate_number, v.brand, v.capacity, v.compartment,
        d1.name AS amt1_name,
        d2.name AS amt2_name,
        t.destination_name,
        t.customer_name,
        t.fuel_type,
        t.fuel_volume,
        t.notes,
        t.start_time, t.end_time,
        t.start_gps, t.end_gps,
        t.start_photo, t.end_photo,
        t.status
      FROM trips t
      JOIN vehicles v ON t.vehicle_id = v.vehicle_id
      JOIN drivers d1 ON t.amt1_id = d1.driver_id
      LEFT JOIN drivers d2 ON t.amt2_id = d2.driver_id
      ${whereSql}
      ORDER BY t.start_time DESC;
    `;
    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data laporan' });
  }
});

// -------------------------------------------------------------
// ENDPOINT 5: LAPORAN (ADMIN + LINK MAPS & FOTO)
// -------------------------------------------------------------
app.get('/api/reports', async (req, res) => {
  try {
    const query = `
      SELECT 
        t.trip_id,
        v.plate_number, v.brand, v.capacity, v.compartment,
        d1.name AS amt1_name,
        d2.name AS amt2_name,
        t.destination_name,
        t.start_time, t.end_time,
        t.start_gps, t.end_gps,
        t.start_photo, t.end_photo,
        t.status
      FROM trips t
      JOIN vehicles v ON t.vehicle_id = v.vehicle_id
      JOIN drivers d1 ON t.amt1_id = d1.driver_id
      LEFT JOIN drivers d2 ON t.amt2_id = d2.driver_id
      ORDER BY t.start_time DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data laporan' });
  }
});


// -------------------------------------------------------------
// ENDPOINT 6: CRUD DRIVERS
// -------------------------------------------------------------
app.post('/api/master/drivers', async (req, res) => {
  const { name, username, password } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO drivers (name, username, password) VALUES ($1, $2, $3) RETURNING *',
      [name, username, password || '123456']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Gagal menambah driver' });
  }
});

app.delete('/api/master/drivers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM drivers WHERE driver_id = $1', [req.params.id]);
    res.json({ message: 'Driver berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus driver' });
  }
});

// -------------------------------------------------------------
// ENDPOINT 7: CRUD VEHICLES
// -------------------------------------------------------------
app.post('/api/master/vehicles', async (req, res) => {
  const { plate_number, brand, capacity, compartment } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO vehicles (plate_number, brand, capacity, compartment, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [plate_number, brand, capacity, compartment, 'AVAILABLE']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Gagal menambah armada' });
  }
});

app.delete('/api/master/vehicles/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM vehicles WHERE vehicle_id = $1', [req.params.id]);
    res.json({ message: 'Armada berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus armada' });
  }
});

// -------------------------------------------------------------
// ENDPOINT 8: CRUD DESTINATIONS
// -------------------------------------------------------------
app.post('/api/master/destinations', async (req, res) => {
  const { location_name } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO destinations (location_name) VALUES ($1) RETURNING *',
      [location_name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Gagal menambah lokasi' });
  }
});

app.delete('/api/master/destinations/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM destinations WHERE destination_id = $1', [req.params.id]);
    res.json({ message: 'Lokasi berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus lokasi' });
  }
});

// -------------------------------------------------------------
// ENDPOINT EDIT MASTER DRIVER
// -------------------------------------------------------------
app.put('/api/master/drivers/:id', async (req, res) => {
  const { name, username, password } = req.body;
  try {
    const result = await pool.query(
      'UPDATE drivers SET name = $1, username = $2, password = $3 WHERE driver_id = $4 RETURNING *',
      [name, username, password, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Gagal merubah data driver' });
  }
});

// -------------------------------------------------------------
// ENDPOINT EDIT MASTER VEHICLE
// -------------------------------------------------------------
app.put('/api/master/vehicles/:id', async (req, res) => {
  const { plate_number, brand, capacity, compartment } = req.body;
  try {
    const result = await pool.query(
      'UPDATE vehicles SET plate_number = $1, brand = $2, capacity = $3, compartment = $4 WHERE vehicle_id = $5 RETURNING *',
      [plate_number, brand, capacity, compartment, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Gagal merubah data armada' });
  }
});

// -------------------------------------------------------------
// ENDPOINT EDIT MASTER DESTINATION
// -------------------------------------------------------------
app.put('/api/master/destinations/:id', async (req, res) => {
  const { location_name } = req.body;
  try {
    const result = await pool.query(
      'UPDATE destinations SET location_name = $1 WHERE destination_id = $2 RETURNING *',
      [location_name, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Gagal merubah data lokasi' });
  }
});

// Khusus Vercel Serverless Function: Ekspor app
module.exports = app;
