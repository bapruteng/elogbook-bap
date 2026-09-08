const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const https = require('https');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    req.url = req.url.replace('/api', '') || '/';
  }
  next();
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function sendWhatsAppNotification(message) {
  const token = process.env.WA_API_TOKEN;
  const target = process.env.WA_TARGET_PHONE;

  if (!token || !target) return;

  const postData = JSON.stringify({ target: target, message: message });
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
  });
  req.on('error', (e) => console.error('Fonnte Error:', e.message));
  req.write(postData);
  req.end();
}

// 1. AUTHENTICATION & LOGIN
app.post(['/login', '/auth/login'], async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
  }

  if (username === 'admin' && password === 'admin123') {
    return res.json({
      success: true,
      role: 'admin',
      user: { id: 0, name: 'Manager Operasional', username: 'admin' }
    });
  }

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
        user: { 
          id: driver.driver_id || driver.id, 
          driver_id: driver.driver_id || driver.id,
          name: driver.name, 
          username: driver.username
        }
      });
    } else {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Gagal terhubung ke database', error: err.message });
  }
});

// 2. MASTER DATA: DRIVERS
app.get(['/drivers', '/master/drivers'], async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM drivers ORDER BY driver_id ASC');
    res.json(result.rows.map(d => ({ ...d, id: d.driver_id })));
  } catch (err) {
    res.json([]);
  }
});

