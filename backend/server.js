const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// 1. Izinkan akses CORS agar aplikasi HP/Browser bisa terhubung
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 2. Setup Koneksi Database PostgreSQL (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 3. Setup Multer (Untuk Menampung Foto Absensi)
const upload = multer({ storage: multer.memoryStorage() });

// -------------------------------------------------------------
// ENDPOINT 1: Ambil Data Master (Armada, AMT, & Tujuan)
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
// ENDPOINT 2: AMT Mulai Perjalanan (Keberangkatan + GPS)
// -------------------------------------------------------------
app.post('/api/trips/start', upload.single('photo'), async (req, res) => {
  const { vehicle_id, amt1_id, amt2_id, destination_name, start_gps } = req.body;

  try {
    // Simpan data trip ke database
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

    // Ubah status kendaraan menjadi IN_USE (Sedang Berjalan)
    await pool.query("UPDATE vehicles SET status = 'IN_USE' WHERE vehicle_id = $1", [vehicle_id]);

    res.json({ message: 'Perjalanan berhasil dimulai!', trip: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memulai perjalanan' });
  }
});

// -------------------------------------------------------------
// ENDPOINT 3: AMT Selesaikan Perjalanan (Kedatangan + GPS)
// -------------------------------------------------------------
app.post('/api/trips/end', upload.single('photo'), async (req, res) => {
  const { trip_id, vehicle_id, end_gps } = req.body;

  try {
    // Update data trip saat tiba di lokasi
    const query = `
      UPDATE trips 
      SET end_time = NOW(), end_gps = $1, status = 'COMPLETED'
      WHERE trip_id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [end_gps, trip_id]);

    // Kembalikan status kendaraan menjadi AVAILABLE (Siap Jalan Lagi)
    await pool.query("UPDATE vehicles SET status = 'AVAILABLE' WHERE vehicle_id = $1", [vehicle_id]);

    res.json({ message: 'Perjalanan selesai. Logbook tercatat!', trip: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengakhiri perjalanan' });
  }
});

// -------------------------------------------------------------
// ENDPOINT 4: Laporan Kepatuhan KBLI 49232 (Untuk Manager/Admin)
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

// Jalankan Server pada Port 5000
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`Server E-Logbook PT Bintang Agung Prima Berjalan!`);
  console.log(`Port: ${PORT}`);
  console.log(`=================================================`);
});