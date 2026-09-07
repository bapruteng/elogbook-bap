import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = '/api'; // Menggunakan path relatif untuk Vercel / Render

export default function App() {
  const [user, setUser] = useState(null); // Data user yang sedang login
  const [loginForm, setLoginForm] = useState({ username: '', password: '', role: 'driver' });
  const [activeTab, setActiveTab] = useState('trip'); // 'trip', 'master_drivers', 'master_vehicles', 'master_destinations', 'reports'
  
  // State Master Data & Reports
  const [master, setMaster] = useState({ vehicles: [], drivers: [], destinations: [] });
  const [reports, setReports] = useState([]);
  
  // State Input Logbook AMT
  const [tripForm, setTripForm] = useState({ vehicle_id: '', amt2_id: '', destination_name: '' });
  const [photo, setPhoto] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [loading, setLoading] = useState(false);

  // State Form Tambah Master Data (Admin)
  const [newDriver, setNewDriver] = useState({ name: '', username: '', password: '' });
  const [newVehicle, setNewVehicle] = useState({ plate_number: '', brand: '', capacity: '', compartment: '' });
  const [newDestination, setNewDestination] = useState({ location_name: '' });

  useEffect(() => {
    fetchMasterData();
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

  // -------------------------------------------------------------
  // FUNGSI LOGIN & LOGOUT
  // -------------------------------------------------------------
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_URL}/login`, loginForm);
      if (res.data.success) {
        setUser(res.data);
        if (res.data.role === 'admin') {
          setActiveTab('reports');
          fetchReports();
        } else {
          setActiveTab('trip');
        }
      }
    } catch (err) {
      // Ambil pesan error berupa teks string, bukan objek
      const msg = err.response?.data?.error || err.message || 'Login gagal!';
      alert(msg);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setLoginForm({ username: '', password: '', role: 'driver' });
    setActiveTrip(null);
  };

  // -------------------------------------------------------------
  // FUNGSI LOGBOOK AMT
  // -------------------------------------------------------------
  const getGPS = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve('-8.635,120.471'); // Default Reo
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`),
        () => resolve('-8.635,120.471'),
        { timeout: 5000 }
      );
    });
  };

  const handleStartTrip = async () => {
    if (!tripForm.vehicle_id || !tripForm.destination_name) {
      return alert('Harap pilih Mobil dan Tujuan Pengiriman!');
    }

    setLoading(true);
    const gps = await getGPS();

    const formData = new FormData();
    formData.append('vehicle_id', tripForm.vehicle_id);
    formData.append('amt1_id', user.user.driver_id); // Otomatis dari akun AMT login
    formData.append('amt2_id', tripForm.amt2_id);
    formData.append('destination_name', tripForm.destination_name);
    formData.append('start_gps', gps);
    if (photo) formData.append('photo', photo);

    try {
      const res = await axios.post(`${API_URL}/trips/start`, formData);
      setActiveTrip(res.data.trip);
      setPhoto(null);
      alert('🚀 Perjalanan Resmi Dimulai! Selamat Jalan.');
    } catch (err) {
      alert('Gagal memulai perjalanan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

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
      setTripForm({ vehicle_id: '', amt2_id: '', destination_name: '' });
      alert('🛑 Perjalanan Selesai! Logbook Tercatat.');
    } catch (err) {
      alert('Gagal mengakhiri perjalanan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // FUNGSI CRUD MASTER DATA (ADMIN)
  // -------------------------------------------------------------
  const handleAddDriver = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/master/drivers`, newDriver);
      alert('Driver AMT berhasil ditambahkan!');
      setNewDriver({ name: '', username: '', password: '' });
      fetchMasterData();
    } catch (err) { alert('Gagal menambah driver'); }
  };

  const handleDeleteDriver = async (id) => {
    if (window.confirm('Yakin ingin menghapus driver ini?')) {
      await axios.delete(`${API_URL}/master/drivers/${id}`);
      fetchMasterData();
    }
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/master/vehicles`, newVehicle);
      alert('Armada berhasil ditambahkan!');
      setNewVehicle({ plate_number: '', brand: '', capacity: '', compartment: '' });
      fetchMasterData();
    } catch (err) { alert('Gagal menambah armada'); }
  };

  const handleDeleteVehicle = async (id) => {
    if (window.confirm('Yakin ingin menghapus armada ini?')) {
      await axios.delete(`${API_URL}/master/vehicles/${id}`);
      fetchMasterData();
    }
  };

  const handleAddDestination = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/master/destinations`, newDestination);
      alert('Lokasi tujuan berhasil ditambahkan!');
      setNewDestination({ location_name: '' });
      fetchMasterData();
    } catch (err) { alert('Gagal menambah lokasi'); }
  };

  const handleDeleteDestination = async (id) => {
    if (window.confirm('Yakin ingin menghapus lokasi ini?')) {
      await axios.delete(`${API_URL}/master/destinations/${id}`);
      fetchMasterData();
    }
  };

  // =============================================================
  // TAMPILAN 1: HALAMAN LOGIN
  // =============================================================
  if (!user) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginBox}>
          <h2 style={{ textAlign: 'center', color: '#0056b3', marginBottom: '5px' }}>E-LOGBOOK BAP</h2>
          <p style={{ textAlign: 'center', fontSize: '12px', color: '#666', marginTop: 0 }}>PT Bintang Agung Prima - KBLI 49232</p>

          <form onSubmit={handleLogin}>
            <label style={styles.label}>TIPE AKSES LOGIN:</label>
            <select 
              style={styles.select} 
              value={loginForm.role} 
              onChange={(e) => setLoginForm({ ...loginForm, role: e.target.value })}
            >
              <option value="driver">📱 Driver / AMT</option>
              <option value="admin">📊 Manager / Admin</option>
            </select>

            <label style={styles.label}>USERNAME / NIK:</label>
            <input 
              type="text" 
              required 
              style={styles.input} 
              value={loginForm.username} 
              onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} 
              placeholder="Masukkan username"
            />

            <label style={styles.label}>PASSWORD / PIN:</label>
            <input 
              type="password" 
              required 
              style={styles.input} 
              value={loginForm.password} 
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} 
              placeholder="Masukkan password"
            />

            <button type="submit" style={{ ...styles.bigBtn, backgroundColor: '#0056b3', marginTop: '15px' }}>
              MASUK KE APLIKASI
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =============================================================
  // TAMPILAN 2: SETELAH LOGIN (AMT ATAU ADMIN)
  // =============================================================
  return (
    <div style={styles.container}>
      {/* Header Top Bar */}
      <div style={styles.topBar}>
        <div>
          <strong>{user.role === 'admin' ? 'Manager Operasional' : user.user.name}</strong> 
          <small> ({user.role === 'admin' ? 'ADMIN' : 'AMT DRIVER'})</small>
        </div>
        <button onClick={handleLogout} style={styles.logoutBtn}>Keluar 🚪</button>
      </div>

      {/* Navigation Tab Admin */}
      {user.role === 'admin' && (
        <div style={styles.navBar}>
          <button style={activeTab === 'reports' ? styles.activeTabBtn : styles.tabBtn} onClick={() => { setActiveTab('reports'); fetchReports(); }}>📊 Laporan Logbook</button>
          <button style={activeTab === 'master_drivers' ? styles.activeTabBtn : styles.tabBtn} onClick={() => setActiveTab('master_drivers')}>👨‍✈️ Data AMT</button>
          <button style={activeTab === 'master_vehicles' ? styles.activeTabBtn : styles.tabBtn} onClick={() => setActiveTab('master_vehicles')}>🚛 Data Armada</button>
          <button style={activeTab === 'master_destinations' ? styles.activeTabBtn : styles.tabBtn} onClick={() => setActiveTab('master_destinations')}>📍 Data Tujuan</button>
        </div>
      )}

      {/* ================= TAMPILAN AMT / DRIVER ================= */}
      {user.role === 'driver' && (
        <div style={styles.mobileWrapper}>
          {!activeTrip ? (
            <div style={styles.card}>
              <h3 style={{ marginTop: 0, color: '#0056b3' }}>Form Keberangkatan (Depo Reo)</h3>
              <p>AMT Utama: <strong>{user.user.name}</strong></p>

              <label style={styles.label}>PILIH NOMOR POLISI ARMADA:</label>
              <select style={styles.select} value={tripForm.vehicle_id} onChange={(e) => setTripForm({ ...tripForm, vehicle_id: e.target.value })}>
                <option value="">-- Pilih Plat Mobil --</option>
                {master.vehicles.map((v) => (
                  <option key={v.vehicle_id} value={v.vehicle_id}>{v.plate_number} ({v.brand} - {v.capacity} KL)</option>
                ))}
              </select>

              <label style={styles.label}>PILIH AMT 2 (Pendamping):</label>
              <select style={styles.select} value={tripForm.amt2_id} onChange={(e) => setTripForm({ ...tripForm, amt2_id: e.target.value })}>
                <option value="">-- Tanpa / Pilih AMT 2 --</option>
                {master.drivers.filter(d => d.driver_id !== user.user.driver_id).map((d) => (
                  <option key={d.driver_id} value={d.driver_id}>{d.name}</option>
                ))}
              </select>

              <label style={styles.label}>TUJUAN PENGIRIMAN:</label>
              <select style={styles.select} value={tripForm.destination_name} onChange={(e) => setTripForm({ ...tripForm, destination_name: e.target.value })}>
                <option value="">-- Pilih Lokasi Tujuan --</option>
                {master.destinations.map((dst) => (
                  <option key={dst.destination_id} value={dst.location_name}>{dst.location_name}</option>
                ))}
              </select>

              <label style={styles.label}>📷 FOTO ABSENSI SEBELUM KELUAR DEPO:</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files[0])} style={styles.fileInput} />

              <button style={{ ...styles.bigBtn, backgroundColor: '#28a745' }} onClick={handleStartTrip} disabled={loading}>
                {loading ? 'MEMPROSES...' : '🚀 MULAI PERJALANAN'}
              </button>
            </div>
          ) : (
            <div style={{ ...styles.card, border: '2px solid #ffc107', backgroundColor: '#fff8e6' }}>
              <h3 style={{ marginTop: 0, color: '#856404' }}>Status: SEDANG BERJALAN</h3>
              <p style={{ fontSize: '18px' }}>Tujuan: <strong>{activeTrip.destination_name}</strong></p>

              <label style={styles.label}>📷 FOTO ABSENSI SAAT TIBA DI TUJUAN:</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files[0])} style={styles.fileInput} />

              <button style={{ ...styles.bigBtn, backgroundColor: '#dc3545' }} onClick={handleEndTrip} disabled={loading}>
                {loading ? 'MEMPROSES...' : '🛑 TIBA & SELESAI JALAN'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================= TAMPILAN ADMIN / MANAGER ================= */}
      {user.role === 'admin' && (
        <div style={styles.adminWrapper}>
          {/* TAB 1: LAPORAN */}
          {activeTab === 'reports' && (
            <div>
              <h3>REKAP LOGBOOK PERJALANAN ARMADA</h3>
              <table border="1" cellPadding="8" cellSpacing="0" style={styles.table}>
                <thead>
                  <tr style={{ backgroundColor: '#0056b3', color: '#fff' }}>
                    <th>ID</th><th>Plat Mobil</th><th>AMT 1</th><th>AMT 2</th><th>Tujuan</th><th>Waktu Berangkat</th><th>Waktu Tiba</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.trip_id}>
                      <td>#{r.trip_id}</td>
                      <td><strong>{r.plate_number}</strong></td>
                      <td>{r.amt1_name}</td>
                      <td>{r.amt2_name || '-'}</td>
                      <td>{r.destination_name}</td>
                      <td>{new Date(r.start_time).toLocaleString('id-ID')}</td>
                      <td>{r.end_time ? new Date(r.end_time).toLocaleString('id-ID') : '-'}</td>
                      <td style={{ color: r.status === 'COMPLETED' ? 'green' : 'orange', fontWeight: 'bold' }}>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: MASTER AMT */}
          {activeTab === 'master_drivers' && (
            <div>
              <h3>MANAJEMEN MASTER AMT (SOPIR)</h3>
              <form onSubmit={handleAddDriver} style={styles.formInline}>
                <input type="text" placeholder="Nama Lengkap" required style={styles.inputInline} value={newDriver.name} onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })} />
                <input type="text" placeholder="Username" required style={styles.inputInline} value={newDriver.username} onChange={(e) => setNewDriver({ ...newDriver, username: e.target.value })} />
                <input type="password" placeholder="Password" required style={styles.inputInline} value={newDriver.password} onChange={(e) => setNewDriver({ ...newDriver, password: e.target.value })} />
                <button type="submit" style={styles.addBtn}>+ Tambah AMT</button>
              </form>

              <table border="1" cellPadding="8" cellSpacing="0" style={styles.table}>
                <thead>
                  <tr style={{ backgroundColor: '#343a40', color: '#fff' }}>
                    <th>ID</th><th>Nama Driver</th><th>Username</th><th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {master.drivers.map((d) => (
                    <tr key={d.driver_id}>
                      <td>{d.driver_id}</td><td>{d.name}</td><td>{d.username || '-'}</td>
                      <td><button onClick={() => handleDeleteDriver(d.driver_id)} style={styles.delBtn}>Hapus</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: MASTER ARMADA */}
          {activeTab === 'master_vehicles' && (
            <div>
              <h3>MANAJEMEN MASTER ARMADA (KENDARAAN)</h3>
              <form onSubmit={handleAddVehicle} style={styles.formInline}>
                <input type="text" placeholder="Plat Nomor (EB...)" required style={styles.inputInline} value={newVehicle.plate_number} onChange={(e) => setNewVehicle({ ...newVehicle, plate_number: e.target.value })} />
                <input type="text" placeholder="Merk (Mitsubishi/Hino)" required style={styles.inputInline} value={newVehicle.brand} onChange={(e) => setNewVehicle({ ...newVehicle, brand: e.target.value })} />
                <input type="number" placeholder="Kapasitas (KL)" required style={styles.inputInline} value={newVehicle.capacity} onChange={(e) => setNewVehicle({ ...newVehicle, capacity: e.target.value })} />
                <input type="text" placeholder="Kompartemen (e.g. 5 KL)" required style={styles.inputInline} value={newVehicle.compartment} onChange={(e) => setNewVehicle({ ...newVehicle, compartment: e.target.value })} />
                <button type="submit" style={styles.addBtn}>+ Tambah Mobil</button>
              </form>

              <table border="1" cellPadding="8" cellSpacing="0" style={styles.table}>
                <thead>
                  <tr style={{ backgroundColor: '#343a40', color: '#fff' }}>
                    <th>ID</th><th>No. Polisi</th><th>Merk</th><th>Kapasitas</th><th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {master.vehicles.map((v) => (
                    <tr key={v.vehicle_id}>
                      <td>{v.vehicle_id}</td><td><strong>{v.plate_number}</strong></td><td>{v.brand}</td><td>{v.capacity} KL ({v.compartment})</td>
                      <td><button onClick={() => handleDeleteVehicle(v.vehicle_id)} style={styles.delBtn}>Hapus</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: MASTER TUJUAN */}
          {activeTab === 'master_destinations' && (
            <div>
              <h3>MANAJEMEN MASTER LOKASI TUJUAN</h3>
              <form onSubmit={handleAddDestination} style={styles.formInline}>
                <input type="text" placeholder="Nama Lokasi / SPBU / Site" required style={{ ...styles.inputInline, width: '300px' }} value={newDestination.location_name} onChange={(e) => setNewDestination({ location_name: e.target.value })} />
                <button type="submit" style={styles.addBtn}>+ Tambah Tujuan</button>
              </form>

              <table border="1" cellPadding="8" cellSpacing="0" style={styles.table}>
                <thead>
                  <tr style={{ backgroundColor: '#343a40', color: '#fff' }}>
                    <th>ID</th><th>Nama Lokasi Tujuan</th><th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {master.destinations.map((dst) => (
                    <tr key={dst.destination_id}>
                      <td>{dst.destination_id}</td><td>{dst.location_name}</td>
                      <td><button onClick={() => handleDeleteDestination(dst.destination_id)} style={styles.delBtn}>Hapus</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Styling CSS Responsif
const styles = {
  loginContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#e9ecef' },
  loginBox: { width: '100%', maxWidth: '360px', padding: '25px', backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
  container: { fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f4f6f9', paddingBottom: '30px' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', backgroundColor: '#0056b3', color: '#fff' },
  logoutBtn: { backgroundColor: '#dc3545', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' },
  navBar: { display: 'flex', gap: '5px', backgroundColor: '#343a40', padding: '10px', justifyContent: 'center' },
  tabBtn: { backgroundColor: 'transparent', color: '#ccc', border: 'none', padding: '8px 15px', cursor: 'pointer', borderRadius: '4px' },
  activeTabBtn: { backgroundColor: '#0056b3', color: '#fff', border: 'none', padding: '8px 15px', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' },
  mobileWrapper: { maxWidth: '480px', margin: '20px auto', padding: '12px' },
  card: { backgroundColor: '#fff', padding: '18px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  label: { display: 'block', fontWeight: 'bold', fontSize: '13px', marginTop: '12px', marginBottom: '4px' },
  input: { width: '100%', padding: '10px', fontSize: '14px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' },
  select: { width: '100%', padding: '10px', fontSize: '15px', borderRadius: '5px', border: '1px solid #ccc', backgroundColor: '#fff' },
  fileInput: { width: '100%', padding: '8px', fontSize: '13px', marginBottom: '15px', backgroundColor: '#f8f9fa', border: '1px solid #ddd', borderRadius: '5px' },
  bigBtn: { width: '100%', padding: '15px', fontSize: '16px', fontWeight: 'bold', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  adminWrapper: { maxWidth: '1100px', margin: '20px auto', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '15px' },
  formInline: { display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' },
  inputInline: { padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid #ccc' },
  addBtn: { backgroundColor: '#28a745', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
  delBtn: { backgroundColor: '#dc3545', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }
};
