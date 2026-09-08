const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const https = require('https');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Database Connection (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Helper Function: Send WhatsApp Message via Fonnte API
function sendWhatsAppNotification(message) {
  const token = process.env.WA_API_TOKEN;
  const target = process.env.WA_TARGET_PHONE;

  if (!token || !target) {
    console.log('WA Notification skipped: WA_API_TOKEN or WA_TARGET_PHONE is not set.');
    return;
  }

  const postData = JSON.stringify({
    target: target,
    message: message
  });

  const options = {
    hostname: 'api.fonnte.com',
    path: '/send',
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log('Fonnte Response:', data);
    });
  });

  req.on('error', (e) => {
    console.error('Fonnte Request Error:', e.message);
  });

  req.write(postData);
  req.end();
}

// =================================================================
// 1. AUTHENTICATION & LOGIN
// =================================================================

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
  }

  // Admin / Manager Login Check
  if (username === 'admin' && password === 'admin123') {
    return res.json({
      success: true,
      role: 'admin',
      user: { id: 0, name: 'Manager Operasional', username: 'admin' }
    });
  }

  // Driver / AMT Login Check from Supabase Database
  try {
    const result = await pool.query(
      'SELECT * FROM drivers WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      const driver = result.rows[0];
      return res.json({
        success: true,
        role: 'driver',
        user: { id: driver.driver_id || driver.id, name: driver.name, username: driver.username }
      });
    } else {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
  } catch (err) {
    console.error('Login Database Error:', err.message);
    return res.status(500).json({ success: false, message: 'Gagal terhubung ke database', error: err.message });
  }
});

// =================================================================
// 2. MASTER DATA: DRIVERS (AMT / SOPIR)
// =================================================================

// Get All Drivers
app.get(['/api/drivers', '/api/master/drivers'], async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM drivers ORDER BY name ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Get Drivers Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add New Driver
app.post(['/api/drivers', '/api/master/drivers'], async (req, res) => {
  const { name, username, password } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ success: false, message: 'Data nama, username, dan password wajib diisi' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO drivers (name, username, password) VALUES ($1, $2, $3) RETURNING *',
      [name, username, password]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error insert driver:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete Driver
app.delete(['/api/drivers/:id', '/api/master/drivers/:id'], async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM drivers WHERE driver_id = $1 OR id = $1', [id]);
    res.json({ success: true, message: 'Driver berhasil dihapus' });
  } catch (err) {
    console.error('Delete Driver Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =================================================================
// 3. MASTER DATA: TRUCKS (ARMADA TANGKI)
// =================================================================

// Get All Trucks
app.get(['/api/trucks', '/api/master/trucks'], async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM trucks ORDER BY plate_number ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Get Trucks Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add New Truck
app.post(['/api/trucks', '/api/master/trucks'], async (req, res) => {
  const { plate_number, capacity } = req.body;

  if (!plate_number || !capacity) {
    return res.status(400).json({ success: false, message: 'Plat nomor dan kapasitas wajib diisi' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO trucks (plate_number, capacity) VALUES ($1, $2) RETURNING *',
      [plate_number, capacity]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Error insert truck:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =================================================================
// 4. TRIPS & LOGBOOK MANAGEMENT (START & END TRIP)
// =================================================================

// Get All Trip Logs (For Admin Dashboard)
app.get('/api/trips', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM trips ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Get Trips Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Start Trip (Mulai Perjalanan)
app.post('/api/trips/start', async (req, res) => {
  const { driver_name, plate_number, fuel_type, volume, destination, notes, latitude, longitude, photo_url } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO trips 
       (driver_name, plate_number, fuel_type, volume, destination, notes, start_lat, start_lng, start_photo, status, start_time) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'IN_PROGRESS', NOW()) 
       RETURNING *`,
      [driver_name, plate_number, fuel_type, volume, destination, notes, latitude, longitude, photo_url]
    );

    const trip = result.rows[0];
    const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

    // Format & Kirim Pesan WA
    const waMessage = 
`🚀 *E-LOGBOOK BAP: MULAI PERJALANAN*
----------------------------------------
*Driver/AMT:* ${driver_name}
*Armada:* ${plate_number}
*Muatan:* ${fuel_type} (${volume} KL)
*Tujuan:* ${destination}
*Catatan:* ${notes || '-'}
*Lokasi GPS:* ${mapUrl}
----------------------------------------
_Status: Dalam Perjalanan (IN_PROGRESS)_`;

    sendWhatsAppNotification(waMessage);

    res.json({ success: true, data: trip });
  } catch (err) {
    console.error('Start Trip Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// End Trip (Tiba / Selesai Perjalanan)
app.post('/api/trips/end', async (req, res) => {
  const { trip_id, end_notes, latitude, longitude, photo_url } = req.body;

  try {
    const result = await pool.query(
      `UPDATE trips 
       SET status = 'COMPLETED', end_time = NOW(), end_lat = $1, end_lng = $2, end_photo = $3, end_notes = $4 
       WHERE trip_id = $5 
       RETURNING *`,
      [latitude, longitude, photo_url, end_notes, trip_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data perjalanan tidak ditemukan' });
    }

    const trip = result.rows[0];
    const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

    // Format & Kirim Pesan WA
    const waMessage = 
`🛑 *E-LOGBOOK BAP: SELESAI PERJALANAN*
----------------------------------------
*Driver/AMT:* ${trip.driver_name}
*Armada:* ${trip.plate_number}
*Tujuan:* ${trip.destination}
*Catatan Kedatangan:* ${end_notes || '-'}
*Lokasi Tiba:* ${mapUrl}
----------------------------------------
_Status: Selesai (COMPLETED)_`;

    sendWhatsAppNotification(waMessage);

    res.json({ success: true, data: trip });
  } catch (err) {
    console.error('End Trip Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Root Health Check Route
app.get('/api', (req, res) => {
  res.json({ success: true, message: 'E-Logbook BAP API is running smoothly' });
});

// Export App for Vercel Serverless
module.exports = app;