app.post(['/drivers', '/master/drivers'], async (req, res) => {
  const { name, username, password } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO drivers (name, username, password) VALUES ($1, $2, $3) RETURNING *',
      [name, username, password]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete(['/drivers/:id', '/master/drivers/:id'], async (req, res) => {
  try {
    await pool.query('DELETE FROM drivers WHERE driver_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. MASTER DATA: VEHICLES
app.get(['/vehicles', '/trucks', '/master/vehicles'], async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM vehicles ORDER BY plate_number ASC');
    res.json(result.rows.map(v => ({ ...v, id: v.vehicle_id })));
  } catch (err) {
    res.json([]);
  }
});

app.post(['/vehicles', '/trucks', '/master/vehicles'], async (req, res) => {
  const { plate_number, brand, capacity, compartment } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO vehicles (plate_number, brand, capacity, compartment) VALUES ($1, $2, $3, $4) RETURNING *',
      [plate_number, brand || 'Mitsubishi', capacity || 8, compartment || '8 KL']
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete(['/vehicles/:id', '/trucks/:id'], async (req, res) => {
  try {
    await pool.query('DELETE FROM vehicles WHERE vehicle_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. MASTER DATA: DESTINATIONS
app.get(['/destinations', '/master/destinations'], async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM destinations ORDER BY destination_id ASC');
    res.json(result.rows.map(d => ({ ...d, id: d.destination_id })));
  } catch (err) {
    res.json([]);
  }
});

app.post(['/destinations', '/master/destinations'], async (req, res) => {
  const { location_name } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO destinations (location_name) VALUES ($1) RETURNING *',
      [location_name]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete(['/destinations/:id', '/master/destinations/:id'], async (req, res) => {
  try {
    await pool.query('DELETE FROM destinations WHERE destination_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. TRIPS LOGBOOK (JOIN LENGKAP DENGAN TABEL DRIVERS & VEHICLES)
app.get(['/trips', '/reports'], async (req, res) => {
  try {
    const { start_date, end_date, vehicle_id } = req.query;

    let queryText = `
      SELECT 
        t.*,
        v.plate_number,
        d1.name AS amt1_name,
        d2.name AS amt2_name
      FROM trips t
      LEFT JOIN vehicles v ON t.vehicle_id = v.vehicle_id
      LEFT JOIN drivers d1 ON t.amt1_id = d1.driver_id
      LEFT JOIN drivers d2 ON t.amt2_id = d2.driver_id
      WHERE 1=1
    `;
    const queryParams = [];

    if (start_date && start_date.trim() !== '') {
      queryParams.push(start_date.trim());
      queryText += ` AND t.start_time >= $${queryParams.length}::timestamp`;
    }

    if (end_date && end_date.trim() !== '') {
      queryParams.push(`${end_date.trim()} 23:59:59`);
      queryText += ` AND t.start_time <= $${queryParams.length}::timestamp`;
    }

    if (vehicle_id && vehicle_id.trim() !== '') {
      queryParams.push(parseInt(vehicle_id));
      queryText += ` AND t.vehicle_id = $${queryParams.length}`;
    }

    queryText += ' ORDER BY t.trip_id DESC';

    const result = await pool.query(queryText, queryParams);
    res.json(result.rows);
  } catch (err) {
    console.error('Get Trips Error:', err.message);
    res.json([]);
  }
});

// START TRIP (INSERT SESUAI KOLOM TABEL PUBLIC.TRIPS)
app.post(['/trips/start', '/start-trip'], async (req, res) => {
  try {
    const { 
      vehicle_id, amt1_id, amt2_id, 
      destination_name, customer_name, 
      fuel_type, fuel_volume, notes, 
      start_gps, photo_base64 
    } = req.body;

    const result = await pool.query(
      `INSERT INTO trips 
       (vehicle_id, amt1_id, amt2_id, destination_name, customer_name, fuel_type, fuel_volume, notes, start_gps, start_photo, status, start_time) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'IN_PROGRESS', NOW()) 
       RETURNING *`,
      [
        vehicle_id ? parseInt(vehicle_id) : null,
        amt1_id ? parseInt(amt1_id) : null,
        amt2_id ? parseInt(amt2_id) : null,
        destination_name,
        customer_name || destination_name,
        fuel_type || 'Biosolar',
        fuel_volume ? parseFloat(fuel_volume) : 8,
        notes || '',
        start_gps || null,
        photo_base64 || null
      ]
    );

    const trip = result.rows[0];

    try {
      if (start_gps) {
        const mapUrl = `https://www.google.com/maps?q=${start_gps}`;
        sendWhatsAppNotification(
`🚀 *E-LOGBOOK BAP: MULAI PERJALANAN*
----------------------------------------
*Tujuan:* ${destination_name}
*Konsumen:* ${customer_name || '-'}
*Muatan:* ${fuel_type} (${fuel_volume} KL)
*Lokasi GPS:* ${mapUrl}`
        );
      }
    } catch (waErr) {}

    res.json({ success: true, data: trip, trip: trip });
  } catch (err) {
    console.error('Start Trip Error:', err.message);
    res.status(500).json({ success: false, message: 'Gagal mencatat perjalanan: ' + err.message });
  }
});

// END TRIP (UPDATE SESUAI KOLOM TABEL PUBLIC.TRIPS)
app.post(['/trips/end', '/end-trip'], async (req, res) => {
  const { trip_id, end_gps, photo_base64, end_notes } = req.body;

  try {
    const result = await pool.query(
      `UPDATE trips 
       SET status = 'COMPLETED', end_time = NOW(), end_gps = $1, end_photo = $2, notes = COALESCE(NULLIF($3, ''), notes)
       WHERE trip_id = $4
       RETURNING *`,
      [end_gps || null, photo_base64 || null, end_notes || '', parseInt(trip_id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data perjalanan tidak ditemukan' });
    }

    const trip = result.rows[0];

    try {
      if (end_gps) {
        const mapUrl = `https://www.google.com/maps?q=${end_gps}`;
        sendWhatsAppNotification(
`🛑 *E-LOGBOOK BAP: SELESAI PERJALANAN*
----------------------------------------
*Tujuan:* ${trip.destination_name}
*Lokasi Tiba:* ${mapUrl}`
        );
      }
    } catch (waErr) {}

    res.json({ success: true, data: trip, trip: trip });
  } catch (err) {
    console.error('End Trip Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/trips/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM trips WHERE trip_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get(['/', '/health'], (req, res) => {
  res.json({ success: true, message: 'E-Logbook BAP API is running smoothly' });
});

module.exports = app;
