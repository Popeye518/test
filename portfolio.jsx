import React, { useRef } from 'react';
import JsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import doraFrontPage from './Dora_front_page.png';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

import { Line } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import annotationPlugin from 'chartjs-plugin-annotation';

import './Portfolio_OwnerModal.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels,
  annotationPlugin
);

const METRIC_TO_KPI = [
  { graphKey: 'graph1', label: 'Release Frequency (2 months avg.)', threshold: 2 },
  { graphKey: 'graph2', label: 'Lead Time For Change (days)', threshold: 7 },
  { graphKey: 'graph3', label: 'Change Failure Rate (%)', threshold: 2.5 },
  { graphKey: 'graph4', label: 'Mean Time to Recover (hours)', threshold: 12 },
];

const getLastValue = (dataArr) => {
  if (!dataArr || dataArr.length === 0) return '';
  const last = dataArr[dataArr.length - 1];
  return typeof last === 'number' ? last.toFixed(2) : last;
};

const getDelta = (dataArr, graphKey) => {
  if (!dataArr || dataArr.length < 2) {
    return { value: '', arrow: '', arrowColor: '#64748b' };
  }

  const prev = Number(dataArr[dataArr.length - 2]);
  const curr = Number(dataArr[dataArr.length - 1]);

  if (!isFinite(prev) || !isFinite(curr)) {
    return { value: '', arrow: '', arrowColor: '#64748b' };
  }

  if (curr === prev) {
    return {
      value: '0%',
      arrow: '',
      arrowColor: '#64748b',
    };
  }

  let arrow = '';
  let arrowColor = '#64748b';

  if (curr > prev) {
    arrow = '▲';
    arrowColor = graphKey === 'graph1' ? '#10b981' : '#ef4444';
  } else if (curr < prev) {
    arrow = '▼';
    arrowColor = graphKey === 'graph1' ? '#ef4444' : '#10b981';
  }

  let valueText = '';
  const val = prev === 0 ? NaN : ((curr - prev) / prev) * 100;

  if (isFinite(val)) {
    const rounded = Math.round(Math.abs(val) * 100) / 100;
    valueText = `${rounded}%`;
  }

  return {
    value: valueText,
    arrow,
    arrowColor,
  };
};

const getMinValue = (dataArr) => {
  if (!dataArr || dataArr.length === 0) return 0;
  return Math.min(...dataArr.map(Number).filter((v) => !Number.isNaN(v)));
};

const getMaxValue = (dataArr, threshold) => {
  if (!dataArr || dataArr.length === 0) return threshold || 10;
  const numberArray = dataArr.map(Number).filter((v) => !Number.isNaN(v));
  const maxValue = numberArray.length ? Math.max(...numberArray) : 0;
  return Math.max(maxValue, threshold || 8);
};

const skyBlue = '#38bdf8';

const getChartOptions = (
  threshold,
  minVal,
  maxVal,
  graphKey,
  onPointClick,
  period,
  portfolioOwner,
  entityType
) => {
  let yMin = Math.max(0, Math.floor(minVal - 1));
  let yMax = Math.ceil(Math.max(maxVal, threshold) + 1);

  if (yMin > 0 && minVal <= 1) {
    yMin = 0;
  }

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest',
      intersect: true,
    },
    onClick: (event, elements, chart) => {
      if (!elements || elements.length === 0 || !onPointClick) return;

      const index = elements[0].index;
      const clickedPeriod = period?.[index];

      if (!clickedPeriod) return;

      onPointClick(graphKey, clickedPeriod, portfolioOwner, entityType);
    },
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            return `${context.dataset.label}: ${typeof value === 'number' ? value.toFixed(2) : value}`;
          },
        },
      },
      datalabels: {
        align: 'start',
        offset: -25,
        color: (context) => {
          const value = context.dataset.data[context.dataIndex];

          if (graphKey === 'graph1') {
            return Number(value) < threshold ? '#ef4444' : '#2563eb';
          }

          return Number(value) > threshold ? '#ef4444' : '#2563eb';
        },
        font: {
          weight: 'bold',
          size: 20,
        },
        formatter: (value) =>
          typeof value === 'number' ? value.toFixed(2) : value,
        display: true,
      },
      annotation: {
        annotations: {
          thresholdLine: {
            type: 'line',
            yMin: threshold,
            yMax: threshold,
            borderColor: '#ef4444',
            borderWidth: 2.5,
            borderDash: [8, 5],
            label: {
              display: true,
              content: 'Threshold',
              position: 'start',
              color: '#fff',
              backgroundColor: '#ef4444',
              font: { size: 20, weight: 'bold' },
              padding: 4,
              borderRadius: 4,
            },
          },
        },
      },
    },
    elements: {
      point: {
        radius: 5,
        backgroundColor: skyBlue,
        borderWidth: 2,
        borderColor: '#fff',
        hoverRadius: 7,
        hitRadius: 14,
        hoverBorderWidth: 2,
      },
      line: {
        tension: 0.4,
        borderWidth: 3,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
          drawBorder: false,
        },
        ticks: {
          color: '#64748b',
          font: { size: 20, weight: '600' },
          padding: 6,
        },
      },
      y: {
        min: yMin,
        max: yMax,
        grid: {
          display: false,
          drawBorder: true,
          color: '#e2e8f0',
          lineWidth: 1,
        },
        ticks: {
          display: true,
          color: '#64748b',
          font: { size: 20, weight: '500' },
          stepSize: 1,
          padding: 6,
          callback: function (value) {
            return Number.isInteger(value) ? value : '';
          },
        },
      },
    },
  };
};

