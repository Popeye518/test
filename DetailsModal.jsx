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
  // 🟡 Yellow = at threshold (±0.5
