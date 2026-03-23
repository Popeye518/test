import React, { useMemo } from 'react';
import './DetailsModal.css';

const DetailsModal = ({
  title,
  data,
  columns,
  loading,
  onClose,
  threshold,
  clickedValue
}) => {
  const alertThreshold = useMemo(() => {
    const lowerTitle = (title || '').toLowerCase();

    if (lowerTitle.includes('graph 4')) return 12;
    if (lowerTitle.includes('graph 2')) return 10;
    if (lowerTitle.includes('graph 3') || lowerTitle.includes('cfr')) return 10;

    return threshold ?? 10;
  }, [title, threshold]);

  const filterData = (rows) => {
    if (!rows) return [];

    return rows.filter((item) => {
      const value = parseFloat(item.Value);
      return !isNaN(value) && value > alertThreshold;
    });
  };

  const filteredRows = useMemo(() => filterData(data), [data, alertThreshold]);

  const top3Apps = useMemo(() => {
    if (!data || data.length === 0) return [];

    const seen = new Set();

    return data
      .filter((row) => row.Application && !isNaN(parseFloat(row.Value)))
      .sort((a, b) => parseFloat(a.Value) - parseFloat(b.Value))
      .filter((row) => {
        if (seen.has(row.Application)) return false;
        seen.add(row.Application);
        return true;
      })
      .slice(0, 3)
      .map((row) => ({
        name: row.Application,
        narId: row.NAR_ID,
        value: parseFloat(row.Value).toFixed(1)
      }));
  }, [data]);

  const attentionApps = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data
      .filter((row) => {
        const value = parseFloat(row.Value);
        return row.Application && !isNaN(value) && value > alertThreshold;
      })
      .sort((a, b) => parseFloat(b.Value) - parseFloat(a.Value))
      .map((row) => ({
        name: row.Application,
        narId: row.NAR_ID,
        value: parseFloat(row.Value).toFixed(1)
      }));
  }, [data, alertThreshold]);

  const mostFrequentApp = useMemo(() => {
    if (!data || data.length === 0) return null;

    const countMap = {};
    data.forEach((row) => {
      if (row.Application) {
        countMap[row.Application] = (countMap[row.Application] || 0) + 1;
      }
    });

    const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]);

    return sorted.length > 0
      ? { name: sorted[0][0], count: sorted[0][1] }
      : null;
  }, [data]);

  const periodSnapshot = useMemo(() => {
    if (!data || data.length === 0) return null;

    const total = data.length;
    const uniqueApps = new Set(data.map((r) => r.Application).filter(Boolean)).size;
    const uniqueNARs = new Set(data.map((r) => r.NAR_ID).filter(Boolean)).size;

    return { total, uniqueApps, uniqueNARs };
  }, [data]);

  const valueDistribution = useMemo(() => {
    if (!data || data.length === 0 || threshold === null || threshold === undefined) {
      return null;
    }

    const values = data.map((r) => parseFloat(r.Value)).filter((v) => !isNaN(v));
    const tolerance = 0.5;

    const good = values.filter((v) => v < threshold - tolerance).length;
    const atThresh = values.filter(
      (v) => v >= threshold - tolerance && v <= threshold + tolerance
    ).length;
    const bad = values.filter((v) => v > threshold + tolerance).length;

    return { good, atThresh, bad, total: values.length };
  }, [data, threshold]);

  const belowAverage = useMemo(() => {
    if (!data || data.length === 0) return null;

    const values = data.map((r) => parseFloat(r.Value)).filter((v) => !isNaN(v));
    if (!values.length) return null;

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const goodCount = values.filter((v) => v < avg).length;

    return { goodCount, total: values.length, avg: avg.toFixed(1) };
  }, [data]);

  if (!data && !loading) return null;

  return (
    <div className="modal-overlay">
      <div className="details-modal-content">
        <div className="modal-header improved-header">
          <h2 className="modal-title">{title}</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
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
            {periodSnapshot && (
              <div className="period-snapshot">
                <strong>{periodSnapshot.total}</strong> records across{' '}
                <strong>{periodSnapshot.uniqueApps}</strong> unique applications
                &nbsp;&nbsp; Graph Value <strong>{clickedValue ?? '-'}</strong>
                &nbsp;&nbsp; Unique NARs <strong>{periodSnapshot.uniqueNARs}</strong>
                &nbsp;&nbsp; Threshold <strong>{alertThreshold}</strong>
              </div>
            )}

            <div className="details-table-container">
              {data && data.length > 0 ? (
                filteredRows.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        {columns.map((col) => (
                          <th key={col.key}>{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, index) => (
                        <tr key={index} className="table-row-hover">
                          {columns.map((col) => (
                            <td key={col.key}>{row[col.key]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="no-data-message">
                    <span className="no-data-icon">📭</span>
                    <p>No records found above threshold {alertThreshold} for this selected period.</p>
                  </div>
                )
              ) : (
                <div className="no-data-message">
                  <span className="no-data-icon">📭</span>
                  <p>No details available for this period.</p>
                </div>
              )}
            </div>

            {(top3Apps.length > 0 || mostFrequentApp || attentionApps.length > 0 || valueDistribution || belowAverage) && (
              <div className="insights-section">
                <h3 className="insights-heading">Insights</h3>

                <div className="insights-grid">
                  {top3Apps.length > 0 && (
                    <div className="insight-card top-performers-card">
                      <div className="top-performers-header">
                        <div>
                          <div className="insight-card-title">Best Observed Applications</div>
                          <div className="insight-card-subtitle">
                            Lowest values in selected data
                          </div>
                        </div>
                      </div>

                      <div className="top-performers-grid">
                        {top3Apps.map((app, i) => (
                          <div className={`top-performer-tile rank-${i + 1}`} key={i}>
                            <span className="top-tile-name">{app.name}</span>
                            {app.narId && (
                              <span className="top-tile-subtext">NAR ID: {app.narId}</span>
                            )}
                            <span className="top-tile-value">{app.value}</span>
                            <span className="top-tile-label">Value</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {mostFrequentApp && (
                    <div className="insight-card">
                      <div className="insight-card-title">Most Frequent</div>
                      <div className="insight-highlight-box orange">
                        <span className="insight-big-text">{mostFrequentApp.name}</span>
                        <span className="insight-sub-text">
                          Appears <strong>{mostFrequentApp.count}</strong> times in this period
                        </span>
                        <span className="insight-sub-text">
                          Based on number of records, not releases or failures
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="insight-card attention-card">
                    <div className="insight-card-title">Needs Attention</div>
                    <div className="insight-card-subtitle">
                      Applications with value above {alertThreshold}
                    </div>

                    {attentionApps.length > 0 ? (
                      <div className="attention-list">
                        {attentionApps.map((app, i) => (
                          <div className="attention-row" key={`${app.name}-${app.narId || i}`}>
                            <span className="attention-icon">⚠️</span>
                            <div className="attention-content">
                              <span className="attention-name">{app.name}</span>
                              <span className="attention-meta">
                                {app.narId ? `NAR ID: ${app.narId} • ` : ''}
                                Value: {app.value}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="insight-highlight-box blue">
                        <span className="insight-sub-text">
                          No applications above threshold {alertThreshold}
                        </span>
                      </div>
                    )}
                  </div>

                  {valueDistribution && (
                    <div className="insight-card">
                      <div className="insight-card-title">Value Distribution</div>
                      <div className="insight-card-subtitle">Threshold {threshold}</div>

                      <div className="distribution-list">
                        <div className="dist-block">
                          <span className="dist-block-label">Below &lt; {threshold}</span>
                          <div className="dist-bar-wrap">
                            <span
                              className="dist-bar green"
                              style={{ width: `${(valueDistribution.good / valueDistribution.total) * 100}%` }}
                            ></span>
                          </div>
                          <span className="dist-block-count">{valueDistribution.good} records</span>
                        </div>

                        <div className="dist-block">
                          <span className="dist-block-label">At threshold</span>
                          <div className="dist-bar-wrap">
                            <span
                              className="dist-bar yellow"
                              style={{ width: `${(valueDistribution.atThresh / valueDistribution.total) * 100}%` }}
                            ></span>
                          </div>
                          <span className="dist-block-count">{valueDistribution.atThresh} records</span>
                        </div>

                        <div className="dist-block">
                          <span className="dist-block-label">Above &gt; {threshold}</span>
                          <div className="dist-bar-wrap">
                            <span
                              className="dist-bar red"
                              style={{ width: `${(valueDistribution.bad / valueDistribution.total) * 100}%` }}
                            ></span>
                          </div>
                          <span className="dist-block-count">{valueDistribution.bad} records</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {belowAverage && (
                    <div className="insight-card">
                      <div className="insight-card-title">Below Average</div>
                      <div className="insight-card-subtitle">Lower value performing better</div>
                      <div className="insight-highlight-box blue">
                        <span className="insight-big-number">
                          {belowAverage.goodCount}
                          <span className="insight-out-of">/{belowAverage.total}</span>
                        </span>
                        <span className="insight-sub-text">
                          Records below avg value of <strong>{belowAverage.avg}</strong>
                        </span>
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
