import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const API_URL = '/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '', role: 'driver' });
  const [activeTab, setActiveTab] = useState('trip');
  
  // State Master Data & Reports
  const [master, setMaster] = useState({ vehicles: [], drivers: [], destinations: [] });
  const [reports, setReports] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // State Filter Admin
  const [filters, setFilters] = useState({ start_date: '', end_date: '', vehicle_id: '' });
  
  // State Logbook AMT
  const [tripForm, setTripForm] = useState({
    vehicle_id: '',
    amt2_id: '',
    destination_name: '',
    customer_name: '',
    fuel_type: 'Biosolar',
    fuel_volume: '',
    notes: ''
  });
  const [endNotes, setEndNotes] = useState('');
  const [watermarkedPhoto, setWatermarkedPhoto] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [loading, setLoading] = useState(false);

  // State Master Forms
  const [newDriver, setNewDriver] = useState({ name: '', username: '', password: '' });
  const [editingDriverId, setEditingDriverId] = useState(null);

  const [newVehicle, setNewVehicle] = useState({ plate_number: '', brand: '', capacity: '', compartment: '' });
  const [editingVehicleId, setEditingVehicleId] = useState(null);

  const [newDestination, setNewDestination] = useState({ location_name: '' });
  const [editingDestinationId, setEditingDestinationId] = useState(null);

  useEffect(() => {
    fetchMasterData();
  }, []);

  const fetchMasterData = () => {
    axios.get(`${API_URL}/master-data`)
      .then((res) => setMaster(res.data))
      .catch((err) => console.error('Gagal mengambil master data:', err));
  };

  const fetchReports = () => {
    axios.get(`${API_URL}/reports`, { params: filters })
      .then((res) => setReports(res.data))
      .catch((err) => console.error('Gagal mengambil data laporan:', err));
  };

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    fetchReports();
  };

  const resetFilters = () => {
    setFilters({ start_date: '', end_date: '', vehicle_id: '' });
    axios.get(`${API_URL}/reports`).then((res) => setReports(res.data));
  };

  // EXPORT EXCEL
  const exportToExcel = () => {
    const dataToExport = reports.map(r => ({
      'ID Trip': r.trip_id,
      'No Polisi': r.plate_number,
      'AMT Utama': r.amt1_name,
      'AMT Pendamping': r.amt2_name || '-',
      'Tujuan': r.destination_name,
      'Konsumen / SPBU': r.customer_name || '-',
      'Jenis BBM': r.fuel_type || '-',
      'Volume (KL)': r.fuel_volume || 0,
      'Waktu Berangkat': new Date(r.start_time).toLocaleString('id-ID'),
      'Waktu Tiba': r.end_time ? new Date(r.end_time).toLocaleString('id-ID') : '-',
      'Catatan / Kendala': r.notes || '-',
      'Status': r.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Logbook");
    XLSX.writeFile(workbook, `Logbook_BAP_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // EXPORT PDF
  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    doc.text("PT BINTANG AGUNG PRIMA - LAPORAN LOGBOOK ARMADA BBM", 14, 15);
    doc.setFontSize(10);
    doc.text(`Dicetak Tanggal: ${new Date().toLocaleString('id-ID')}`, 14, 22);

    const tableColumn = ["ID", "No Polisi", "AMT 1 / 2", "Tujuan / Konsumen", "BBM", "Vol (KL)", "Berangkat", "Catatan", "Status"];
    const tableRows = reports.map(r => [
      `#${r.trip_id}`,
      r.plate_number,
      `${r.amt1_name}\n${r.amt2_name ? `+ ${r.amt2_name}` : ''}`,
      `${r.destination_name}\n(${r.customer_name || '-'})`,
      r.fuel_type || '-',
      r.fuel_volume || 0,
      new Date(r.start_time).toLocaleString('id-ID'),
      r.notes || '-',
      r.status
    ]);

    doc.autoTable({ head: [tableColumn], body: tableRows, startY: 28 });
    doc.save(`Laporan_BAP_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  // WATERMARK FOTO AUTOMATIC
  const handlePhotoCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const gps = await getGPS();
    const timeStr = new Date().toLocaleString('id-ID');

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;

        ctx.drawImage(img, 0, 0);

        const bannerHeight = img.height * 0.12;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, img.height - bannerHeight, img.width, bannerHeight);

        const fontSize = Math.floor(img.width * 0.035);
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.fillStyle = '#ffffff';

        const padding = img.width * 0.03;
        const startY = img.height - bannerHeight + (fontSize * 1.2);

        ctx.fillText(`PT BINTANG AGUNG PRIMA - LOGBOOK`, padding, startY);
        ctx.fillStyle = '#ffc107';
        ctx.fillText(`📍 GPS: ${gps}`, padding, startY + (fontSize * 1.2));
        ctx.fillText(`⏰ ${timeStr}`, padding, startY + (fontSize * 2.4));

        setWatermarkedPhoto(canvas.toDataURL('image/jpeg', 0.8));
        setLoading(false);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // LOGIN & LOGOUT
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
      const msg = err.response?.data?.error || err.message || 'Login gagal!';
      alert(msg);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setLoginForm({ username: '', password: '', role: 'driver' });
    setActiveTrip(null);
  };

  // LOGBOOK AMT
  const getGPS = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve('-8.635,120.471');
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

    try {
      const res = await axios.post(`${API_URL}/trips/start`, {
        ...tripForm,
        amt1_id: user.user.driver_id,
        start_gps: gps,
        photo_base64: watermarkedPhoto
      });
      setActiveTrip(res.data.trip);
      setWatermarkedPhoto(null);
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

    try {
      await axios.post(`${API_URL}/trips/end`, {
        trip_id: activeTrip.trip_id,
        vehicle_id: activeTrip.vehicle_id,
        end_gps: gps,
        photo_base64: watermarkedPhoto,
        notes: endNotes
      });
      setActiveTrip(null);
      setWatermarkedPhoto(null);
      setEndNotes('');
      setTripForm({ vehicle_id: '', amt2_id: '', destination_name: '', customer_name: '', fuel_type: 'Biosolar', fuel_volume: '', notes: '' });
      alert('🛑 Perjalanan Selesai! Logbook Tercatat.');
    } catch (err) {
      alert('Gagal mengakhiri perjalanan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // FUNGSI HAPUS TRIP KHUSUS ADMIN
  const handleDeleteTrip = async (tripId) => {
    if (window.confirm(`Yakin ingin menghapus data perjalanan #${tripId}? Status armada terkait akan otomatis dipulihkan.`)) {
      try {
        await axios.delete(`${API_URL}/trips/${tripId}`);
        alert('Data perjalanan berhasil dihapus!');
        fetchReports();
      } catch (err) {
        alert('Gagal menghapus data perjalanan: ' + err.message);
      }
    }
  };

  // CRUD MASTER HANDLERS
  const handleSaveDriver = async (e) => {
    e.preventDefault();
    try {
      if (editingDriverId) {
        await axios.put(`${API_URL}/master/drivers/${editingDriverId}`, newDriver);
        alert('Data Driver AMT berhasil diperbarui!');
      } else {
        await axios.post(`${API_URL}/master/drivers`, newDriver);
        alert('Driver AMT berhasil ditambahkan!');
      }
      setNewDriver({ name: '', username: '', password: '' });
      setEditingDriverId(null);
      fetchMasterData();
    } catch (err) { alert('Gagal menyimpan data driver'); }
  };

  const startEditDriver = (driver) => {
    setEditingDriverId(driver.driver_id);
    setNewDriver({ name: driver.name, username: driver.username || '', password: driver.password || '123456' });
  };

  const handleDeleteDriver = async (id) => {
    if (window.confirm('Yakin ingin menghapus driver ini?')) {
      await axios.delete(`${API_URL}/master/drivers/${id}`);
      fetchMasterData();
    }
  };

  const handleSaveVehicle = async (e) => {
    e.preventDefault();
    try {
      if (editingVehicleId) {
        await axios.put(`${API_URL}/master/vehicles/${editingVehicleId}`, newVehicle);
        alert('Data Armada berhasil diperbarui!');
      } else {
        await axios.post(`${API_URL}/master/vehicles`, newVehicle);
        alert('Armada berhasil ditambahkan!');
      }
      setNewVehicle({ plate_number: '', brand: '', capacity: '', compartment: '' });
      setEditingVehicleId(null);
      fetchMasterData();
    } catch (err) { alert('Gagal menyimpan data armada'); }
  };

  const startEditVehicle = (vehicle) => {
    setEditingVehicleId(vehicle.vehicle_id);
    setNewVehicle({
      plate_number: vehicle.plate_number,
      brand: vehicle.brand,
      capacity: vehicle.capacity,
      compartment: vehicle.compartment
    });
  };

  const handleDeleteVehicle = async (id) => {
    if (window.confirm('Yakin ingin menghapus armada ini?')) {
      await axios.delete(`${API_URL}/master/vehicles/${id}`);
      fetchMasterData();
    }
  };

  const handleSaveDestination = async (e) => {
    e.preventDefault();
    try {
      if (editingDestinationId) {
        await axios.put(`${API_URL}/master/destinations/${editingDestinationId}`, newDestination);
        alert('Data Lokasi berhasil diperbarui!');
      } else {
        await axios.post(`${API_URL}/master/destinations`, newDestination);
        alert('Lokasi tujuan berhasil ditambahkan!');
      }
      setNewDestination({ location_name: '' });
      setEditingDestinationId(null);
      fetchMasterData();
    } catch (err) { alert('Gagal menyimpan lokasi'); }
  };

  const startEditDestination = (dst) => {
    setEditingDestinationId(dst.destination_id);
    setNewDestination({ location_name: dst.location_name });
  };

  const handleDeleteDestination = async (id) => {
    if (window.confirm('Yakin ingin menghapus lokasi ini?')) {
      await axios.delete(`${API_URL}/master/destinations/${id}`);
      fetchMasterData();
    }
  };

  // DASHBOARD STATS
  const inProgressCount = reports.filter(r => r.status === 'IN_PROGRESS').length;
  const completedCount = reports.filter(r => r.status === 'COMPLETED').length;
  const totalVolumeKL = reports.reduce((acc, r) => acc + (parseFloat(r.fuel_volume) || 0), 0);

  // LOGIN PAGE
  if (!user) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginBox}>
          <h2 style={{ textAlign: 'center', color: '#0056b3', marginBottom: '5px' }}>E-LOGBOOK BAP</h2>
          <p style={{ textAlign: 'center', fontSize: '12px', color: '#666', marginTop: 0 }}>PT Bintang Agung Prima - KBLI 49232</p>

          <form onSubmit={handleLogin}>
            <label style={styles.label}>TIPE AKSES LOGIN:</label>
            <select style={styles.select} value={loginForm.role} onChange={(e) => setLoginForm({ ...loginForm, role: e.target.value })}>
              <option value="driver">📱 Driver / AMT</option>
              <option value="admin">📊 Manager / Admin</option>
            </select>

            <label style={styles.label}>USERNAME / NIK:</label>
            <input type="text" required style={styles.input} value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} placeholder="Masukkan username" />

            <label style={styles.label}>PASSWORD / PIN:</label>
            <input type="password" required style={styles.input} value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="Masukkan password" />

            <button type="submit" style={{ ...styles.bigBtn, backgroundColor: '#0056b3', marginTop: '15px' }}>MASUK KE APLIKASI</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <div>
          <strong>{user.role === 'admin' ? 'Manager Operasional' : user.user.name}</strong> 
          <small> ({user.role === 'admin' ? 'ADMIN' : 'AMT DRIVER'})</small>
        </div>
        <button onClick={handleLogout} style={styles.logoutBtn}>Keluar 🚪</button>
      </div>

      {user.role === 'admin' && (
        <div style={styles.navBar}>
          <button style={activeTab === 'reports' ? styles.activeTabBtn : styles.tabBtn} onClick={() => { setActiveTab('reports'); fetchReports(); }}>📊 Laporan Logbook</button>
          <button style={activeTab === 'master_drivers' ? styles.activeTabBtn : styles.tabBtn} onClick={() => setActiveTab('master_drivers')}>👨‍✈️ Data AMT</button>
          <button style={activeTab === 'master_vehicles' ? styles.activeTabBtn : styles.tabBtn} onClick={() => setActiveTab('master_vehicles')}>🚛 Data Armada</button>
          <button style={activeTab === 'master_destinations' ? styles.activeTabBtn : styles.tabBtn} onClick={() => setActiveTab('master_destinations')}>📍 Data Tujuan</button>
        </div>
      )}

      {/* AMT VIEW */}
      {user.role === 'driver' && (
        <div style={styles.mobileWrapper}>
          {!activeTrip ? (
            <div style={styles.card}>
              <h3 style={{ marginTop: 0, color: '#0056b3' }}>Form Keberangkatan (Depo Reo)</h3>
              <p>AMT Utama: <strong>{user.user.name}</strong></p>

              <label style={styles.label}>PILIH NOMOR POLISI ARMADA:</label>
              <select style={styles.select} value={tripForm.vehicle_id} onChange={(e) => {
                const v = master.vehicles.find(x => x.vehicle_id === parseInt(e.target.value));
                setTripForm({ ...tripForm, vehicle_id: e.target.value, fuel_volume: v ? v.capacity : '' });
              }}>
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

              <label style={styles.label}>LOKASI TUJUAN PENGIRIMAN:</label>
              <select style={styles.select} value={tripForm.destination_name} onChange={(e) => setTripForm({ ...tripForm, destination_name: e.target.value, customer_name: e.target.value })}>
                <option value="">-- Pilih Lokasi Tujuan --</option>
                {master.destinations.map((dst) => (
                  <option key={dst.destination_id} value={dst.location_name}>{dst.location_name}</option>
                ))}
              </select>

              <label style={styles.label}>NAMA KONSUMEN / SPBU / SITE:</label>
              <input type="text" style={styles.input} value={tripForm.customer_name} onChange={(e) => setTripForm({ ...tripForm, customer_name: e.target.value })} placeholder="Contoh: SPBU Ruteng / PT X" />

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>JENIS BBM:</label>
                  <select style={styles.select} value={tripForm.fuel_type} onChange={(e) => setTripForm({ ...tripForm, fuel_type: e.target.value })}>
                    <option value="Biosolar">Biosolar</option>
                    <option value="Pertalite">Pertalite</option>
                    <option value="Pertamax">Pertamax</option>
                    <option value="Dexlite">Dexlite</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>MUATAN (KL):</label>
                  <input type="number" style={styles.input} value={tripForm.fuel_volume} onChange={(e) => setTripForm({ ...tripForm, fuel_volume: e.target.value })} placeholder="KL" />
                </div>
              </div>

              <label style={styles.label}>CATATAN / KENDALA AWAL (OPSIONAL):</label>
              <input type="text" style={styles.input} value={tripForm.notes} onChange={(e) => setTripForm({ ...tripForm, notes: e.target.value })} placeholder="Contoh: Cuaca gerimis / Antrean depo" />

              <label style={styles.label}>📷 FOTO ABSENSI SEBELUM KELUAR DEPO:</label>
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} style={styles.fileInput} />

              {watermarkedPhoto && (
                <div style={{ marginBottom: '15px' }}>
                  <small style={{ fontWeight: 'bold', color: 'green' }}>✓ Watermark GPS & Waktu Terpasang:</small>
                  <img src={watermarkedPhoto} alt="Preview" style={{ width: '100%', borderRadius: '5px', marginTop: '5px' }} />
                </div>
              )}

              <button style={{ ...styles.bigBtn, backgroundColor: '#28a745' }} onClick={handleStartTrip} disabled={loading || !watermarkedPhoto}>
                {loading ? 'MEMPROSES...' : '🚀 MULAI PERJALANAN'}
              </button>
            </div>
          ) : (
            <div style={{ ...styles.card, border: '2px solid #ffc107', backgroundColor: '#fff8e6' }}>
              <h3 style={{ marginTop: 0, color: '#856404' }}>Status: SEDANG BERJALAN</h3>
              <p style={{ fontSize: '16px' }}>Tujuan: <strong>{activeTrip.destination_name}</strong></p>
              <p style={{ fontSize: '14px', color: '#555' }}>Muatan: <strong>{activeTrip.fuel_volume} KL ({activeTrip.fuel_type})</strong></p>

              <label style={styles.label}>CATATAN KENDALA TIBA (OPSIONAL):</label>
              <input type="text" style={styles.input} value={endNotes} onChange={(e) => setEndNotes(e.target.value)} placeholder="Contoh: Jalan licin / Pembongkaran lancar" />

              <label style={styles.label}>📷 FOTO ABSENSI SAAT TIBA DI TUJUAN:</label>
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} style={styles.fileInput} />

              {watermarkedPhoto && (
                <div style={{ marginBottom: '15px' }}>
                  <small style={{ fontWeight: 'bold', color: 'green' }}>✓ Watermark GPS & Waktu Terpasang:</small>
                  <img src={watermarkedPhoto} alt="Preview" style={{ width: '100%', borderRadius: '5px', marginTop: '5px' }} />
                </div>
              )}

              <button style={{ ...styles.bigBtn, backgroundColor: '#dc3545' }} onClick={handleEndTrip} disabled={loading || !watermarkedPhoto}>
                {loading ? 'MEMPROSES...' : '🛑 TIBA & SELESAI JALAN'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ADMIN VIEW */}
      {user.role === 'admin' && (
        <div style={styles.adminWrapper}>
          {activeTab === 'reports' && (
            <div>
              {/* STATISTIC CARDS */}
              <div style={styles.statsGrid}>
                <div style={{ ...styles.statCard, borderLeft: '5px solid #ffc107' }}>
                  <small>Armada Beroperasi</small>
                  <h2>{inProgressCount} Unit</h2>
                </div>
                <div style={{ ...styles.statCard, borderLeft: '5px solid #28a745' }}>
                  <small>Pengiriman Selesai</small>
                  <h2>{completedCount} Perjalanan</h2>
                </div>
                <div style={{ ...styles.statCard, borderLeft: '5px solid #17a2b8' }}>
                  <small>Total Volume Distributif</small>
                  <h2>{totalVolumeKL} KL</h2>
                </div>
              </div>

              {/* PANEL FILTER REKAP */}
              <div style={styles.filterBox}>
                <form onSubmit={handleFilterSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={styles.filterLabel}>Dari Tanggal:</label>
                    <input type="date" style={styles.inputInline} value={filters.start_date} onChange={(e) => setFilters({ ...filters, start_date: e.target.value })} />
                  </div>
                  <div>
                    <label style={styles.filterLabel}>Sampai Tanggal:</label>
                    <input type="date" style={styles.inputInline} value={filters.end_date} onChange={(e) => setFilters({ ...filters, end_date: e.target.value })} />
                  </div>
                  <div>
                    <label style={styles.filterLabel}>Pilih Armada:</label>
                    <select style={styles.inputInline} value={filters.vehicle_id} onChange={(e) => setFilters({ ...filters, vehicle_id: e.target.value })}>
                      <option value="">-- Semua Mobil --</option>
                      {master.vehicles.map((v) => (
                        <option key={v.vehicle_id} value={v.vehicle_id}>{v.plate_number}</option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" style={styles.filterBtn}>🔍 Filter Data</button>
                  <button type="button" onClick={resetFilters} style={styles.resetBtn}>🔄 Reset</button>
                </form>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                <h3 style={{ margin: 0 }}>REKAP LOGBOOK PERJALANAN ARMADA</h3>
                <div>
                  <button onClick={exportToExcel} style={styles.excelBtn}>📊 Export Excel</button>
                  <button onClick={exportToPDF} style={styles.pdfBtn}>📄 Export PDF</button>
                </div>
              </div>

              <table border="1" cellPadding="8" cellSpacing="0" style={styles.table}>
                <thead>
                  <tr style={{ backgroundColor: '#0056b3', color: '#fff' }}>
                    <th>ID</th><th>Plat Mobil</th><th>AMT Utama / Pendamping</th><th>Tujuan / Konsumen</th><th>Muatan BBM</th><th>Berangkat & Tiba</th><th>Catatan / Kendala</th><th>Foto Absen</th><th>Status</th><th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.trip_id}>
                      <td>#{r.trip_id}</td>
                      <td><strong>{r.plate_number}</strong></td>
                      <td>
                        <strong>{r.amt1_name}</strong><br/>
                        <small style={{ color: '#666' }}>{r.amt2_name ? `+ ${r.amt2_name}` : '(Solo)'}</small>
                      </td>
                      <td>
                        <strong>{r.destination_name}</strong><br/>
                        <small style={{ color: '#0056b3' }}>Konsumen: {r.customer_name || '-'}</small>
                      </td>
                      <td><strong>{r.fuel_volume || 0} KL</strong><br/><small>{r.fuel_type}</small></td>
                      <td>
                        <small>🛫 {new Date(r.start_time).toLocaleString('id-ID')}</small><br/>
                        {r.start_gps && <a href={`https://maps.google.com/?q=${r.start_gps}`} target="_blank" rel="noreferrer" style={styles.mapLink}>📍 Maps Berangkat</a>}<br/>
                        <small>🛬 {r.end_time ? new Date(r.end_time).toLocaleString('id-ID') : '-'}</small><br/>
                        {r.end_gps && <a href={`https://maps.google.com/?q=${r.end_gps}`} target="_blank" rel="noreferrer" style={styles.mapLink}>📍 Maps Tiba</a>}
                      </td>
                      <td><small>{r.notes || '-'}</small></td>
                      <td>
                        {r.start_photo && <button onClick={() => setSelectedPhoto(r.start_photo)} style={styles.photoBtn}>📷 Foto Berangkat</button>}
                        {r.end_photo && <button onClick={() => setSelectedPhoto(r.end_photo)} style={{ ...styles.photoBtn, backgroundColor: '#17a2b8' }}>📷 Foto Tiba</button>}
                      </td>
                      <td style={{ color: r.status === 'COMPLETED' ? 'green' : 'orange', fontWeight: 'bold' }}>{r.status}</td>
                      <td>
                        <button onClick={() => handleDeleteTrip(r.trip_id)} style={styles.delBtn}>🗑️ Hapus</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB MASTER DATA */}
          {activeTab === 'master_drivers' && (
            <div>
              <h3>MANAJEMEN MASTER AMT (SOPIR)</h3>
              <form onSubmit={handleSaveDriver} style={styles.formInline}>
                <input type="text" placeholder="Nama Lengkap" required style={styles.inputInline} value={newDriver.name} onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })} />
                <input type="text" placeholder="Username" required style={styles.inputInline} value={newDriver.username} onChange={(e) => setNewDriver({ ...newDriver, username: e.target.value })} />
                <input type="password" placeholder="Password" required style={styles.inputInline} value={newDriver.password} onChange={(e) => setNewDriver({ ...newDriver, password: e.target.value })} />
                <button type="submit" style={editingDriverId ? styles.updateBtn : styles.addBtn}>
                  {editingDriverId ? '💾 Simpan Perubahan' : '+ Tambah AMT'}
                </button>
                {editingDriverId && (
                  <button type="button" onClick={() => { setEditingDriverId(null); setNewDriver({ name: '', username: '', password: '' }); }} style={styles.cancelBtn}>Batal</button>
                )}
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
                      <td>
                        <button onClick={() => startEditDriver(d)} style={styles.editBtn}>✏️ Edit</button>
                        <button onClick={() => handleDeleteDriver(d.driver_id)} style={styles.delBtn}>🗑️ Hapus</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'master_vehicles' && (
            <div>
              <h3>MANAJEMEN MASTER ARMADA (KENDARAAN)</h3>
              <form onSubmit={handleSaveVehicle} style={styles.formInline}>
                <input type="text" placeholder="Plat Nomor (EB...)" required style={styles.inputInline} value={newVehicle.plate_number} onChange={(e) => setNewVehicle({ ...newVehicle, plate_number: e.target.value })} />
                <input type="text" placeholder="Merk (Mitsubishi/Hino)" required style={styles.inputInline} value={newVehicle.brand} onChange={(e) => setNewVehicle({ ...newVehicle, brand: e.target.value })} />
                <input type="number" placeholder="Kapasitas (KL)" required style={styles.inputInline} value={newVehicle.capacity} onChange={(e) => setNewVehicle({ ...newVehicle, capacity: e.target.value })} />
                <input type="text" placeholder="Kompartemen (e.g. 5 KL)" required style={styles.inputInline} value={newVehicle.compartment} onChange={(e) => setNewVehicle({ ...newVehicle, compartment: e.target.value })} />
                <button type="submit" style={editingVehicleId ? styles.updateBtn : styles.addBtn}>
                  {editingVehicleId ? '💾 Simpan Perubahan' : '+ Tambah Mobil'}
                </button>
                {editingVehicleId && (
                  <button type="button" onClick={() => { setEditingVehicleId(null); setNewVehicle({ plate_number: '', brand: '', capacity: '', compartment: '' }); }} style={styles.cancelBtn}>Batal</button>
                )}
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
                      <td>
                        <button onClick={() => startEditVehicle(v)} style={styles.editBtn}>✏️ Edit</button>
                        <button onClick={() => handleDeleteVehicle(v.vehicle_id)} style={styles.delBtn}>🗑️ Hapus</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'master_destinations' && (
            <div>
              <h3>MANAJEMEN MASTER LOKASI TUJUAN</h3>
              <form onSubmit={handleSaveDestination} style={styles.formInline}>
                <input type="text" placeholder="Nama Lokasi / SPBU / Site" required style={{ ...styles.inputInline, width: '300px' }} value={newDestination.location_name} onChange={(e) => setNewDestination({ location_name: e.target.value })} />
                <button type="submit" style={editingDestinationId ? styles.updateBtn : styles.addBtn}>
                  {editingDestinationId ? '💾 Simpan Perubahan' : '+ Tambah Tujuan'}
                </button>
                {editingDestinationId && (
                  <button type="button" onClick={() => { setEditingDestinationId(null); setNewDestination({ location_name: '' }); }} style={styles.cancelBtn}>Batal</button>
                )}
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
                      <td>
                        <button onClick={() => startEditDestination(dst)} style={styles.editBtn}>✏️ Edit</button>
                        <button onClick={() => handleDeleteDestination(dst.destination_id)} style={styles.delBtn}>🗑️ Hapus</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL POPUP PREVIEW FOTO */}
      {selectedPhoto && (
        <div style={styles.modalOverlay} onClick={() => setSelectedPhoto(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>📷 Foto Absensi Verifikasi</h3>
            <img src={selectedPhoto} alt="Watermarked Absen" style={{ width: '100%', borderRadius: '8px' }} />
            <button onClick={() => setSelectedPhoto(null)} style={{ ...styles.bigBtn, backgroundColor: '#dc3545', marginTop: '15px' }}>
              Tutup Foto ✖
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
  fileInput: { width: '100%', padding: '8px', fontSize: '13px', marginBottom: '10px', backgroundColor: '#f8f9fa', border: '1px solid #ddd', borderRadius: '5px' },
  bigBtn: { width: '100%', padding: '15px', fontSize: '16px', fontWeight: 'bold', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  adminWrapper: { maxWidth: '1150px', margin: '20px auto', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '15px' },
  formInline: { display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' },
  inputInline: { padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid #ccc' },
  addBtn: { backgroundColor: '#28a745', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
  updateBtn: { backgroundColor: '#ffc107', color: '#000', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
  cancelBtn: { backgroundColor: '#6c757d', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer' },
  editBtn: { backgroundColor: '#ffc107', color: '#000', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '5px' },
  delBtn: { backgroundColor: '#dc3545', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  mapLink: { display: 'inline-block', fontSize: '12px', color: '#0056b3', marginTop: '3px', fontWeight: 'bold' },
  photoBtn: { backgroundColor: '#28a745', color: '#fff', border: 'none', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', margin: '2px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', padding: '20px', borderRadius: '10px', maxWidth: '500px', width: '90%' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '10px' },
  statCard: { backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '6px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  excelBtn: { backgroundColor: '#1d6f42', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginRight: '8px' },
  pdfBtn: { backgroundColor: '#b30b00', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
  filterBox: { backgroundColor: '#e9ecef', padding: '12px', borderRadius: '6px', marginBottom: '10px' },
  filterLabel: { display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '3px' },
  filterBtn: { backgroundColor: '#0056b3', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
  resetBtn: { backgroundColor: '#6c757d', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', marginLeft: '5px' }
};
