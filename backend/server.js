const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// 1. Izinkan Akses CORS & Parsing JSON
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 2. Setup Koneksi Database PostgreSQL (Supabase Pooler)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 3. Setup Multer (Untuk Menampung Foto Absensi)
const upload = multer({ storage: multer.memoryStorage() });

// -------------------------------------------------------------
// ENDPOINT 1: LOGIN (DRIVERS / AMT & ADMIN)
// -------------------------------------------------------------
app.post('/api/login', async (req, res) => {
  const { username, password, role } = req.body; // role: 'driver' atau 'admin'

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
    res.status(500).json({ error: 'Gagal melakukan proses login' });
  }
});

// -------------------------------------------------------------
// ENDPOINT 2: AMBIL DATA MASTER (ALL VEHICLES, DRIVERS, DESTINATIONS)
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
    res.status(500).json({ error: 'Gagal mengambil data master' });
  }
});

// -------------------------------------------------------------
// ENDPOINT 3: AMT MULAI PERJALANAN (KEBERANGKATAN + GPS)
// -------------------------------------------------------------
app.post('/api/trips/start', upload.single('photo'), async (req, res) => {
  const { vehicle_id, amt1_id, amt2_id, destination_name, start_gps } = req.body;

  try {
    const query = `
      INSERT INTO trips (vehicle_id, amt1_id, amt2_id, destination_name, start_time, start_gps, status)
      VALUES ($1, $2, $3, $4, NOW(), $5, 'IN_PROGRESS')
      RETURNING *;
    `;
    const values = [
      vehicle_id, 
      amt1_id, 
      amt2_id && amt2_id !== '' ? amt2_id : null, 
      destination_name, 
      start_gps
    ];
    
    const result = await pool.query(query, values);

    // Update status kendaraan menjadi IN_USE
    await pool.query("UPDATE vehicles SET status = 'IN_USE' WHERE vehicle_id = $1", [vehicle_id]);

    res.json({ message: 'Perjalanan berhasil dimulai!', trip: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memulai perjalanan' });
  }
});

// -------------------------------------------------------------
// ENDPOINT 4: AMT SELESAIKAN PERJALANAN (KEDATANGAN + GPS)
// -------------------------------------------------------------
app.post('/api/trips/end', upload.single('photo'), async (req, res) => {
  const { trip_id, vehicle_id, end_gps } = req.body;

  try {
    const query = `
      UPDATE trips 
      SET end_time = NOW(), end_gps = $1, status = 'COMPLETED'
      WHERE trip_id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [end_gps, trip_id]);

    // Kembalikan status kendaraan menjadi AVAILABLE
    await pool.query("UPDATE vehicles SET status = 'AVAILABLE' WHERE vehicle_id = $1", [vehicle_id]);

    res.json({ message: 'Perjalanan selesai. Logbook tercatat!', trip: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengakhiri perjalanan' });
  }
});

// -------------------------------------------------------------
// ENDPOINT 5: LAPORAN REKAP LOGBOOK (MANAGER / ADMIN)
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
// ENDPOINT 6: CRUD MASTER DRIVERS (MANAJEMEN AMT)
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
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah driver AMT' });
  }
});

app.delete('/api/master/drivers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM drivers WHERE driver_id = $1', [req.params.id]);
    res.json({ message: 'Driver berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus driver' });
  }
});

// -------------------------------------------------------------
// ENDPOINT 7: CRUD MASTER VEHICLES (MANAJEMEN ARMADA)
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
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah armada' });
  }
});

app.delete('/api/master/vehicles/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM vehicles WHERE vehicle_id = $1', [req.params.id]);
    res.json({ message: 'Armada berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus armada' });
  }
});

// -------------------------------------------------------------
// ENDPOINT 8: CRUD MASTER DESTINATIONS (MANAJEMEN TUJUAN)
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
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah lokasi tujuan' });
  }
});

app.delete('/api/master/destinations/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM destinations WHERE destination_id = $1', [req.params.id]);
    res.json({ message: 'Lokasi tujuan berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus lokasi tujuan' });
  }
});

// Jalankan Server pada Port 5000 (atau Port Vercel/Render)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`Server E-Logbook PT Bintang Agung Prima Berjalan!`);
  console.log(`Port: ${PORT}`);
  console.log(`=================================================`);
});
