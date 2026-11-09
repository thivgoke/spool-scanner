import React, { useState } from 'react';
import * as XLSX from 'xlsx';

export default function App() {
  const [scannedTags, setScannedTags] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState("Ready to scan");
  const [currentText, setCurrentText] = useState(""); // Holds raw text for user editing

  const handleImageCapture = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsScanning(true);
    setStatus("Uploading to OCR API...");
    setCurrentText(""); // Clear previous text

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
        // Output ALL extracted text to the state instead of filtering with Regex
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
      // Reset file input so you can scan the same image again if needed
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
    const worksheet = XLSX.utils.json_to_sheet(scannedTags);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "SpoolTags");
    XLSX.writeFile(workbook, `Spool_Export_${Date.now()}.xlsx`);
  };

  return (
    <div style={{ 
      backgroundColor: '#121212', 
      color: '#e0e0e0', 
      minHeight: '100vh', 
      padding: '20px', 
      fontFamily: 'system-ui',
      boxSizing: 'border-box'
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        
        <h2 style={{ color: '#00E676', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          L&T Spool Scanner
        </h2>
        
        {/* CAMERA BUTTON */}
        <div style={{ marginBottom: '20px', marginTop: '20px' }}>
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
              capture="environment" 
              onChange={handleImageCapture} 
              disabled={isScanning}
              style={{ display: 'none' }} 
            />
          </label>
        </div>

        <p style={{ color: '#aaa', fontStyle: 'italic', minHeight: '24px', fontSize: '0.9em' }}>
          {status}
        </p>

        {/* EDITABLE TEXT AREA (Shows all OCR text) */}
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

        {/* SAVE TO LIST BUTTON */}
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

        {/* EXPORT BUTTON */}
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

        {/* SCANNED TAGS LIST */}
        <div>
          <h3 style={{ color: '#00E676' }}>Saved Tags ({scannedTags.length})</h3>
          {scannedTags.length === 0 ? (
            <p style={{ color: '#555' }}>No tags saved yet.</p>
          ) : (
            scannedTags.map(tag => (
              <div key={tag.id} style={{ 
                padding: '15px', backgroundColor: '#1e1e1e', 
                borderLeft: '4px solid #00E676', borderRadius: '4px',
                marginBottom: '10px' 
              }}>
                {/* white-space: pre-wrap preserves multiple lines if the user saved a block of text */}
                <strong style={{ fontSize: '1.1em', color: '#e0e0e0', whiteSpace: 'pre-wrap' }}>
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
        
      </div>
    </div>
  );
}