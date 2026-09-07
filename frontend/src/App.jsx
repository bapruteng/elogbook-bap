import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('driver'); // 'driver' atau 'admin'
  const [master, setMaster] = useState({ vehicles: [], drivers: [], destinations: [] });
  const [form, setForm] = useState({ vehicle_id: '', amt1_id: '', amt2_id: '', destination_name: '' });
  const [photo, setPhoto] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState([]);

  // Fetch Master Data
  useEffect(() => {
    fetchMasterData();
    fetchReports();
  }, []);

  const fetchMasterData = () => {
    axios.get(`${API_URL}/master-data`)
      .then((res) => setMaster(res.data))
      .catch((err) => console.error('Gagal mengambil master data:', err));
  };

  const fetchReports = () => {
    axios.get(`${API_URL}/reports`)
      .then((res) => setReports(res.data))
      .catch((err) => console.error('Gagal mengambil data laporan:', err));
  };

  // Ambil GPS HP
  const getGPS = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve('-8.635,120.471'); // Default koordinat Reo
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`),
        () => resolve('-8.635,120.471'),
        { timeout: 5000 }
      );
    });
  };

  // 1. AMT Mulai Jalan
  const handleStartTrip = async () => {
    if (!form.vehicle_id || !form.amt1_id || !form.destination_name) {
      return alert('Harap pilih Mobil, AMT 1, dan Tujuan!');
    }

    setLoading(true);
    const gps = await getGPS();

    const formData = new FormData();
    formData.append('vehicle_id', form.vehicle_id);
    formData.append('amt1_id', form.amt1_id);
    formData.append('amt2_id', form.amt2_id);
    formData.append('destination_name', form.destination_name);
    formData.append('start_gps', gps);
    if (photo) formData.append('photo', photo);

    try {
      const res = await axios.post(`${API_URL}/trips/start`, formData);
      setActiveTrip(res.data.trip);
      setPhoto(null);
      alert('🚀 Perjalanan Resmi Dimulai! Selamat Jalan.');
      fetchReports();
    } catch (err) {
      alert('Gagal memulai perjalanan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. AMT Selesai Jalan
  const handleEndTrip = async () => {
    setLoading(true);
    const gps = await getGPS();

    const formData = new FormData();
    formData.append('trip_id', activeTrip.trip_id);
    formData.append('vehicle_id', activeTrip.vehicle_id);
    formData.append('end_gps', gps);
    if (photo) formData.append('photo', photo);

    try {
      await axios.post(`${API_URL}/trips/end`, formData);
      setActiveTrip(null);
      setPhoto(null);
      setForm({ vehicle_id: '', amt1_id: '', amt2_id: '', destination_name: '' });
      alert('🛑 Perjalanan Selesai! Data Logbook Tercatat.');
      fetchReports();
    } catch (err) {
      alert('Gagal mengakhiri perjalanan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Navigation Switcher */}
      <div style={styles.navBar}>
        <button 
          style={{ ...styles.navBtn, backgroundColor: activeTab === 'driver' ? '#0056b3' : '#6c757d' }}
          onClick={() => setActiveTab('driver')}
        >
          📱 Tampilan HP AMT
        </button>
        <button 
          style={{ ...styles.navBtn, backgroundColor: activeTab === 'admin' ? '#0056b3' : '#6c757d' }}
          onClick={() => { setActiveTab('admin'); fetchReports(); }}
        >
          📊 Dashboard Manager
        </button>
      </div>

      {/* ==================== TAMPILAN SOPIR / AMT ==================== */}
      {activeTab === 'driver' && (
        <div style={styles.mobileWrapper}>
          <div style={styles.header}>
            <h2 style={{ margin: 0, fontSize: '20px' }}>E-LOGBOOK BAP</h2>
            <small>PT Bintang Agung Prima - Transportir B3</small>
          </div>

          {!activeTrip ? (
            /* FORM BERANGKAT */
            <div style={styles.card}>
              <h3 style={{ marginTop: 0, color: '#0056b3', fontSize: '18px' }}>1. Keberangkatan (Depo Reo)</h3>

              <label style={styles.label}>PILIH NOMOR POLISI ARMADA:</label>
              <select style={styles.select} value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}>
                <option value="">-- Pilih Plat Mobil --</option>
                {master.vehicles.map((v) => (
                  <option key={v.vehicle_id} value={v.vehicle_id}>
                    {v.plate_number} ({v.brand} - {v.capacity} KL)
                  </option>
                ))}
              </select>

              <label style={styles.label}>PILIH AMT 1 (Sopir Utama):</label>
              <select style={styles.select} value={form.amt1_id} onChange={(e) => setForm({ ...form, amt1_id: e.target.value })}>
                <option value="">-- Pilih Nama AMT 1 --</option>
                {master.drivers.map((d) => (
                  <option key={d.driver_id} value={d.driver_id}>{d.name}</option>
                ))}
              </select>

              <label style={styles.label}>PILIH AMT 2 (Pendamping):</label>
              <select style={styles.select} value={form.amt2_id} onChange={(e) => setForm({ ...form, amt2_id: e.target.value })}>
                <option value="">-- Tanpa / Pilih AMT 2 --</option>
                {master.drivers.map((d) => (
                  <option key={d.driver_id} value={d.driver_id}>{d.name}</option>
                ))}
              </select>

              <label style={styles.label}>TUJUAN PENGIRIMAN:</label>
              <select style={styles.select} value={form.destination_name} onChange={(e) => setForm({ ...form, destination_name: e.target.value })}>
                <option value="">-- Pilih Lokasi Tujuan --</option>
                {master.destinations.map((dst) => (
                  <option key={dst.destination_id} value={dst.location_name}>{dst.location_name}</option>
                ))}
              </select>

              <label style={styles.label}>📷 FOTO ABSENSI SEBELUM KELUAR DEPO:</label>
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                onChange={(e) => setPhoto(e.target.files[0])} 
                style={styles.fileInput}
              />

              <button 
                style={{ ...styles.bigBtn, backgroundColor: '#28a745' }} 
                onClick={handleStartTrip} 
                disabled={loading}
              >
                {loading ? 'MEMPROSES...' : '🚀 MULAI PERJALANAN'}
              </button>
            </div>
          ) : (
            /* FORM TIBA */
            <div style={{ ...styles.card, border: '2px solid #ffc107', backgroundColor: '#fff8e6' }}>
              <h3 style={{ marginTop: 0, color: '#856404' }}>2. Status: SEDANG BERJALAN</h3>
              <p style={{ fontSize: '18px' }}>Tujuan: <strong>{activeTrip.destination_name}</strong></p>

              <label style={styles.label}>📷 FOTO ABSENSI SAAT TIBA DI TUJUAN:</label>
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                onChange={(e) => setPhoto(e.target.files[0])} 
                style={styles.fileInput}
              />

              <button 
                style={{ ...styles.bigBtn, backgroundColor: '#dc3545' }} 
                onClick={handleEndTrip} 
                disabled={loading}
              >
                {loading ? 'MEMPROSES...' : '🛑 TIBA & SELESAI JALAN'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================== DASHBOARD ADMIN / MANAGER ==================== */}
      {activeTab === 'admin' && (
        <div style={styles.adminWrapper}>
          <h2>DASHBOARD MONITORING E-LOGBOOK ARMADA</h2>
          <p>PT Bintang Agung Prima - KBLI 49232 (Transportasi Barang Khusus)</p>

          <table border="1" cellPadding="10" cellSpacing="0" style={styles.table}>
            <thead>
              <tr style={{ backgroundColor: '#0056b3', color: '#fff' }}>
                <th>ID</th>
                <th>No. Polisi</th>
                <th>Kapasitas</th>
                <th>AMT 1</th>
                <th>AMT 2</th>
                <th>Tujuan</th>
                <th>Waktu Berangkat</th>
                <th>Waktu Tiba</th>
                <th>GPS Berangkat / Tiba</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr><td colSpan="10" style={{ textAlign: 'center' }}>Belum ada data perjalanan.</td></tr>
              ) : (
                reports.map((row) => (
                  <tr key={row.trip_id}>
                    <td>#{row.trip_id}</td>
                    <td><strong>{row.plate_number}</strong> ({row.brand})</td>
                    <td>{row.capacity} KL ({row.compartment})</td>
                    <td>{row.amt1_name}</td>
                    <td>{row.amt2_name || '-'}</td>
                    <td>{row.destination_name}</td>
                    <td>{new Date(row.start_time).toLocaleString('id-ID')}</td>
                    <td>{row.end_time ? new Date(row.end_time).toLocaleString('id-ID') : '-'}</td>
                    <td><small>{row.start_gps || '-'}</small> / <small>{row.end_gps || '-'}</small></td>
                    <td style={{ color: row.status === 'COMPLETED' ? 'green' : 'orange', fontWeight: 'bold' }}>
                      {row.status === 'COMPLETED' ? 'SELESAI' : 'BERJALAN'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Styling Responsif
const styles = {
  container: { fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f4f6f9', paddingBottom: '30px' },
  navBar: { display: 'flex', gap: '10px', justifyContent: 'center', padding: '15px', backgroundColor: '#343a40' },
  navBtn: { padding: '10px 20px', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px' },
  mobileWrapper: { maxWidth: '480px', margin: '0 auto', padding: '12px' },
  header: { textAlign: 'center', backgroundColor: '#0056b3', color: '#fff', padding: '15px', borderRadius: '8px', marginBottom: '15px' },
  card: { backgroundColor: '#fff', padding: '18px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  label: { display: 'block', fontWeight: 'bold', fontSize: '14px', marginTop: '12px', marginBottom: '5px' },
  select: { width: '100%', padding: '12px', fontSize: '16px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: '#fff' },
  fileInput: { width: '100%', padding: '10px', fontSize: '14px', marginBottom: '15px', backgroundColor: '#f8f9fa', border: '1px solid #ddd', borderRadius: '6px' },
  bigBtn: { width: '100%', padding: '18px', fontSize: '18px', fontWeight: 'bold', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '10px' },
  adminWrapper: { maxWidth: '1100px', margin: '0 auto', padding: '20px', backgroundColor: '#fff', marginTop: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '15px', textAlign: 'left' }
};