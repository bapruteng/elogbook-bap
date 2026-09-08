const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const https = require('https');

const app = express();

// Middleware Standard
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware Otomatis Memotong Prefiks /api (Mencegah Error Routing Vercel)
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    req.url = req.url.replace('/api', '') || '/';
  }
  next();
});

// Database Connection (Supabase Transaction Pooler)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Helper Function: Send WhatsApp Notification via Fonnte
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

app.post(['/login', '/auth/login'], async (req, res) => {
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

  // Driver / AMT Login Check
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
          username: driver.username,
          license_id: driver.license_id,
          status: driver.status 
        }
      });
    } else {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
  } catch (err) {
    console.error('Login Error:', err.message);
    return res.status(500).json({ success: false, message: 'Gagal terhubung ke database', error: err.message });
  }
});

// =================================================================
// 2. MASTER DATA: DRIVERS (AMT / SOPIR)
// =================================================================

app.get(['/drivers', '/master/drivers'], async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM drivers ORDER BY driver_id ASC');
    
    const formattedData = result.rows.map(driver => ({
      ...driver,
      id: driver.driver_id || driver.id,
      driver_id: driver.driver_id || driver.id,
      name: driver.name || '',
      licenseId: driver.license_id || driver.licenseId || '-',
      license_id: driver.license_id || driver.licenseId || '-',
      pinCode: driver.pin_code || driver.pinCode || '1234',
      pin_code: driver.pin_code || driver.pinCode || '1234',
      status: driver.status || 'ACTIVE'
    }));

    res.json(formattedData);
  } catch (err) {
    console.error('Get Drivers Error:', err.message);
    res.json([]);
  }
});

