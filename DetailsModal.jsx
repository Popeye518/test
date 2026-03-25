import React, { useMemo } from 'react';
import './DetailsModal.css';

const DetailsModal = ({
  title,
  data,
  columns,
  loading,
  onClose,
  threshold,
  clickedValue,
  currentGraphKey
}) => {
  const alertThreshold = useMemo(() => {
    if (currentGraphKey === 'graph1') return 2;
    if (currentGraphKey === 'graph4') return 12;
    if (currentGraphKey === 'graph2' || currentGraphKey === 'graph3') return 10;

    return threshold ?? 10;
  }, [currentGraphKey, threshold]);

  const shouldHighlightRow = (row) => {
    const value = parseFloat(row?.Value);

    if (isNaN(value)) return false;

    if (currentGraphKey === 'graph1') {
      return value < 2;
    }

    if (currentGraphKey === 'graph4') {
      return value > 12;
    }

    if (currentGraphKey === 'graph2' || currentGraphKey === 'graph3') {
      return value > 10;
    }

    return threshold != null ? value > threshold : false;
  };

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
        narId: row.NAR_ID || row.NARID,
        value: parseFloat(row.Value).toFixed(1)
      }));
  }, [data]);

  const attentionApps = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data
      .filter((row) => row.Application && shouldHighlightRow(row))
      .sort((a, b) => parseFloat(b.Value) - parseFloat(a.Value))
      .map((row) => ({
        name: row.Application,
        narId: row.NAR_ID || row.NARID,
        value: parseFloat(row.Value).toFixed(1)
      }));
  }, [data, currentGraphKey, threshold]);

  const periodSnapshot = useMemo(() => {
    if (!data || data.length === 0) return null;

    const total = data.length;
    const uniqueApps = new Set(data.map((r) => r.Application).filter(Boolean)).size;
    const uniqueNARs = new Set(
      data.map((r) => r.NAR_ID || r.NARID).filter(Boolean)
    ).size;

    return { total, uniqueApps, uniqueNARs };
  }, [data]);

  const valueDistribution = useMemo(() => {
    if (!data || data.length === 0 || threshold === null || threshold === undefined) return null;

    const values = data.map((r) => parseFloat(r.Value)).filter((v) => !isNaN(v));
    if (!values.length) return null;

    if (currentGraphKey === 'graph1') {
      const good = values.filter((v) => v >= 2).length;
      const atThresh = values.filter((v) => v === 2).length;
      const bad = values.filter((v) => v < 2).length;
      return { good, atThresh, bad, total: values.length };
    }

    const tolerance = 0.5;
    const good = values.filter((v) => v < alertThreshold - tolerance).length;
    const atThresh = values.filter(
      (v) => v >= alertThreshold - tolerance && v <= alertThreshold + tolerance
    ).length;
    const bad = values.filter((v) => v > alertThreshold + tolerance).length;

    return { good, atThresh, bad, total: values.length };
  }, [data, threshold, currentGraphKey, alertThreshold]);

  const belowAverage = useMemo(() => {
    if (!data || data.length === 0) return null;

    const values = data.map((r) => parseFloat(r.Value)).filter((v) => !isNaN(v));
    if (!values.length) return null;

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const goodCount =
      currentGraphKey === 'graph1'
        ? values.filter((v) => v > avg).length
        : values.filter((v) => v < avg).length;

    return { goodCount, total: values.length, avg: avg.toFixed(1) };
  }, [data, currentGraphKey]);

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
                <strong>{periodSnapshot.uniqueApps}</strong> unique applications &nbsp;&nbsp;
                Graph Value <strong>{clickedValue ?? '-'}</strong> &nbsp;&nbsp;
                Unique NARs <strong>{periodSnapshot.uniqueNARs}</strong> &nbsp;&nbsp;
                Threshold <strong>{alertThreshold}</strong>
              </div>
            )}

            <div className="details-table-container">
              {data && data.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      {columns.map((col) => (
                        <th key={col.key}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, index) => (
                      <tr
                        key={index}
                        className="table-row-hover"
                        style={{
                          backgroundColor: shouldHighlightRow(row) ? '#fee2e2' : 'transparent',
                        }}
                      >
                        {columns.map((col) => (
                          <td key={col.key}>{row[col.key] ?? 'N/A'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="no-data-message">
                  <span className="no-data-icon">📭</span>
                  <p>No details available for this period.</p>
                </div>
              )}
            </div>

            {(top3Apps.length > 0 || attentionApps.length > 0 || valueDistribution || belowAverage) && (
              <div className="insights-section">
                <h3 className="insights-heading">
                  <span className="title-with-icon">
                    <span className="title-icon">🔍</span>
                    <span>Insights</span>
                  </span>
                </h3>

                <div className="first-row-grid">
                  {top3Apps.length > 0 && (
                    <div className="insight-card top-performers-card">
                      <div className="top-performers-header">
                        <div>
                          <div className="insight-card-title">
                            <span className="title-with-icon">
                              <span className="title-icon">🏆</span>
                              <span>Best Observed Applications</span>
                            </span>
                          </div>
                          <div className="insight-card-subtitle">Lowest values in selected data</div>
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

                  <div className="insight-card attention-card">
                    <div className="insight-card-title">
                      <span className="title-with-icon">
                        <span className="title-icon">⚠️</span>
                        <span>Needs Attention</span>
                      </span>
                    </div>
                    <div className="insight-card-subtitle">
                      {currentGraphKey === 'graph1'
                        ? `Applications with value below ${alertThreshold}`
                        : `Applications with value above ${alertThreshold}`}
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
                          {currentGraphKey === 'graph1'
                            ? `No applications below threshold ${alertThreshold}`
                            : `No applications above threshold ${alertThreshold}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="second-row-grid">
                  {valueDistribution && (
                    <div className="insight-card value-distribution-card">
                      <div className="insight-card-title">
                        <span className="title-with-icon">
                          <span className="title-icon">📊</span>
                          <span>Value Distribution</span>
                        </span>
                      </div>
                      <div className="insight-card-subtitle">Threshold {alertThreshold}</div>

                      <div className="distribution-list distribution-list-large">
                        <div className="dist-block">
                          <span className="dist-block-label">
                            {currentGraphKey === 'graph1'
                              ? `Safe >= ${alertThreshold}`
                              : `Below < ${alertThreshold}`}
                          </span>
                          <div className="dist-bar-wrap large-bar-wrap">
                            <span
                              className="dist-bar green"
                              style={{ width: `${(valueDistribution.good / valueDistribution.total) * 100}%` }}
                            ></span>
                          </div>
                          <span className="dist-block-count">{valueDistribution.good} records</span>
                        </div>

                        <div className="dist-block">
                          <span className="dist-block-label">At threshold</span>
                          <div className="dist-bar-wrap large-bar-wrap">
                            <span
                              className="dist-bar yellow"
                              style={{ width: `${(valueDistribution.atThresh / valueDistribution.total) * 100}%` }}
                            ></span>
                          </div>
                          <span className="dist-block-count">{valueDistribution.atThresh} records</span>
                        </div>

                        <div className="dist-block">
                          <span className="dist-block-label">
                            {currentGraphKey === 'graph1'
                              ? `Below < ${alertThreshold}`
                              : `Above > ${alertThreshold}`}
                          </span>
                          <div className="dist-bar-wrap large-bar-wrap">
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
                    <div className="insight-card below-average-card">
                      <div className="insight-card-title">
                        <span className="title-with-icon">
                          <span className="title-icon">📉</span>
                          <span>Below Average</span>
                        </span>
                      </div>
                      <div className="insight-card-subtitle">
                        {currentGraphKey === 'graph1'
                          ? 'Higher value performing better'
                          : 'Lower value performing better'}
                      </div>

                      <div className="below-average-box">
                        <span className="attention-icon">📊</span>
                        <div className="attention-content">
                          <span className="attention-name">
                            {belowAverage.goodCount}/{belowAverage.total} records
                          </span>
                          <span className="attention-meta">
                            {currentGraphKey === 'graph1'
                              ? `Above average value of ${belowAverage.avg}`
                              : `Below average value of ${belowAverage.avg}`}
                          </span>
                        </div>
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
