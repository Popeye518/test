import React, { useMemo } from 'react';
import './DetailsModal.css';

const DetailsModal = ({ title, data, columns, loading, onClose }) => {

  const filterData = (data) => {
    if (!data) return [];
    return data.filter(item => {
      const value = item.Value;
      let shouldInclude = false;
      if (!isNaN(value) && value > 10) shouldInclude = true;
      return shouldInclude;
    });
  };

  // Table uses filtered data — unchanged
  const filteredRows = useMemo(() => filterData(data), [data]);

  // ── All insights use RAW data below ──

  // 1. Top 3 Best Performers (raw data)
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

  // 2. Most Frequent Application (raw data)
  const mostFrequentApp = useMemo(() => {
    if (!data || data.length === 0) return null;
    const countMap = {};
    data.forEach(row => {
      if (row.Application) countMap[row.Application] = (countMap[row.Application] || 0) + 1;
    });
    const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? { name: sorted[0][0], count: sorted[0][1] } : null;
  }, [data]);

  // 3. Lowest Performer (raw data)
  const lowestPerformer = useMemo(() => {
    if (!data || data.length === 0) return null;
    return data
      .filter(row => !isNaN(parseFloat(row.Value)))
      .sort((a, b) => parseFloat(a.Value) - parseFloat(b.Value))[0] || null;
  }, [data]);

  // 4. Period Snapshot (raw data)
  const periodSnapshot = useMemo(() => {
    if (!data || data.length === 0) return null;
    const total = data.length;
    const uniqueApps = new Set(data.map(r => r.Application).filter(Boolean)).size;
    const values = data.map(r => parseFloat(r.Value)).filter(v => !isNaN(v));
    const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '-';
    const uniqueNARs = new Set(data.map(r => r.NAR_ID).filter(Boolean)).size;
    return { total, uniqueApps, avg, uniqueNARs };
  }, [data]);

  // 5. Value Distribution (raw data)
  const valueDistribution = useMemo(() => {
    if (!data || data.length === 0) return null;
    const values = data.map(r => parseFloat(r.Value)).filter(v => !isNaN(v));
    const low = values.filter(v => v <= 20).length;
    const mid = values.filter(v => v > 20 && v <= 50).length;
    const high = values.filter(v => v > 50).length;
    return { low, mid, high, total: values.length };
  }, [data]);

  // 6. Above Average (raw data)
  const aboveAverage = useMemo(() => {
    if (!data || data.length === 0) return null;
    const values = data.map(r => parseFloat(r.Value)).filter(v => !isNaN(v));
    if (!values.length) return null;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const aboveCount = values.filter(v => v > avg).length;
    return { aboveCount, total: values.length, avg: avg.toFixed(1) };
  }, [data]);

  // 7. Repeat Offenders (raw data)
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

  // rest of JSX return stays exactly the same...