app.post(['/drivers', '/master/drivers'], async (req, res) => {
  const { name, username, password, license_id, licenseId, pin_code, pinCode, status } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ success: false, message: 'Nama, username, dan password wajib diisi' });
  }

  const finalLicenseId = license_id || licenseId || '-';
  const finalPinCode = pin_code || pinCode || '1234';
  const finalStatus = status || 'ACTIVE';

  try {
    const result = await pool.query(
      `INSERT INTO drivers (name, license_id, pin_code, status, username, password) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [name, finalLicenseId, finalPinCode, finalStatus, username, password]
    );

    const newDriver = result.rows[0];
    res.json({ 
      success: true, 
      data: {
        ...newDriver,
        id: newDriver.driver_id,
        driver_id: newDriver.driver_id,
        licenseId: newDriver.license_id,
        pinCode: newDriver.pin_code
      } 
    });
  } catch (err) {
    console.error('Error insert driver:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete(['/drivers/:id', '/master/drivers/:id'], async (req, res) => {
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

app.get(['/trucks', '/master/trucks', '/vehicles', '/master/vehicles'], async (req, res) => {
  try {
    // Coba query dari tabel vehicles terlebih dahulu, jika gagal fallback ke trucks
    let result;
    try {
      result = await pool.query('SELECT * FROM vehicles ORDER BY plate_number ASC');
    } catch (e) {
      result = await pool.query('SELECT * FROM trucks ORDER BY plate_number ASC');
    }
    
    const formattedData = result.rows.map(truck => ({
      ...truck,
      id: truck.vehicle_id || truck.truck_id || truck.id,
      vehicle_id: truck.vehicle_id || truck.truck_id || truck.id,
      truck_id: truck.vehicle_id || truck.truck_id || truck.id,
      plateNumber: truck.plate_number || '',
      plate_number: truck.plate_number || '',
      brand: truck.brand || 'Mitsubishi',
      capacity: truck.capacity || 8,
      compartment: truck.compartment || `${truck.capacity || 8} KL`
    }));

    res.json(formattedData);
  } catch (err) {
    console.error('Get Vehicles Error:', err.message);
    res.json([]);
  }
});

app.post(['/trucks', '/master/trucks'], async (req, res) => {
  const { plate_number, plateNumber, brand, capacity, compartment } = req.body;
  const finalPlate = plate_number || plateNumber;
  const finalBrand = brand || 'Mitsubishi';
  const finalCapacity = capacity || 8;
  const finalCompartment = compartment || `${finalCapacity} KL`;

  if (!finalPlate) {
    return res.status(400).json({ success: false, message: 'Plat nomor wajib diisi' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO trucks (plate_number, brand, capacity, compartment) VALUES ($1, $2, $3, $4) RETURNING *',
      [finalPlate, finalBrand, finalCapacity, finalCompartment]
    );

    const newTruck = result.rows[0];
    res.json({ 
      success: true, 
      data: {
        ...newTruck,
        id: newTruck.truck_id,
        truck_id: newTruck.truck_id,
        plateNumber: newTruck.plate_number,
        plate_number: newTruck.plate_number
      } 
    });
  } catch (err) {
    console.error('Error insert truck:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete(['/trucks/:id', '/master/trucks/:id'], async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM trucks WHERE truck_id = $1 OR id = $1', [id]);
    res.json({ success: true, message: 'Armada berhasil dihapus' });
  } catch (err) {
    console.error('Delete Truck Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =================================================================
// 4. MASTER DATA: DESTINATIONS (TUJUAN)
// =================================================================

app.get(['/destinations', '/master/destinations'], async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM destinations ORDER BY destination_id ASC');
    
    const formattedData = result.rows.map(dest => ({
      ...dest,
      id: dest.destination_id || dest.id,
      destination_id: dest.destination_id || dest.id,
      location_name: dest.location_name || dest.name || '',
      name: dest.location_name || dest.name || ''
    }));

    res.json(formattedData);
  } catch (err) {
    console.error('Get Destinations Error:', err.message);
    res.json([
      { id: 1, destination_id: 1, location_name: 'SPBU Reo', name: 'SPBU Reo' },
      { id: 2, destination_id: 2, location_name: 'SPBU Ruteng', name: 'SPBU Ruteng' },
      { id: 3, destination_id: 3, location_name: 'Labuan Bajo', name: 'Labuan Bajo' },
      { id: 4, destination_id: 4, location_name: 'Borong', name: 'Borong' }
    ]);
  }
});

app.post(['/destinations', '/master/destinations'], async (req, res) => {
  const { location_name, name } = req.body;
  const finalLocation = location_name || name;

  if (!finalLocation) {
    return res.status(400).json({ success: false, message: 'Nama lokasi tujuan wajib diisi' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO destinations (location_name) VALUES ($1) RETURNING *',
      [finalLocation]
    );

    const newDest = result.rows[0];
    res.json({ 
      success: true, 
      data: {
        ...newDest,
        id: newDest.destination_id,
        destination_id: newDest.destination_id,
        location_name: newDest.location_name
      } 
    });
  } catch (err) {
    console.error('Error insert destination:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete(['/destinations/:id', '/master/destinations/:id'], async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM destinations WHERE destination_id = $1 OR id = $1', [id]);
    res.json({ success: true, message: 'Lokasi tujuan berhasil dihapus' });
  } catch (err) {
    console.error('Delete Destination Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =================================================================
// 5. TRIPS & LOGBOOK MANAGEMENT (FILTER TANGGAL & ARMADA SAFE)
// =================================================================

app.get(['/trips', '/reports'], async (req, res) => {
  try {
    const { start_date, end_date, vehicle_id } = req.query;

    let queryText = 'SELECT * FROM trips WHERE 1=1';
    const queryParams = [];

    // Filter Tanggal Mulai
    if (start_date && typeof start_date === 'string' && start_date.trim() !== '') {
      queryParams.push(start_date.trim());
      queryText += ` AND start_time >= $${queryParams.length}::timestamp`;
    }

    // Filter Tanggal Akhir
    if (end_date && typeof end_date === 'string' && end_date.trim() !== '') {
      queryParams.push(`${end_date.trim()} 23:59:59`);
      queryText += ` AND start_time <= $${queryParams.length}::timestamp`;
    }

    // Filter Armada
    if (vehicle_id && typeof vehicle_id === 'string' && vehicle_id.trim() !== '') {
      queryParams.push(vehicle_id.trim());
      queryText += ` AND (plate_number = $${queryParams.length} OR CAST(vehicle_id AS VARCHAR) = $${queryParams.length})`;
    }

    queryText += ' ORDER BY trip_id DESC';

    const result = await pool.query(queryText, queryParams);
    res.json(result.rows);
  } catch (err) {
    console.error('Get Trips Error:', err.message);
    res.json([]);
  }
});

app.post('/trips/start', async (req, res) => {
  const { driver_name, driverName, plate_number, plateNumber, fuel_type, fuelType, volume, destination, notes, latitude, longitude, photo_url, photoUrl } = req.body;

  const finalDriver = driver_name || driverName;
  const finalPlate = plate_number || plateNumber;
  const finalFuel = fuel_type || fuelType || 'Biosolar';
  const finalPhoto = photo_url || photoUrl;

  try {
    const result = await pool.query(
      `INSERT INTO trips 
       (driver_name, plate_number, fuel_type, volume, destination, notes, start_lat, start_lng, start_photo, status, start_time) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'IN_PROGRESS', NOW()) 
       RETURNING *`,
      [finalDriver, finalPlate, finalFuel, volume || 8, destination, notes, latitude, longitude, finalPhoto]
    );

    const trip = result.rows[0];
    const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

    const waMessage = 
`🚀 *E-LOGBOOK BAP: MULAI PERJALANAN*
----------------------------------------
*Driver/AMT:* ${finalDriver}
*Armada:* ${finalPlate}
*Muatan:* ${finalFuel} (${volume || 8} KL)
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

app.post('/trips/end', async (req, res) => {
  const { trip_id, tripId, end_notes, endNotes, latitude, longitude, photo_url, photoUrl } = req.body;

  const finalTripId = trip_id || tripId;
  const finalNotes = end_notes || endNotes;
  const finalPhoto = photo_url || photoUrl;

  try {
    const result = await pool.query(
      `UPDATE trips 
       SET status = 'COMPLETED', end_time = NOW(), end_lat = $1, end_lng = $2, end_photo = $3, end_notes = $4 
       WHERE trip_id = $5 OR id = $5
       RETURNING *`,
      [latitude, longitude, finalPhoto, finalNotes, finalTripId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data perjalanan tidak ditemukan' });
    }

    const trip = result.rows[0];
    const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

    const waMessage = 
`🛑 *E-LOGBOOK BAP: SELESAI PERJALANAN*
----------------------------------------
*Driver/AMT:* ${trip.driver_name}
*Armada:* ${trip.plate_number}
*Tujuan:* ${trip.destination}
*Catatan Kedatangan:* ${finalNotes || '-'}
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

app.delete('/trips/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM trips WHERE trip_id = $1 OR id = $1', [id]);
    res.json({ success: true, message: 'Data perjalanan berhasil dihapus' });
  } catch (err) {
    console.error('Delete Trip Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get(['/', '/health'], (req, res) => {
  res.json({ success: true, message: 'E-Logbook BAP API is running smoothly' });
});

module.exports = app;
