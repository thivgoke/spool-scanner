import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

export default function App() {
  const [scannedTags, setScannedTags] = useState(() => {
    const saved = localStorage.getItem('lnt_spool_tags');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState("Ready to scan");
  const [currentText, setCurrentText] = useState("");

  useEffect(() => {
    localStorage.setItem('lnt_spool_tags', JSON.stringify(scannedTags));
  }, [scannedTags]);

  const handleImageCapture = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsScanning(true);
    setStatus("Uploading to OCR API...");
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

  const saveCurrentTag = () => {
    if (!currentText.trim()) {
      setStatus("Text box is empty. Scan an image first.");
      return;
    }
    
    setScannedTags(prev => [...prev, {
      id: Date.now().toString(),
      data: currentText.trim(),
      timestamp: new Date().toLocaleString() 
    }]);
    
    setCurrentText("");
    setStatus("Successfully added to list.");
  };

  const exportToExcel = () => {
    if (scannedTags.length === 0) return;
    
    const excelData = scannedTags.map(tag => ({
      "Scanned Text": tag.data,
      "Date & Time": tag.timestamp
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "SpoolTags");
    XLSX.writeFile(workbook, `Spool_Export_${Date.now()}.xlsx`);
  };

  const clearList = () => {
    if (window.confirm("Are you sure you want to clear all saved tags? Make sure you exported them first!")) {
      setScannedTags([]);
      setCurrentText("");
      setStatus("List cleared.");
    }
  };

  return (
    <div style={{ 
      backgroundColor: '#121212', 
      color: '#e0e0e0', 
      minHeight: '100vh', 
      padding: '20px', 
      fontFamily: 'system-ui',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', flex: 1, width: '100%' }}>
        
        {/* HEADER AREA */}
        <div style={{ 
          borderBottom: '1px solid #333', 
          paddingBottom: '15px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* INLINE SVG LOGO (Scanner / Crop Icon) */}
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
            
            {/* SILVER GRADIENT STYLISH TEXT */}
            <h2 style={{ 
              margin: 0,
              background: 'linear-gradient(135deg, #ffffff 0%, #b8c6db 50%, #757f9a 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: '900',
              letterSpacing: '0.5px'
            }}>
              Spool Scanner
            </h2>
          </div>

          {scannedTags.length > 0 && (
            <button onClick={clearList} style={{ backgroundColor: 'transparent', color: '#ff5252', border: '1px solid #ff5252', borderRadius: '4px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}>
              Clear
            </button>
          )}
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            backgroundColor: '#00E676', color: '#121212', padding: '15px 20px',
            borderRadius: '8px', display: 'flex', justifyContent: 'center', 
            fontWeight: 'bold', cursor: 'pointer', opacity: isScanning ? 0.7 : 1,
            boxShadow: '0 4px 6px rgba(0, 230, 118, 0.2)'
          }}>
            {isScanning ? "⏳ Processing Image..." : "📷 Open Camera / Gallery"}
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleImageCapture} 
              disabled={isScanning}
              style={{ display: 'none' }} 
            />
          </label>
        </div>

        <p style={{ color: '#aaa', fontStyle: 'italic', minHeight: '24px', fontSize: '0.9em' }}>
          {status}
        </p>

        <div style={{ marginBottom: '20px' }}>
          <textarea 
            value={currentText}
            onChange={(e) => setCurrentText(e.target.value)}
            placeholder="Scanned text will appear here. You can edit this before saving..."
            style={{
              width: '100%', height: '120px', backgroundColor: '#1e1e1e', 
              color: '#00E676', border: '1px solid #00E676', borderRadius: '8px', 
              padding: '12px', boxSizing: 'border-box', fontSize: '16px',
              outline: 'none', resize: 'vertical'
            }}
          />
        </div>

        <button 
          onClick={saveCurrentTag}
          style={{
            backgroundColor: 'transparent', color: '#00E676', padding: '12px 20px',
            borderRadius: '8px', border: '2px solid #00E676', fontWeight: 'bold', 
            width: '100%', marginBottom: '30px', cursor: 'pointer'
          }}
        >
          ➕ Save Text to List
        </button>

        <button 
          onClick={exportToExcel}
          disabled={scannedTags.length === 0}
          style={{
            backgroundColor: scannedTags.length === 0 ? '#333' : '#00E676', 
            color: scannedTags.length === 0 ? '#666' : '#121212', padding: '15px 20px',
            borderRadius: '8px', border: 'none', fontWeight: 'bold', width: '100%', 
            marginBottom: '20px', cursor: scannedTags.length === 0 ? 'not-allowed' : 'pointer',
            boxShadow: scannedTags.length === 0 ? 'none' : '0 4px 6px rgba(0, 230, 118, 0.2)'
          }}
        >
          📊 Export List to Excel
        </button>

        <div>
          <h3 style={{ color: '#00E676', fontSize: '1.1em' }}>Saved Tags ({scannedTags.length})</h3>
          {scannedTags.length === 0 ? (
            <p style={{ color: '#555', fontSize: '0.9em' }}>No tags saved yet.</p>
          ) : (
            scannedTags.map(tag => (
              <div key={tag.id} style={{ 
                padding: '15px', backgroundColor: '#1e1e1e', 
                borderLeft: '4px solid #00E676', borderRadius: '4px',
                marginBottom: '10px' 
              }}>
                <strong style={{ fontSize: '1.05em', color: '#e0e0e0', whiteSpace: 'pre-wrap' }}>
                  {tag.data}
                </strong>
                <br/>
                <small style={{ color: '#777', display: 'block', marginTop: '8px' }}>
                  {tag.timestamp}
                </small>
              </div>
            ))
          )}
        </div>

        {/* FOOTER AREA */}
        <div style={{ 
          marginTop: '40px', 
          paddingTop: '20px', 
          borderTop: '1px solid #333', 
          textAlign: 'center', 
          fontSize: '11px', 
          color: '#555',
          letterSpacing: '0.5px'
        }}>
          developed by Digital Team, L&T, RIL NMD project
        </div>
        
      </div>
    </div>
  );
}