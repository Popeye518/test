import React, { useRef } from 'react';
import './DoraTable.css';
import JsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const METRIC_LABELS = {
  graph1: 'Release Frequency (2 months avg.)',
  graph2: 'Lead Time For Change (days)',
  graph3: 'Change Failure Rate (%)',
  graph4: 'Mean Time to Recover (hours)',
};

const METRIC_THRESHOLDS = {
  graph1: 2,
  graph2: 7,
  graph3: 2.5,
  graph4: 12,
};

const ComparisonTable = ({ title, data, period, graphKey }) => {
  if (!data || data.length === 0) {
    return (
      <div className="comparison-table-wrapper">
        <h3>{title}</h3>
        <p>No data available for this metric.</p>
      </div>
    );
  }

  const getDeltaInfo = (currentValue, previousValue, graphKey) => {
    if (
      previousValue === null ||
      typeof currentValue !== 'number' ||
      typeof previousValue !== 'number'
    ) {
      return null;
    }

    let arrow = '';
    let arrowColor = '#64748b';

    if (currentValue > previousValue) {
      arrow = '▲';
      arrowColor = graphKey === 'graph1' ? '#10b981' : '#ef4444';
    } else if (currentValue < previousValue) {
      arrow = '▼';
      arrowColor = graphKey === 'graph1' ? '#ef4444' : '#10b981';
    }

    if (currentValue === previousValue) {
      return {
        text: '0.00%',
        arrow: '',
        color: '#64748b',
      };
    }

    if (previousValue === 0) {
      return null;
    }

    const val = ((currentValue - previousValue) / previousValue) * 100;

    if (!isFinite(val)) {
      return null;
    }

    return {
      text: `${Math.abs(val).toFixed(2)}%`,
      arrow,
      color: arrowColor,
    };
  };

  const getCellBackgroundColor = (value) => {
    if (typeof value !== 'number') {
      return 'transparent';
    }

    const threshold = METRIC_THRESHOLDS[graphKey];

    if (graphKey === 'graph1') {
      return value < threshold ? '#fecaca' : '#bbf7d0';
    }

    return value > threshold ? '#fecaca' : '#bbf7d0';
  };

  return (
    <div className="comparison-table-wrapper">
      <h3>{title}</h3>

      <table>
        <thead>
          <tr>
            <th>Division</th>
            <th>Name</th>
            {period.map((p) => (
              <th key={p}>{p}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((person) => (
            <tr key={person.name}>
              <td>{person.Division || 'N/A'}</td>
              <td>{person.name}</td>

              {person.data.map((value, index) => {
                const previousValue = index > 0 ? person.data[index - 1] : null;
                const delta = getDeltaInfo(value, previousValue, graphKey);

                return (
                  <td
                    key={`${person.name}-${period[index]}`}
                    style={{
                      backgroundColor: getCellBackgroundColor(value),
                      color: 'black',
                    }}
                    className={delta ? 'has-tooltip' : ''}
                  >
                    {typeof value === 'number' ? value.toFixed(2) : String(value)}

                    {delta && (
                      <span className="tooltip">
                        {delta.arrow && (
                          <span style={{ color: delta.color, paddingRight: '4px' }}>
                            {delta.arrow}
                          </span>
                        )}
                        {delta.text}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ComparisonTableModal = ({ data, loading, onClose, entityType }) => {
  const printRef = useRef(null);

  const handleDownloadPdf = async () => {
    const gridElement = printRef.current;
    if (!gridElement) return;

    const originalOverflow = gridElement.style.overflow;
    const originalMaxHeight = gridElement.style.maxHeight;
    const originalHeight = gridElement.style.height;

    gridElement.style.overflow = 'visible';
    gridElement.style.maxHeight = 'none';
    gridElement.style.height = 'auto';

    const canvas = await html2canvas(gridElement, {
      scale: 2,
      backgroundColor: '#f8fafc',
      useCORS: true,
    });

    gridElement.style.overflow = originalOverflow;
    gridElement.style.maxHeight = originalMaxHeight;
    gridElement.style.height = originalHeight;

    const imgData = canvas.toDataURL('image/png');

    const pdf = new JsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;

    const imgProps = pdf.getImageProperties(imgData);
    const imgWidth = pdfWidth - 2 * margin;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

    let heightLeft = imgHeight;
    let position = margin;

    pdf.text(`Dora Report: ${entityType.toUpperCase()}`, margin, margin);
    pdf.addImage(imgData, 'PNG', margin, position + 10, imgWidth, imgHeight);

    heightLeft -= pdfHeight - (margin + 10) - margin;

    while (heightLeft > 0) {
      position -= pdfHeight - 2 * margin;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margin, position + margin, imgWidth, imgHeight);
      heightLeft -= pdfHeight - 2 * margin;
    }

    pdf.save(`DORA-Table-Report-${entityType}.pdf`);
  };

  const handleDownloadCsv = () => {
    if (!data) return;

    let csvContent = 'data:text/csv;charset=utf-8,';

    Object.keys(METRIC_LABELS).forEach((graphKey) => {
      const graphData = data[graphKey];

      if (graphData && graphData.length > 0) {
        csvContent += `\r\n${METRIC_LABELS[graphKey]}\r\n`;

        const headers = ['Division', 'Name', ...data.period];
        csvContent += headers.join(',') + '\r\n';

        graphData.forEach((person) => {
          const row = [
            `"${person.Division || 'N/A'}"`,
            `"${person.name}"`,
            ...person.data.map((val) =>
              typeof val === 'number' ? val.toFixed(2) : String(val)
            ),
          ];

          csvContent += row.join(',') + '\r\n';
        });
      }
    });

    const encodedUrl = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUrl);
    link.setAttribute('download', `DORA-Report-${entityType}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content comparison-modal-content">
        <div className="modal-header improved-header">
          <h2 className="modal-title">
            <span className="Portfolio_Owner-badge">
              Dora Report: {entityType.toUpperCase()}
            </span>
          </h2>

          <button className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="comparison-grid-container" ref={printRef}>
          {loading ? (
            <div className="loading-spinner" style={{ padding: '4rem' }}>
              <div className="spinner"></div>
              <p>Fetching data...</p>
            </div>
          ) : data ? (
            <div className="comparison-grid">
              <ComparisonTable
                title={METRIC_LABELS.graph1}
                data={data.graph1}
                period={data.period}
                graphKey="graph1"
              />
              <ComparisonTable
                title={METRIC_LABELS.graph2}
                data={data.graph2}
                period={data.period}
                graphKey="graph2"
              />
              <ComparisonTable
                title={METRIC_LABELS.graph3}
                data={data.graph3}
                period={data.period}
                graphKey="graph3"
              />
              <ComparisonTable
                title={METRIC_LABELS.graph4}
                data={data.graph4}
                period={data.period}
                graphKey="graph4"
              />
            </div>
          ) : (
            <p style={{ padding: '2rem', textAlign: 'center' }}>
              No data to display.
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="view-graphs-button"
            onClick={handleDownloadCsv}
            disabled={loading || !data}
          >
            Download CSV
          </button>

          <button
            className="view-graphs-button"
            onClick={handleDownloadPdf}
            disabled={loading || !data}
          >
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComparisonTableModal;
