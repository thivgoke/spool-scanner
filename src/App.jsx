import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import jsQR from 'jsqr';

// Supabase Credentials
const supabaseUrl = 'https://zvljpnbsauvkqsjbxkxq.supabase.co';
const supabaseKey = 'sb_publishable_joegtDp0U4si45-ASrrWVA_puVDj238';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  
  const [offlineQueue, setOfflineQueue] = useState(() => {
    const saved = localStorage.getItem('lnt_offline_queue');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState("Ready to scan");
  const [currentText, setCurrentText] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // --- LIVE QR SCANNER STATES & REFS ---
  const [showLiveQR, setShowLiveQR] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Network Listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Offline Queue Storage
  useEffect(() => {
    localStorage.setItem('lnt_offline_queue', JSON.stringify(offlineQueue));
  }, [offlineQueue]);

  // --- LIVE QR SCANNER ENGINE ---
  useEffect(() => {
    let animationFrameId;

    if (showLiveQR) {
      // Request rear camera
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(stream => {
          if (!videoRef.current) return;
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", true); // Required for iOS Safari
          videoRef.current.play();
          
          const scanFrame = () => {
            if (!videoRef.current || !canvasRef.current) return;
            if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
              const canvas = canvasRef.current;
              const video = videoRef.current;
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext("2d", { willReadFrequently: true });
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

              if (code) {
                // QR FOUND! Stop camera and go back to home page instantly.
                setCurrentText(code.data);
                setStatus("✅ QR Code scanned successfully!");
                setShowLiveQR(false); 
                return; 
              }
            }
            animationFrameId = requestAnimationFrame(scanFrame);
          };
          
          animationFrameId = requestAnimationFrame(scanFrame);
        })
        .catch(err => {
          console.error(err);
          setStatus("Camera access denied. Please allow camera permissions in your browser.");
          setShowLiveQR(false);
        });
    }

    // Cleanup function when camera is closed
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, [showLiveQR]);

  // Get GPS
  const getLocation = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve("Geolocation not supported");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(`${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`),
        (error) => resolve("Location access denied")
      );
    });
  };

  // Sync Data
  const syncOfflineData = async () => {
    if (offlineQueue.length === 0) return;
    setStatus("Syncing offline data to cloud...");
    try {
      const { error } = await supabase
        .from('spool_data')
        .insert(offlineQueue.map(tag => ({
          scanned_text: tag.data,
          location: tag.location || "N/A", 
          created_at: tag.timestamp
        })));

      if (error) {
        setStatus(`Sync Failed: ${error.message}`);
      } else {
        setOfflineQueue([]);
        setStatus("All offline data synced successfully.");
      }
    } catch (err) {
      setStatus("Network error during sync.");
    }
  };

  // HANDLES METAL OCR TEXT ONLY (REQUIRES INTERNET)
  const handleTextCapture = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!isOnline) {
      setStatus("You are offline. Punched text OCR requires internet.");
      return;
    }

    setIsScanning(true);
    setStatus("Uploading to OCR API for text extraction...");
    setCurrentText(""); 

    try {
      const formData = new FormData();
      formData.append('apikey', 'helloworld'); 
      formData.append('language', 'eng');
      formData.append('file', file);
      formData.append('OCREngine', '2'); 

      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.IsErroredOnProcessing) {
        setStatus("API Error: " + result.ErrorMessage[0]);
        return;
      }

      if (result.ParsedResults && result.ParsedResults.length > 0) {
        setCurrentText(result.ParsedResults[0].ParsedText);
        setStatus("Review, edit, or select the text below before saving.");
      } else {
        setStatus("No text detected in the image.");
      }
    } catch (error) {
      console.error(error);
      setStatus("Network error during scanning.");
    } finally {
      setIsScanning(false);
      event.target.value = null; 
    }
  };

  const saveCurrentTag = async () => {
    if (!currentText.trim()) {
      setStatus("Text box is empty.");
      return;
    }
    
    setStatus("Getting GPS location...");
    const coords = await getLocation();
    
    const newTag = {
      data: currentText.trim(),
      location: coords,
      timestamp: new Date().toISOString()
    };

    if (isOnline) {
      setStatus("Saving to cloud database...");
      const { error } = await supabase
        .from('spool_data')
        .insert([{ scanned_text: newTag.data, location: newTag.location, created_at: newTag.timestamp }]);
        
      if (error) {
        setOfflineQueue(prev => [...prev, newTag]);
        setStatus(`Cloud save failed: ${error.message}. Saved to offline queue.`);
      } else {
        setStatus("Successfully saved to cloud.");
      }
    } else {
      setOfflineQueue(prev => [...prev, newTag]);
      setStatus("Saved offline. Will sync when internet returns.");
    }
    
    setCurrentText("");
  };

  const exportLocalQueueToExcel = () => {
    if (offlineQueue.length === 0) {
      setStatus("Local queue is empty. No backup needed.");
      return;
    }
    const excelData = offlineQueue.map(tag => ({
      "Scanned Text": tag.data,
      "Location Coordinates": tag.location || "N/A",
      "Date & Time": new Date(tag.timestamp).toLocaleString()
    }));
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Local_Queue_Backup");
    XLSX.writeFile(workbook, `Spool_LocalBackup_${Date.now()}.xlsx`);
    setStatus("Local backup downloaded.");
  };

  const downloadOverallReport = async () => {
    setIsMenuOpen(false);
    setStatus("Fetching overall report from cloud...");
    if (!isOnline) {
      setStatus("Cannot download overall report while offline.");
      return;
    }
    const { data, error } = await supabase
      .from('spool_data')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      setStatus("Failed to fetch report or database is empty.");
      return;
    }
    const excelData = data.map(tag => ({
      "Scanned Text": tag.scanned_text,
      "Location Coordinates": tag.location || "N/A",
      "Date & Time": new Date(tag.created_at).toLocaleString()
    }));
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Overall_Report");
    XLSX.writeFile(workbook, `LNT_Overall_Spool_Report_${Date.now()}.xlsx`);
    setStatus("Overall report downloaded successfully.");
  };

  return (
    <div style={{ backgroundColor: '#121212', color: '#e0e0e0', minHeight: '100vh', padding: '20px', fontFamily: 'system-ui', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      
      {/* ========================================= */}
      {/* LIVE FULL-SCREEN QR SCANNER OVERLAY       */}
      {/* ========================================= */}
      {showLiveQR && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          
          {/* Top Bar with Close Button */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', boxSizing: 'border-box', zIndex: 10 }}>
            <h3 style={{ margin: 0, color: '#00E5FF' }}>Scan QR Code</h3>
            <button onClick={() => setShowLiveQR(false)} style={{ background: 'none', border: 'none', color: '#ff5252', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}>✖ Close</button>
          </div>
          
          {/* Live Video Feed */}
          <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          
          {/* Payment App Scanner UI (Darkens rest of screen, highlights center box) */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '250px', height: '250px', border: '3px solid #00E5FF', borderRadius: '20px', boxShadow: '0 0 0 4000px rgba(0,0,0,0.65)', pointerEvents: 'none', zIndex: 5 }}></div>
          <p style={{ position: 'absolute', bottom: '15%', color: '#00E5FF', fontWeight: 'bold', zIndex: 10 }}>Align QR Code inside the box</p>
        </div>
      )}

      {/* ========================================= */}
      {/* MAIN APP HOME SCREEN                        */}
      {/* ========================================= */}
      <div style={{ maxWidth: '600px', margin: '0 auto', flex: 1, width: '100%', position: 'relative' }}>
        
        {/* HEADER AREA */}
        <div style={{ borderBottom: '1px solid #333', paddingBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="url(#silver-grad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <defs>
                <linearGradient id="silver-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="50%" stopColor="#b8c6db" />
                  <stop offset="100%" stopColor="#757f9a" />
                </linearGradient>
              </defs>
              <path d="M4 7V4h3M17 4h3v3M4 17v3h3M17 20h3v-3M9 9h6v6H9z" />
            </svg>
            <h2 style={{ margin: 0, background: 'linear-gradient(135deg, #ffffff 0%, #b8c6db 50%, #757f9a 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: '900', letterSpacing: '0.5px' }}>
              Spool Scanner
            </h2>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }} ref={menuRef}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: isOnline ? '#00E676' : '#ff5252', boxShadow: `0 0 8px ${isOnline ? '#00E676' : '#ff5252'}` }} title={isOnline ? "Online" : "Offline"} />
            
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} style={{ background: 'none', border: 'none', color: '#b8c6db', cursor: 'pointer', padding: '5px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>

            {isMenuOpen && (
              <div style={{ position: 'absolute', top: '50px', right: '0', backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '240px' }}>
                <button onClick={downloadOverallReport} style={{ backgroundColor: 'transparent', color: '#00E676', border: 'none', padding: '10px', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                  📥 Download Cloud Report
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* === LIVE QR SCANNER BUTTON === */}
        <div style={{ marginBottom: '10px' }}>
          <button onClick={() => setShowLiveQR(true)} style={{ width: '100%', backgroundColor: '#00E5FF', color: '#121212', padding: '15px 10px', borderRadius: '8px', display: 'flex', justifyContent: 'center', fontWeight: 'bold', cursor: 'pointer', border: 'none', fontSize: '16px', boxShadow: '0 4px 6px rgba(0, 229, 255, 0.2)' }}>
            🔳 Live QR Scanner
          </button>
        </div>

        {/* OCR TEXT BUTTONS (CAMERA & GALLERY) */}
        <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
          <label style={{ flex: 1, backgroundColor: '#00E676', color: '#121212', padding: '15px 10px', borderRadius: '8px', display: 'flex', justifyContent: 'center', fontWeight: 'bold', cursor: 'pointer', opacity: isScanning ? 0.7 : 1, textAlign: 'center', boxShadow: '0 4px 6px rgba(0, 230, 118, 0.2)' }}>
            {isScanning ? "⏳..." : "📷 OCR Camera"}
            <input type="file" accept="image/*" capture="environment" onChange={handleTextCapture} disabled={isScanning} style={{ display: 'none' }} />
          </label>
          
          <label style={{ flex: 1, backgroundColor: '#1e1e1e', color: '#00E676', border: '2px solid #00E676', padding: '15px 10px', borderRadius: '8px', display: 'flex', justifyContent: 'center', fontWeight: 'bold', cursor: 'pointer', opacity: isScanning ? 0.7 : 1, textAlign: 'center' }}>
            {isScanning ? "⏳..." : "🖼️ OCR Gallery"}
            <input type="file" accept="image/*" onChange={handleTextCapture} disabled={isScanning} style={{ display: 'none' }} />
          </label>
        </div>

        <p style={{ color: '#aaa', fontStyle: 'italic', minHeight: '24px', fontSize: '0.9em' }}>{status}</p>

        <div style={{ marginBottom: '20px' }}>
          <textarea 
            value={currentText} onChange={(e) => setCurrentText(e.target.value)} placeholder="Scanned text will appear here. You can edit this before saving..."
            style={{ width: '100%', height: '120px', backgroundColor: '#1e1e1e', color: '#00E676', border: '1px solid #00E676', borderRadius: '8px', padding: '12px', boxSizing: 'border-box', fontSize: '16px', outline: 'none', resize: 'vertical' }}
          />
        </div>

        {/* ALWAYS VISIBLE BUTTONS */}
        <button onClick={saveCurrentTag} style={{ backgroundColor: 'transparent', color: '#00E676', padding: '12px 20px', borderRadius: '8px', border: '2px solid #00E676', fontWeight: 'bold', width: '100%', marginBottom: '15px', cursor: 'pointer' }}>
          ➕ Save to Cloud
        </button>

        <button onClick={exportLocalQueueToExcel} style={{ backgroundColor: 'transparent', color: '#b8c6db', padding: '12px 20px', borderRadius: '8px', border: '1px solid #b8c6db', fontWeight: 'bold', width: '100%', marginBottom: '30px', cursor: 'pointer' }}>
          💾 Download Local Backup
        </button>

        {/* OFFLINE QUEUE WARNING */}
        {offlineQueue.length > 0 && (
          <div style={{ backgroundColor: '#ff525220', border: '1px solid #ff5252', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
            <h4 style={{ color: '#ff5252', margin: '0 0 10px 0' }}>⚠️ Offline Sync Queue</h4>
            <p style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#e0e0e0' }}>{offlineQueue.length} tag(s) waiting for internet connection.</p>
            
            {isOnline && (
              <button onClick={syncOfflineData} style={{ backgroundColor: '#ff5252', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>
                🔄 Sync Now
              </button>
            )}
          </div>
        )}

        <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #333', textAlign: 'center', fontSize: '11px', color: '#555', letterSpacing: '0.5px' }}>
          developed by Digital Team, L&T, RIL NMD project
        </div>
      </div>
    </div>
  );
}