const Portfolio_OwnerModal = ({
  cio,
  Portfolio_Owner,
  Period,
  Portfolio_OwnerData,
  onClose,
  onNavigate,
  currentIndex,
  totalItems,
  loading,
  renderAsDiv = false,
  onPointClick,
  entityType,
}) => {
  const contentRef = useRef(null);

  const handleDownloadPdf = async () => {
    const chartElement = contentRef.current;
    if (!chartElement) return;

    const canvas = await html2canvas(chartElement, {
      scale: 2,
      backgroundColor: '#ffffff',
    });

    const imageData = canvas.toDataURL('image/png');

    const pdf = new JsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    try {
      const img = new Image();
      img.src = doraFrontPage;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      pdf.addImage(img, 'PNG', 0, 0, pdfWidth, pdfHeight);

      const currentDate = new Date();
      currentDate.setMonth(currentDate.getMonth() - 1);

      const monthYear = currentDate.toLocaleString('default', {
        month: 'short',
        year: 'numeric',
      });

      pdf.setFontSize(14);
      pdf.setTextColor(255, 255, 255);
      pdf.text(monthYear, 20, 160);
    } catch (error) {
      console.error('Failed to load front page image:', error);
    }

    pdf.addPage();

    const imgProps = pdf.getImageProperties(imageData);
    const imgWidth = pdfWidth - 20;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

    pdf.addImage(imageData, 'PNG', 10, 15, imgWidth, imgHeight);
    pdf.save(`DORA-Report-${Portfolio_Owner}.pdf`);
  };

  let chartContent = null;

  if (Portfolio_OwnerData) {
    chartContent = (
      <div className="charts-grid improved-grid" ref={contentRef}>
        {METRIC_TO_KPI.map((metric) => {
          const graphData = Portfolio_OwnerData[metric.graphKey] || [];
          const minVal = getMinValue(graphData);
          const maxVal = getMaxValue(graphData, metric.threshold);
          const actual = getLastValue(graphData);
          const delta = getDelta(graphData, metric.graphKey);

          return (
            <div className="chart-wrapper" key={metric.label}>
              <div className="chart-title-bar">
                <h3>{metric.label}</h3>
              </div>

              <div className="chart-canvas-wrapper">
                <Line
                  data={{
                    labels: Period,
                    datasets: [
                      {
                        label: metric.label,
                        data: graphData,
                        borderColor: skyBlue,
                        backgroundColor: `${skyBlue}15`,
                        borderWidth: 3,
                        fill: true,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: (context) => {
                          const value = context.dataset.data[context.dataIndex];

                          if (metric.graphKey === 'graph1') {
                            return Number(value) < metric.threshold ? '#ef4444' : skyBlue;
                          }

                          return Number(value) > metric.threshold ? '#ef4444' : skyBlue;
                        },
                      },
                    ],
                  }}
                  options={getChartOptions(
                    metric.threshold,
                    minVal,
                    maxVal,
                    metric.graphKey,
                    onPointClick,
                    Period,
                    Portfolio_Owner,
                    entityType
                  )}
                />
              </div>

              <div className="chart-stats-bar">
                <span className="stat-actual">Current month: {actual}</span>

                <span className="stat-delta">
                  {delta.value}
                  {delta.arrow && (
                    <span
                      style={{
                        color: delta.arrowColor,
                        marginLeft: '8px',
                        fontWeight: 'bold',
                        fontSize: '1.4em',
                      }}
                    >
                      {delta.arrow}
                    </span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (renderAsDiv) {
    return chartContent;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content Portfolio_Owner-modal-improved">
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Loading analytics...</p>
            </div>
          </div>
        )}

        <div className="modal-header improved-header">
          <div className="header-info">
            <h2 className="modal-title">
              <span className="Portfolio_Owner-badge">
                {Portfolio_Owner ? `Portfolio Owner: ${Portfolio_Owner}` : ''}
              </span>
              {cio && <span className="cio-info">{cio}</span>}
            </h2>
          </div>

          <button className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {chartContent}

        <div className="modal-navigation">
          <button
            onClick={() => onNavigate(-1)}
            disabled={!totalItems || currentIndex <= 0}
          >
            &larr; Previous
          </button>

          <span>
            {totalItems > 0 ? `${currentIndex + 1} of ${totalItems}` : ''}
          </span>

          <div className="modal-navigation-corner">
            <button onClick={handleDownloadPdf} disabled={loading}>
              Download PDF
            </button>

            <button
              onClick={() => onNavigate(1)}
              disabled={!totalItems || currentIndex >= totalItems - 1}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Portfolio_OwnerModal;
