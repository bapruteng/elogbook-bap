const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const https = require('https');

const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // Limit 10MB

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// KONEKSI SUPABASE DATABASE
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// FUNGSI NOTIFIKASI FONNTE WA (MENGGUNAKAN HTTPS NODE.JS AMAN NO-CRASH)
const sendWANotif = (message) => {
  const targetPhone = process.env.WA_TARGET_PHONE;
  const waToken = process.env.WA_API_TOKEN;

  if (!waToken || !targetPhone) return;

  const data = JSON.stringify({
    target: targetPhone,
    message: message
  });

  const options = {
    hostname: 'api.fonnte.com',
    path: '/send',
    method: 'POST',
    headers: {
      'Authorization': waToken,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  const req = https.request(options, (res) => {
    res.on('data', () => {});
  });

  req.on('error', (e) => {
    console.error('Gagal kirim WA Fonnte:', e.message);
  });

  req.write(data);
  req.end();
};

// 1. ENDPOINT LOGIN
app.post('/api/login', async (req, res) => {
  const { username, password, role } = req.body;

  try {
    if (role === 'admin') {
      if (username === 'admin' && password === 'admin123') {
        return res.json({ success: true, role: 'admin', user: { name: 'Manager Operasional' } });
      }
      return res.status(401).json({ error: 'Username atau Password Admin salah!' });
    }

    const query = 'SELECT * FROM drivers WHERE username = $1 AND password = $2';
    const result = await pool.query(query, [username, password]);

    if (result.rows.length > 0) {
      return res.json({ success: true, role: 'driver', user: result.rows[0] });
    } else {
      return res.status(401).json({ error: 'Username atau Password Driver salah!' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan database' });
  }
});

// 2. ENDPOINT CEK ACTIVE TRIP DRIVER
app.get('/api/trips/active/:driver_id', async (req, res) => {
  const { driver_id } = req.params;
  try {
    const query = `
      SELECT * FROM trips 
      WHERE (amt1_id = $1 OR amt2_id = $1) AND status = 'IN_PROGRESS' 
      ORDER BY start_time DESC LIMIT 1;
    `;
    const result = await pool.query(query, [driver_id]);
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengecek status perjalanan aktif' });
  }
});

// 3. ENDPOINT MASTER DATA
app.get('/api/master-data', async (req, res) => {
  try {
    const vehicles = await pool.query('SELECT * FROM vehicles ORDER BY vehicle_id ASC');
    const drivers = await pool.query('SELECT * FROM drivers ORDER BY driver_id ASC');
    const destinations = await pool.query('SELECT * FROM destinations ORDER BY destination_id ASC');

    res.json({
      vehicles: vehicles.rows,
      drivers: drivers.rows,
      destinations: destinations.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat master data' });
  }
});

// 4. ENDPOINT MULAI PERJALANAN
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

    const waMsg = 
`🚨 *LOKASI KEBERANGKATAN ARMADA BAP* 🚨\n\n` +
`🚛 *Armada ID:* ${vehicle_id}\n` +
`📍 *Tujuan:* ${destination_name} (${customer_name || '-'})\n` +
`⛽ *Muatan:* ${fuel_volume} KL (${fuel_type})\n` +
`⏰ *Waktu Berangkat:* ${new Date().toLocaleString('id-ID')}\n` +
`📝 *Catatan:* ${notes || '-'}\n\n` +
`📌 *Titik GPS:* https://maps.google.com/?q=${start_gps}`;

    sendWANotif(waMsg);

    res.json({ message: 'Perjalanan dimulai!', trip: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memulai perjalanan' });
  }
});

// 5. ENDPOINT SELESAI PERJALANAN
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

    const waMsg = 
`✅ *ARMADA TIBA DI TUJUAN* ✅\n\n` +
`🚛 *Armada ID:* ${vehicle_id}\n` +
`⏰ *Waktu Tiba:* ${new Date().toLocaleString('id-ID')}\n` +
`📝 *Catatan Kedatangan:* ${notes || '-'}\n\n` +
`📌 *Titik GPS Tiba:* https://maps.google.com/?q=${end_gps}`;

    sendWANotif(waMsg);

    res.json({ message: 'Perjalanan selesai!', trip: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengakhiri perjalanan' });
  }
});

// 6. ENDPOINT REKAP LAPORAN
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

// 7. ENDPOINT CRUD MASTER
app.post('/api/master/drivers', async (req, res) => {
  const { name, username, password } = req.body;
  try {
    const result = await pool.query('INSERT INTO drivers (name, username, password) VALUES ($1, $2, $3) RETURNING *', [name, username, password || '123456']);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Gagal tambah driver' }); }
});

app.put('/api/master/drivers/:id', async (req, res) => {
  const { name, username, password } = req.body;
  try {
    const result = await pool.query('UPDATE drivers SET name = $1, username = $2, password = $3 WHERE driver_id = $4 RETURNING *', [name, username, password, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Gagal ubah driver' }); }
});

app.delete('/api/master/drivers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM drivers WHERE driver_id = $1', [req.params.id]);
    res.json({ message: 'Driver dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal hapus driver' }); }
});

app.post('/api/master/vehicles', async (req, res) => {
  const { plate_number, brand, capacity, compartment } = req.body;
  try {
    const result = await pool.query('INSERT INTO vehicles (plate_number, brand, capacity, compartment, status) VALUES ($1, $2, $3, $4, \'AVAILABLE\') RETURNING *', [plate_number, brand, capacity, compartment]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Gagal tambah mobil' }); }
});

app.put('/api/master/vehicles/:id', async (req, res) => {
  const { plate_number, brand, capacity, compartment } = req.body;
  try {
    const result = await pool.query('UPDATE vehicles SET plate_number = $1, brand = $2, capacity = $3, compartment = $4 WHERE vehicle_id = $5 RETURNING *', [plate_number, brand, capacity, compartment, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Gagal ubah mobil' }); }
});

app.delete('/api/master/vehicles/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM vehicles WHERE vehicle_id = $1', [req.params.id]);
    res.json({ message: 'Mobil dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal hapus mobil' }); }
});

app.post('/api/master/destinations', async (req, res) => {
  const { location_name } = req.body;
  try {
    const result = await pool.query('INSERT INTO destinations (location_name) VALUES ($1) RETURNING *', [location_name]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Gagal tambah lokasi' }); }
});

app.put('/api/master/destinations/:id', async (req, res) => {
  const { location_name } = req.body;
  try {
    const result = await pool.query('UPDATE destinations SET location_name = $1 WHERE destination_id = $2 RETURNING *', [location_name, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Gagal ubah lokasi' }); }
});

app.delete('/api/master/destinations/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM destinations WHERE destination_id = $1', [req.params.id]);
    res.json({ message: 'Lokasi dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal hapus lokasi' }); }
});

// 8. ENDPOINT HAPUS TRIP
app.delete('/api/trips/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const tripQuery = await pool.query('SELECT vehicle_id FROM trips WHERE trip_id = $1', [id]);
    if (tripQuery.rows.length > 0) {
      await pool.query("UPDATE vehicles SET status = 'AVAILABLE' WHERE vehicle_id = $1", [tripQuery.rows[0].vehicle_id]);
    }
    await pool.query('DELETE FROM trips WHERE trip_id = $1', [id]);
    res.json({ message: 'Data perjalanan dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal hapus trip' }); }
});

module.exports = app;
