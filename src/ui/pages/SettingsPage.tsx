import React, { useState } from 'react';
import { api } from '../api/client';

export function SettingsPage() {
  const [downloadDir, setDownloadDir] = useState('');
  const [maxConcurrent, setMaxConcurrent] = useState(3);

  async function handleSelectDir() {
    const dir = await api.system.selectDirectory();
    if (dir) setDownloadDir(dir);
  }

  return (
    <div className="page">
      <h2>Settings</h2>

      <div className="form-card">
        <h3>Download Settings</h3>
        <div className="form-group">
          <label>Default Download Directory</label>
          <div className="input-with-button">
            <input value={downloadDir} readOnly placeholder="Select a directory..." />
            <button className="btn" onClick={handleSelectDir}>Browse</button>
          </div>
        </div>
        <div className="form-group">
          <label>Max Concurrent Downloads</label>
          <input
            type="number"
            min={1}
            max={10}
            value={maxConcurrent}
            onChange={(e) => setMaxConcurrent(Number(e.target.value))}
          />
        </div>

        <h3>File Organization</h3>
        <div className="form-group">
          <label>Folder Structure Template</label>
          <input defaultValue="{account}/{year}-{month}/{topic}" readOnly />
          <small>Customize how downloaded files are organized</small>
        </div>
      </div>
    </div>
  );
}
