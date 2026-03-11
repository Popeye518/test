import React, { useMemo } from 'react';
import './DetailsModal.css';

const DetailsModal = ({ title, data, columns, loading, onClose }) => {

  // ── Table uses FILTERED data (Value > 10) ──
  const filterData = (data) => {
    if (!data) return [];
    return data.filter(item => {
      const value = item.Value;
      let shouldInclude = false;
      if (!isNaN(value) && value > 10) shouldInclude = true;
      return shouldInclude;
    });
  };

  const filteredRows = useMemo(() => filterData(data), [data]);

  // ── All Insights use RAW data ──

  // 1. Top 3 Best Performers
  const top3Apps = useMemo(() => {
    if (!data || data.length === 0) return [];
    const seen = new Set();
    return data
      .filter(row => row.Application && !isNaN(parseFloat(row.Value)))
      .sort((a, b) => parseFloat(b.Value) - parseFloat(a.Value))
      .filter(row => {
        if (seen.has(row.Application)) return false;
        seen.add(row.Application);
        return true;
      })
      .slice(0, 3)
      .map(row => ({ name: row.Application, value: parseFloat(row.Value).toFixed(1) }));
  }, [data]);

  // 2. Most Frequent Application
  const mostFrequentApp = useMemo(() => {
    if (!data || data.length === 0) return null;
    const countMap = {};
    data.forEach(row => {
      if (row.Application) countMap[row.Application] = (countMap[row.Application] || 0) + 1;
    });
    const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? { name: sorted[0][0], count: sorted[0][1] } : null;
  }, [data]);

  // 3. Lowest Performer
  const lowestPerformer = useMemo(() => {
    if (!data || data.length === 0) return null;
    return data
      .filter(row => !isNaN(parseFloat(row.Value)))
      .sort((a, b) => parseFloat(a.Value) - parseFloat(b.Value))[0] || null;
  }, [data]);

  // 4. Period Snapshot
  const periodSnapshot = useMemo(() => {
    if (!data || data.length === 0) return null;
    const total = data.length;
    const uniqueApps = new Set(data.map(r => r.Application).filter(Boolean)).size;
    const values = data.map(r => parseFloat(r.Value)).filter(v => !isNaN(v));
    const avg = values.length
      ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
      : '-';
    const uniqueNARs = new Set(data.map(r => r.NAR_ID).filter(Boolean)).size;
    return { total, uniqueApps, avg, uniqueNARs };
  }, [data]);

  // 5. Value Distribution
  const valueDistribution = useMemo(() => {
    if (!data || data.length === 0) return null;
    const values = data.map(r => parseFloat(r.Value)).filter(v => !isNaN(v));
    const low  = values.filter(v => v <= 20).length;
    const mid  = values.filter(v => v > 20 && v <= 50).length;
    const high = values.filter(v => v > 50).length;
    return { low, mid, high, total: values.length };
  }, [data]);

  // 6. Above Average
  const aboveAverage = useMemo(() => {
    if (!data || data.length === 0) return null;
    const values = data.map(r => parseFloat(r.Value)).filter(v => !isNaN(v));
    if (!values.length) return null;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const aboveCount = values.filter(v => v > avg).length;
    return { aboveCount, total: values.length, avg: avg.toFixed(1) };
  }, [data]);

  // 7. Repeat Offenders
  const repeatOffenders = useMemo(() => {
    if (!data || data.length === 0) return [];
    const countMap = {};
    data.forEach(row => {
      if (row.Application) countMap[row.Application] = (countMap[row.Application] || 0) + 1;
    });
    return Object.entries(countMap)
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [data]);

  const medals = ['🥇', '🥈', '🥉'];
  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

  if (!data && !loading) return null;

  return (
    <div className="modal-overlay">
      <div className="details-modal-content">

        {/* ── Header ── */}
        <div className="modal-header improved-header">
          <h2 className="modal-title">{title}</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {loading ? (
          <div className="loading-overlay">
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Loading details...</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Period Snapshot Banner (raw data) ── */}
            {periodSnapshot && (
              <div className="period-snapshot">
                📋 <strong>{periodSnapshot.total}</strong> records across&nbsp;
                <strong>{periodSnapshot.uniqueApps}</strong> unique applications&nbsp;|&nbsp;
                Avg Value: <strong>{periodSnapshot.avg}</strong>&nbsp;|&nbsp;
                Unique NARs: <strong>{periodSnapshot.uniqueNARs}</strong>
              </div>
            )}

            {/* ── Table (filtered data) ── */}
            <div className="details-table-container">
              {data && data.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      {columns.map(col => <th key={col.key}>{col.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, index) => (
                      <tr key={index} className="table-row-hover">
                        {columns.map(col => (
                          <td key={col.key}>{row[col.key]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No details available for this period.</p>
              )}
            </div>

            {/* ── Insights (all on raw data) ── */}
            {(top3Apps.length > 0 || mostFrequentApp || lowestPerformer) && (
              <div className="insights-section">
                <h3 className="insights-heading">📊 Insights</h3>
                <div className="insights-grid">

                  {/* 1. Top 3 Best Performers */}
                  {top3Apps.length > 0 && (
                    <div className="insight-card">
                      <div className="insight-card-title">🏆 Top Performers</div>
                      <div className="top-apps-list">
                        {top3Apps.map((app, i) => (
                          <div
                            className="top-app-row"
                            key={i}
                            style={{ borderLeft: `3px solid ${medalColors[i]}` }}
                          >
                            <span className="top-app-medal">{medals[i]}</span>
                            <div className="top-app-info">
                              <span className="top-app-name">{app.name}</span>
                              <span className="top-app-score">Value: <strong>{app.value}</strong></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. Most Frequent Application */}
                  {mostFrequentApp && (
                    <div className="insight-card">
                      <div className="insight-card-title">⚠️ Most Frequent</div>
                      <div className="insight-highlight-box orange">
                        <span className="insight-big-text">{mostFrequentApp.name}</span>
                        <span className="insight-sub-text">
                          Appears <strong>{mostFrequentApp.count}</strong> time{mostFrequentApp.count > 1 ? 's' : ''} in this period
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 3. Lowest Performer */}
                  {lowestPerformer && (
                    <div className="insight-card">
                      <div className="insight-card-title">📉 Lowest Performer</div>
                      <div className="insight-highlight-box red">
                        <span className="insight-big-text">{lowestPerformer.Application}</span>
                        <span className="insight-sub-text">
                          Value: <strong>{parseFloat(lowestPerformer.Value).toFixed(1)}</strong>
                        </span>
                        {lowestPerformer.Change_ID && (
                          <span className="insight-sub-text">Change ID: {lowestPerformer.Change_ID}</span>
                        )}
                        {lowestPerformer.Incident_ID && (
                          <span className="insight-sub-text">Incident ID: {lowestPerformer.Incident_ID}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 4. Value Distribution */}
                  {valueDistribution && (
                    <div className="insight-card">
                      <div className="insight-card-title">📊 Value Distribution</div>
                      <div className="distribution-list">
                        <div className="dist-row">
                          <span className="dist-label">🟢 High (&gt;50)</span>
                          <span className="dist-bar-wrap">
                            <span
                              className="dist-bar green"
                              style={{ width: `${(valueDistribution.high / valueDistribution.total) * 100}%` }}
                            />
                          </span>
                          <span className="dist-count">{valueDistribution.high}</span>
                        </div>
                        <div className="dist-row">
                          <span className="dist-label">🟡 Mid (21–50)</span>
                          <span className="dist-bar-wrap">
                            <span
                              className="dist-bar yellow"
                              style={{ width: `${(valueDistribution.mid / valueDistribution.total) * 100}%` }}
                            />
                          </span>
                          <span className="dist-count">{valueDistribution.mid}</span>
                        </div>
                        <div className="dist-row">
                          <span className="dist-label">🔴 Low (≤20)</span>
                          <span className="dist-bar-wrap">
                            <span
                              className="dist-bar red"
                              style={{ width: `${(valueDistribution.low / valueDistribution.total) * 100}%` }}
                            />
                          </span>
                          <span className="dist-count">{valueDistribution.low}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 5. Above Average */}
                  {aboveAverage && (
                    <div className="insight-card">
                      <div className="insight-card-title">✅ Above Average</div>
                      <div className="insight-highlight-box blue">
                        <span className="insight-big-number">
                          {aboveAverage.aboveCount}
                          <span className="insight-out-of">/{aboveAverage.total}</span>
                        </span>
                        <span className="insight-sub-text">
                          records above avg value of <strong>{aboveAverage.avg}</strong>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 6. Repeat Offenders */}
                  {repeatOffenders.length > 0 && (
                    <div className="insight-card">
                      <div className="insight-card-title">🔁 Repeat Offenders</div>
                      <div className="repeat-list">
                        {repeatOffenders.slice(0, 4).map((app, i) => (
                          <div className="repeat-row" key={i}>
                            <span className="repeat-name">{app.name}</span>
                            <span className="repeat-badge">{app.count}x</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DetailsModal;
