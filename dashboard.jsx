import React from 'react';
import './Dashboard.css';

const Dashboard = ({
  CIO,
  selectedCIO,
  owners,
  loading,
  onCIOChange,
  onOwnerClick,
}) => {
  return (
    <div className="dashboard-container">
      <div className="CIO-selector-section">
        <div className="selector-card">
          <label htmlFor="CIO-select" className="selector-label">
            <span className="label-icon"></span>
            Select Chief Information Officer
          </label>

          <select
            id="CIO-select"
            className="CIO-select"
            value={selectedCIO}
            onChange={(e) => onCIOChange(e.target.value)}
            disabled={loading}
          >
            <option value="">-- Choose a CIO --</option>
            {CIO.map((cio) => (
              <option key={cio} value={cio}>
                {cio.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading data...</p>
        </div>
      )}

      {selectedCIO && !loading && owners.length > 0 && (
        <div className="owners-section">
          <h2 className="section-title">
            <span className="title-icon"></span>
            Data Owners under {selectedCIO.toUpperCase()}
          </h2>

          <div className="owners-grid">
            {owners.map((owner) => (
              <div
                key={owner}
                className="owner-card"
                onClick={() => onOwnerClick(owner)}
              >
                <div className="owner-avatar">
                  {owner.charAt(0).toUpperCase()}
                </div>

                <h3 className="owner-name">{owner}</h3>
                <p className="owner-subtitle">View Analytics</p>

                <div className="owner-stats">
                  <span className="stat-badge">4 Metrics</span>
                  <span className="stat-badge">8 Periods</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedCIO && !loading && owners.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon"></span>
          <p>No owners found for this CIO.</p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
