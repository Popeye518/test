import React, { useMemo } from 'react';
import './DetailsModal.css';

const DetailsModal = ({ title, data, columns, loading, onClose, threshold, clickedValue }) => {

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

  // 1. Top 3 Best Performers — lowest value is best
  const top3Apps = useMemo(() => {
    if (!data || data.length === 0) return [];
    const seen = new Set();
    return data
      .filter(row => row.Application && !isNaN(parseFloat(row.Value)))
      .sort((a, b) => parseFloat(a.Value) - parseFloat(b.Value))
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

  // 3. Worst Performer — highest value is worst
  const worstPerformer = useMemo(() => {
    if (!data || data.length === 0) return null;
    return data
      .filter(row => !isNaN(parseFloat(row.Value)))
      .sort((a, b) => parseFloat(b.Value) - parseFloat(a.Value))[0] || null;
  }, [data]);

  // 4. Period Snapshot
  const periodSnapshot = useMemo(() => {
    if (!data || data.length === 0) return null;
    const total = data.length;
    const uniqueApps = new Set(data.map(r => r.Application).filter(Boolean)).size;
    const uniqueNARs = new Set(data.map(r => r.NAR_ID).filter(Boolean)).size;
    return { total, uniqueApps, uniqueNARs };
  }, [data]);

  // 5. Value Distribution — threshold based
  // 🟢 Green  = below threshold (good)
  // 🟡 Yellow = at threshold (±0.5 tolerance)
  // 🔴 Red    = above threshold (bad)
  const valueDistribution = useMemo(() => {
    if (!data || data.length === 0 || threshold === null || threshold === undefined) return null;
    const values = data.map(r => parseFloat(r.Value)).filter(v => !isNaN(v));
    const tolerance = 0.5;
    const good     = values.filter(v => v < threshold - tolerance).length;
    const atThresh = values.filter(v => v >= threshold - tolerance && v <= threshold + tolerance).length;
    const bad      = values.filter(v => v > threshold + tolerance).length;
    return { good, atThresh, bad, total: values.length };
  }, [data, threshold]);

  // 6. Below Average (lower = better)
  const belowAverage = useMemo(() => {
    if (!data || data.length === 0) return null;
    const values = data.map(r => parseFloat(r.Value)).filter(v => !isNaN(v));
    if (!values.length) return null;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const goodCount = values.filter(v => v < avg).length;
    return { goodCount, total: values.length, avg: avg.toFixed(1) };
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
            {/* ── Period Snapshot Banner ── */}
            {periodSnapshot && (
              <div className="period-snapshot">
                📋 <strong>{periodSnapshot.total}</strong> records across&nbsp;
                <strong>{periodSnapshot.uniqueApps}</strong> unique applications&nbsp;|&nbsp;
                Graph Value: <strong>{clickedValue ?? '-'}</strong>&nbsp;|&nbsp;
                Unique NARs: <strong>{periodSnapshot.uniqueNARs}</strong>
                {threshold !== null && threshold !== undefined && (
                  <>&nbsp;|&nbsp;Threshold: <strong>{threshold}</strong></>
                )}
              </div>
            )}

            {/* ── Table (filtered data) ── */}
            <div className="details-table-container">
              {data && data.length > 0 ? (
                filteredRows.length > 0 ? (
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
                  <div className="no-data-message">
                    <span className="no-data-icon">📭</span>
                    <p>No records with value greater than 10 found for this selected period.</p>
                  </div>
                )
              ) : (
                <div className="no-data-message">
                  <span className="no-data-icon">📭</span>
                  <p>No details available for this period.</p>
                </div>
              )}
            </div>

            {/* ── Insights ── */}
            {(top3Apps.length > 0 || mostFrequentApp || worstPerformer) && (
              <div className="insights-section">
                <h3 className="insights-heading">📊 Insights</h3>
                <div className="insights-grid">

                  {/* 1. Top 3 Best Performers — full width podium */}
                  {top3Apps.length > 0 && (
                    <div className="insight-card top-performers-card">
                      <div className="top-performers-header">
                        <div className="insight-card-title">🏆 Top Performers</div>
                        <div className="insight-card-subtitle">Lower value = better</div>
                      </div>
                      <div className="top-performers-grid">
                        {top3Apps.map((app, i) => (
                          <div className={`top-performer-tile rank-${i + 1}`} key={i}>
                            <span className="top-tile-medal">{medals[i]}</span>
                            <span className="top-tile-name">{app.name}</span>
                            <span className="top-tile-value">{app.value}</span>
                            <span className="top-tile-label">Value</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. Most Frequent */}
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

                  {/* 3. Worst Performer */}
                  {worstPerformer && (
                    <div className="insight-card">
                      <div className="insight-card-title">📉 Worst Performer</div>
                      <div className="insight-highlight-box red">
                        <span className="insight-big-text">{worstPerformer.Application}</span>
                        <span className="insight-sub-text">
                          Value: <strong>{parseFloat(worstPerformer.Value).toFixed(1)}</strong>
                        </span>
                        {worstPerformer.Change_ID && (
                          <span className="insight-sub-text">Change ID: {worstPerformer.Change_ID}</span>
                        )}
                        {worstPerformer.Incident_ID && (
                          <span className="insight-sub-text">Incident ID: {worstPerformer.Incident_ID}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 4. Value Distribution — stacked layout */}
                  {valueDistribution && (
                    <div className="insight-card">
                      <div className="insight-card-title">📊 Value Distribution</div>
                      <div className="insight-card-subtitle">Threshold: {threshold}</div>
                      <div className="distribution-list">

                        <div className="dist-block">
                          <span className="dist-block-label">🟢 Below (&lt;{threshold})</span>
                          <div className="dist-bar-wrap">
                            <span
                              className="dist-bar green"
                              style={{ width: `${(valueDistribution.good / valueDistribution.total) * 100}%` }}
                            />
                          </div>
                          <span className="dist-block-count">{valueDistribution.good} records</span>
                        </div>

                        <div className="dist-block">
                          <span className="dist-block-label">🟡 At (~{threshold})</span>
                          <div className="dist-bar-wrap">
                            <span
                              className="dist-bar yellow"
                              style={{ width: `${(valueDistribution.atThresh / valueDistribution.total) * 100}%` }}
                            />
                          </div>
                          <span className="dist-block-count">{valueDistribution.atThresh} records</span>
                        </div>

                        <div className="dist-block">
                          <span className="dist-block-label">🔴 Above (&gt;{threshold})</span>
                          <div className="dist-bar-wrap">
                            <span
                              className="dist-bar red"
                              style={{ width: `${(valueDistribution.bad / valueDistribution.total) * 100}%` }}
                            />
                          </div>
                          <span className="dist-block-count">{valueDistribution.bad} records</span>
                        </div>

                      </div>
                    </div>
                  )}

                  {/* 5. Below Average */}
                  {belowAverage && (
                    <div className="insight-card">
                      <div className="insight-card-title">✅ Below Average</div>
                      <div className="insight-card-subtitle">Below avg = performing better</div>
                      <div className="insight-highlight-box blue">
                        <span className="insight-big-number">
                          {belowAverage.goodCount}
                          <span className="insight-out-of">/{belowAverage.total}</span>
                        </span>
                        <span className="insight-sub-text">
                          records below avg value of <strong>{belowAverage.avg}</strong>
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
