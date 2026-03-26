import React, { useEffect, useRef, useState } from 'react';
import { Chart, ArcElement, PieController } from 'chart.js';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import './App.css';
import './DetailsModal.css';
import './PortfolioOwnerModal.css';

import PortfolioOwnerModal from './components/PortfolioOwnerModal';
import ComparisonTableModal from './components/Doratable';
import DetailsModal from './components/DetailsModal';
import doraFrontPage from './components/Dora_front_page.png';

import {
  portfolioOwnerApiUrl,
  cioApiUrl,
  cioGraphApiUrls,
  ciolGraphApiUrls,
  ownerGraphApiUrls,
  cioDetailsApiUrls,
  ciolDetailsApiUrls,
  ownerDetailsApiUrls,
  cioInfoApiUrls,
  cio1InfoApiUrls,
  ownerInfoApiUrls,
} from './apiConstants';

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

const MultiSelectDropdown = ({ options, selectedItems, setSelectedItems, title }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCheckboxChange = (item) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(item)) {
      newSelection.delete(item);
    } else {
      newSelection.add(item);
    }
    setSelectedItems(Array.from(newSelection));
  };

  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectAll = () => {
    if (selectedItems.length === options.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(options);
    }
  };

  const getHeaderText = () => {
    if (selectedItems.length === 0) return `Select ${title}...`;
    if (selectedItems.length === 1) return selectedItems[0];
    if (selectedItems.length === options.length) return `All ${title} Selected`;
    return `${selectedItems.length} ${title} Selected`;
  };

  return (
    <div className="multiselect-dropdown" ref={dropdownRef}>
      <button type="button" className="dropdown-header" onClick={() => setIsOpen(!isOpen)}>
        {getHeaderText()}
        <span className={`dropdown-arrow ${isOpen ? 'open' : ''}`}></span>
      </button>

      {isOpen && (
        <div className="dropdown-panel">
          <input
            type="text"
            className="dropdown-search"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <div className="dropdown-list">
            <div className="dropdown-item">
              <input
                type="checkbox"
                id={`select-all-${title}`}
                checked={options.length > 0 && selectedItems.length === options.length}
                onChange={handleSelectAll}
              />
              <label htmlFor={`select-all-${title}`}>Select All</label>
            </div>

            {filteredOptions.map((option) => (
              <div key={option} className="dropdown-item">
                <input
                  type="checkbox"
                  id={`${title}-${option}`}
                  checked={selectedItems.includes(option)}
                  onChange={() => handleCheckboxChange(option)}
                />
                <label htmlFor={`${title}-${option}`}>{option}</label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const DownloadOptionsModal = ({ onSelect, onCancel, isGenerating }) => {
  const [selectedDownload, setSelectedDownload] = useState('graph');

  return (
    <div className="modal-overlay">
      <div className="view-options-modal-content">
        <h2 className="view-options-title">Select Download</h2>
        <p className="view-options-subtitle">
          Choose which report you would like to download as a PDF.
        </p>

        <div className="view-options-choices">
          <div
            className={`choice-card ${selectedDownload === 'graph' ? 'active' : ''}`}
            onClick={() => setSelectedDownload('graph')}
          >
            <div className="choice-icon"></div>
            <div className="choice-text">
              <h3>Graph Report</h3>
              <p>A multi-page PDF with detailed charts for each selected entity.</p>
            </div>
          </div>

          <div
            className={`choice-card ${selectedDownload === 'table' ? 'active' : ''}`}
            onClick={() => setSelectedDownload('table')}
          >
            <div className="choice-icon"></div>
            <div className="choice-text">
              <h3>Table Report</h3>
              <p>A consolidated PDF showing raw data in tables for all selected entities.</p>
            </div>
          </div>
        </div>

        <div className="view-options-footer">
          <button className="view-options-button cancel" onClick={onCancel} disabled={isGenerating}>
            Cancel
          </button>
          <button
            className="view-options-button view"
            onClick={() => onSelect(selectedDownload)}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ViewOptionsModal = ({ onSelect, onCancel }) => {
  const [selectedView, setSelectedView] = useState('graph');

  return (
    <div className="modal-overlay">
      <div className="view-options-modal-content">
        <h2 className="view-options-title">Select Report View</h2>
        <p className="view-options-subtitle">Choose how you would like to view DORA Report.</p>

        <div className="view-options-choices">
          <div
            className={`choice-card ${selectedView === 'graph' ? 'active' : ''}`}
            onClick={() => setSelectedView('graph')}
          >
            <div className="choice-icon"></div>
            <div className="choice-text">
              <h3>Graph View</h3>
              <p>Visualize metrics over time with interactive charts.</p>
            </div>
          </div>

          <div
            className={`choice-card ${selectedView === 'table' ? 'active' : ''}`}
            onClick={() => setSelectedView('table')}
          >
            <div className="choice-icon"></div>
            <div className="choice-text">
              <h3>Table View</h3>
              <p>Compare raw data for multiple entities side-by-side.</p>
            </div>
          </div>
        </div>

        <div className="view-options-footer">
          <button className="view-options-button cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="view-options-button view" onClick={() => onSelect(selectedView)}>
            View
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [CIO, setCIO] = useState([]);
  const [selectedCIOs, setSelectedCIOs] = useState([]);
  const [selectedCiols, setSelectedCiols] = useState([]);
  const [ciolList, setCiolList] = useState([]);
  const [ownerList, setOwnerList] = useState([]);
  const [selectedOwners, setSelectedOwners] = useState([]);
  const [portfolioOwnerGraphs, setPortfolioOwnerGraphs] = useState(null);
  const [Period, setPeriod] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [modalEntityName, setModalEntityName] = useState('');
  const [portfolioOwnerData, setPortfolioOwnerData] = useState([]);
  const [navigationList, setNavigationList] = useState([]);
  const [currentOwnerIndex, setCurrentOwnerIndex] = useState(null);
  const [modalEntityType, setModalEntityType] = useState(null);
  const [showComparisonTable, setShowComparisonTable] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);
  const [comparisonEntityType, setComparisonEntityType] = useState('');
  const [showViewOptionsModal, setShowViewOptionsModal] = useState(false);
  const [showDownloadOptionsModal, setShowDownloadOptionsModal] = useState(false);
  const [viewOptionsContext, setViewOptionsContext] = useState({ entityType: null, entityNames: [] });
  const [downloadOptionsContext, setDownloadOptionsContext] = useState({ entityType: null, entityNames: [] });
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsModalData, setDetailsModalData] = useState(null);
  const [detailsModalLoading, setDetailsModalLoading] = useState(false);
  const [detailsModalTitle, setDetailsModalTitle] = useState('');
  const [detailsModalColumns, setDetailsModalColumns] = useState([]);
  const [bestPerformingApps, setBestPerformingApps] = useState([]);
  const [noDataMessage, setNoDataMessage] = useState('');
  const [currentGraphKey, setCurrentGraphKey] = useState(null);

  Chart.register(ArcElement, PieController);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleOpenViewOptions = (entityType, entityNames) => {
    setViewOptionsContext({ entityType, entityNames });
    setShowViewOptionsModal(true);
  };

  const handleViewSelection = (viewType) => {
    const { entityType, entityNames } = viewOptionsContext;
    if (viewType === 'graph') {
      handleViewGraphs(entityType, entityNames);
    } else {
      handleCreateTable(entityType, entityNames);
    }
    setShowViewOptionsModal(false);
  };

  const handleOpenDownloadOptions = (entityType, entityNames) => {
    setDownloadOptionsContext({ entityType, entityNames });
    setShowDownloadOptionsModal(true);
  };

  const handleDownloadSelection = (downloadType) => {
    const { entityType, entityNames } = downloadOptionsContext;
    if (downloadType === 'graph') {
      handleDownloadReport(entityType, entityNames).finally(() => setShowDownloadOptionsModal(false));
    } else {
      handleDownloadTableReport(entityType, entityNames).finally(() => setShowDownloadOptionsModal(false));
    }
  };

  const handlePointClick = async (graphKey, period, entityName, entityType) => {
    const metricLabel = METRIC_LABELS[graphKey];
    setDetailsModalTitle(`Details for ${entityName} - ${metricLabel} (${period})`);
    setBestPerformingApps([]);
    setDetailsModalLoading(true);
    setShowDetailsModal(true);
    setDetailsModalData(null);
    setCurrentGraphKey(graphKey);

    let detailsApiUrls;
    let infoApiUrls;
    let paramName;

    switch (entityType) {
      case 'cio':
        detailsApiUrls = cioDetailsApiUrls;
        infoApiUrls = cioInfoApiUrls;
        paramName = 'cio';
        break;
      case 'ciol':
      case 'cio1':
        detailsApiUrls = ciolDetailsApiUrls;
        infoApiUrls = cio1InfoApiUrls;
        paramName = 'cio1';
        break;
      case 'owner':
        detailsApiUrls = ownerDetailsApiUrls;
        infoApiUrls = ownerInfoApiUrls;
        paramName = 'portfolioowner';
        break;
      default:
        setDetailsModalLoading(false);
        return;
    }

    const url = detailsApiUrls[graphKey];

    let columns = [];
    if (graphKey === 'graph2' || graphKey === 'graph3') {
      columns = [
        { key: 'ChangeID', label: 'Change ID' },
        { key: 'NARID', label: 'NAR ID' },
        { key: 'Application', label: 'Application' },
        { key: 'Period', label: 'Period' },
        { key: 'Value', label: 'Value' },
      ];
    } else if (graphKey === 'graph4') {
      columns = [
        { key: 'IncidentID', label: 'Incident ID' },
        { key: 'NARID', label: 'NAR ID' },
        { key: 'Application', label: 'Application' },
        { key: 'OutageHours', label: 'Outage Hours' },
        { key: 'Period', label: 'Period' },
        { key: 'Value', label: 'Value' },
      ];
    }

    setDetailsModalColumns(columns);

    try {
      const fetchUrl = `${url}?${paramName}=${encodeURIComponent(entityName)}&size=999999`;
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      const allResults = Array.isArray(data) ? data : data.results || data.items || data.data || [];
      const filteredResults = allResults.filter((item) => item.Period && item.Period.trim() === period);

      if (filteredResults.length === 0) {
        setDetailsModalData([]);
        setNoDataMessage('All values are less than 10 for this selection.');
        return;
      }

      setNoDataMessage('');
      setDetailsModalData(filteredResults);

      if (graphKey !== 'graph1') {
        const sortedResults = [...filteredResults].sort((a, b) => Number(a.Value) - Number(b.Value));
        setBestPerformingApps(sortedResults.slice(0, 3));
      } else {
        setBestPerformingApps([]);
      }
    } catch (e) {
      console.error('Error fetching details data:', e);
      setDetailsModalData([{ error: 'Failed to fetch data. Please check the console for details.' }]);
    } finally {
      setDetailsModalLoading(false);
    }
  };

  const fetchInitialData = async () => {
    try {
      const [poResponse, cioResponse] = await Promise.all([
        fetch(portfolioOwnerApiUrl),
        fetch(cioApiUrl),
      ]);

      const poData = await poResponse.json();
      const portfolioOwnerList = Array.isArray(poData) ? poData : poData.results || poData.items || poData.data || [];
      if (!Array.isArray(portfolioOwnerList)) throw new Error('Portfolio Owner data is not an array.');
      setPortfolioOwnerData(portfolioOwnerList);

      const cioData = await cioResponse.json();
      const cioListFromApi = Array.isArray(cioData) ? cioData : cioData.results || cioData.items || cioData.data || [];
      if (!Array.isArray(cioListFromApi)) throw new Error('CIO data is not an array.');

      const allCioRecords = [...cioListFromApi, ...portfolioOwnerList];
      const isIdLike = (str) => /^G\d+$/i.test(str);
      const peopleMap = new Map();

      allCioRecords.forEach((item) => {
        const canonicalId = item.UBR || item.UBR7 ? String(item.UBR || item.UBR7).trim() : null;
        const cioValue = item.CIO ? String(item.CIO).trim() : null;

        if (canonicalId) {
          if (!peopleMap.has(canonicalId)) {
            peopleMap.set(canonicalId, { canonicalId, aliases: new Set() });
          }
          const person = peopleMap.get(canonicalId);
          person.aliases.add(canonicalId);
          if (cioValue) person.aliases.add(cioValue);
        }
      });

      const uniqueCios = [];
      for (const person of peopleMap.values()) {
        const ids = Array.from(person.aliases);
        let displayName = ids.find((id) => !isIdLike(id));
        if (!displayName) displayName = person.canonicalId;
        uniqueCios.push({ name: displayName, ids });
      }

      const finalMap = new Map();
      uniqueCios.forEach((cio) => {
        if (finalMap.has(cio.name)) {
          const existing = finalMap.get(cio.name);
          existing.ids = Array.from(new Set([...existing.ids, ...cio.ids]));
        } else {
          finalMap.set(cio.name, { ...cio });
        }
      });

      const finalCios = Array.from(finalMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      setCIO(finalCios);
    } catch (e) {
      console.error('Error fetching initial data:', e);
    }
  };

  useEffect(() => {
    if (selectedCIOs.length > 0) {
      const relevantCiols = new Map();
      const allSelectedCioIds = CIO
        .filter((c) => selectedCIOs.includes(c.name))
        .flatMap((c) => c.ids.map((id) => id.toLowerCase()));

      portfolioOwnerData.forEach((owner) => {
        if (owner.CIO && allSelectedCioIds.includes(String(owner.CIO).toLowerCase())) {
          const ciolName = owner.CIO1 ? String(owner.CIO1).trim() : null;
          if (ciolName && !relevantCiols.has(ciolName.toLowerCase())) {
            relevantCiols.set(ciolName.toLowerCase(), ciolName);
          }
        }
      });

      const cio1DropdownList = Array.from(relevantCiols.values())
        .map((name) => ({ name, ids: [name] }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setCiolList(cio1DropdownList);
    } else {
      setCiolList([]);
      setOwnerList([]);
    }

    setSelectedCiols([]);
    setSelectedOwners([]);
  }, [selectedCIOs, CIO, portfolioOwnerData]);

  useEffect(() => {
    if (selectedCIOs.length === 0) {
      setOwnerList([]);
      setSelectedOwners([]);
      return;
    }

    const relevantOwners = new Map();
    let dataToFilter = portfolioOwnerData;

    const allSelectedCioIds = CIO
      .filter((c) => selectedCIOs.includes(c.name))
      .flatMap((c) => c.ids.map((id) => id.toLowerCase()));

    dataToFilter = dataToFilter.filter(
      (item) => item.CIO && allSelectedCioIds.includes(String(item.CIO).toLowerCase())
    );

    if (selectedCiols.length > 0) {
      const lowerCaseCiols = selectedCiols.map((c) => c.toLowerCase());
      dataToFilter = dataToFilter.filter(
        (item) => item.CIO1 && lowerCaseCiols.includes(String(item.CIO1).toLowerCase())
      );
    }

    dataToFilter.forEach((item) => {
      const ownerName = item.PortfolioOwner ? String(item.PortfolioOwner).trim() : null;
      if (ownerName && !relevantOwners.has(ownerName.toLowerCase())) {
        relevantOwners.set(ownerName.toLowerCase(), ownerName);
      }
    });

    setOwnerList(Array.from(relevantOwners.values()).sort());
    setSelectedOwners([]);
  }, [selectedCIOs, selectedCiols, portfolioOwnerData, CIO]);

  const handleClearCioFilters = () => {
    setSelectedCIOs([]);
    setSelectedCiols([]);
    setSelectedOwners([]);
    setCiolList([]);
    setOwnerList([]);
  };

  const handleClearCiolFilters = () => {
    setSelectedCiols([]);
    setSelectedOwners([]);
  };

  const handleClearOwnerFilters = () => {
    setSelectedOwners([]);
  };

  const fetchDataForEntity = async (entityName, urls, roles) => {
    try {
      const normalizeData = (data) => {
        if (Array.isArray(data)) return data;
        if (data?.results && Array.isArray(data.results)) return data.results;
        if (data?.items && Array.isArray(data.items)) return data.items;
        if (data?.data && Array.isArray(data.data)) return data.data;
        return [];
      };

      const allFetchPromises = [];

      for (const { param } of roles) {
        for (const [key, url] of Object.entries(urls)) {
          const fetchUrl = `${url}?${param}=${encodeURIComponent(entityName)}`;
          allFetchPromises.push(
            fetch(fetchUrl)
              .then((res) => res.json())
              .then((jsonData) => ({ key, data: normalizeData(jsonData) }))
          );
        }
      }

      const allRoleData = await Promise.all(allFetchPromises);
      const responsesByKey = {};

      Object.keys(urls).forEach((key) => {
        const dataForGraph = allRoleData.filter((d) => d.key === key);
        const combinedData = dataForGraph.reduce((acc, curr) => acc.concat(curr.data), []);

        const dataByPeriod = new Map();
        combinedData.forEach((point) => {
          if (point && point.Period) dataByPeriod.set(point.Period.trim(), point);
        });

        responsesByKey[key] = Array.from(dataByPeriod.values());
      });

      const periodNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const formatPeriodFromDate = (date) => `${periodNames[date.getMonth()]}-${date.getFullYear()}`;

      const generateLast6Months = () => {
        const periods = [];
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          periods.push(formatPeriodFromDate(date));
        }
        return periods;
      };

      const last6MonthPeriods = generateLast6Months();
      const graphsData = {};

      Object.keys(urls).forEach((graphKey) => {
        const graphData = responsesByKey[graphKey] || [];
        graphsData[graphKey] = last6MonthPeriods.map((p) => {
          const point = graphData.find((g) => g?.Period?.trim() === p);
          return point?.Value ?? 0;
        });
      });

      return { graphsData, period: last6MonthPeriods };
    } catch (e) {
      console.error('Error fetching graph data:', e);
      return { graphsData: null, period: [] };
    }
  };

  const fetchAndShowModal = async (entityType, entityName) => {
    let urls;
    let roles;

    switch (entityType) {
      case 'cio':
        urls = cioGraphApiUrls;
        roles = [{ role: 'cio', param: 'cio' }];
        break;
      case 'ciol':
      case 'cio1':
        urls = ciolGraphApiUrls;
        roles = [{ role: 'cio1', param: 'cio1' }];
        break;
      case 'owner':
        urls = ownerGraphApiUrls;
        roles = [
          { role: 'portfolioowner', param: 'portfolioowner' },
          { role: 'cio1', param: 'cio1' },
        ];
        break;
      default:
        return;
    }

    setLoading(true);
    setModalEntityName(entityName);
    setPortfolioOwnerGraphs(null);

    try {
      const { graphsData, period } = await fetchDataForEntity(entityName, urls, roles);
      setPortfolioOwnerGraphs(graphsData);
      setPeriod(period);
    } catch (e) {
      console.error(`Error fetching graph data for ${entityType}:`, e);
    } finally {
      setLoading(false);
    }
  };

  const handleViewGraphs = (entityType, entityNames) => {
    if (!entityNames || entityNames.length === 0) return;
    setNavigationList(entityNames);
    setCurrentOwnerIndex(0);
    setModalEntityType(entityType);
    fetchAndShowModal(entityType, entityNames[0]);
  };

  const handleDownloadReport = async (entityType, entityNames) => {
    if (!entityNames || entityNames.length === 0) return;

    setIsGeneratingPdf(true);
    let urls;
    let roles;

    switch (entityType) {
      case 'cio':
        urls = cioGraphApiUrls;
        roles = [{ role: 'cio', param: 'cio' }];
        break;
      case 'ciol':
      case 'cio1':
        urls = ciolGraphApiUrls;
        roles = [{ role: 'cio1', param: 'cio1' }];
        break;
      case 'owner':
        urls = ownerGraphApiUrls;
        roles = [
          { role: 'portfolioowner', param: 'portfolioowner' },
          { role: 'cio1', param: 'cio1' },
        ];
        break;
      default:
        setIsGeneratingPdf(false);
        return;
    }

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
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
        const monthYear = currentDate.toLocaleString('default', { month: 'short', year: 'numeric' });
        pdf.setFontSize(14);
        pdf.setTextColor(255, 255, 255);
        pdf.text(monthYear, 20, 160);
      } catch (error) {
        console.error('Failed to load front page image:', error);
      }

      for (const entityName of entityNames) {
        const { graphsData, period } = await fetchDataForEntity(entityName, urls, roles);
        if (!graphsData) continue;

        const tempContainer = document.createElement('div');
        document.body.appendChild(tempContainer);

        Object.assign(tempContainer.style, {
          position: 'absolute',
          left: '-9999px',
          width: '1200px',
          backgroundColor: 'white',
          padding: '16px',
        });

        const root = createRoot(tempContainer);

        await new Promise((resolve) => {
          root.render(
            <div>
              <h2 style={{ textAlign: 'center', color: '#1e3a8a' }}>DORA Report: {entityName}</h2>
              <PortfolioOwnerModal
                PortfolioOwner={entityName}
                PortfolioOwnerData={graphsData}
                Period={period}
                loading={false}
                renderAsDiv={true}
              />
            </div>
          );
          setTimeout(resolve, 1500);
        });

        const canvas = await html2canvas(tempContainer, { scale: 2 });
        pdf.addPage();

        const imgData = canvas.toDataURL('image/png');
        const imgProps = pdf.getImageProperties(imgData);
        const imgWidth = pdfWidth - 20;
        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

        pdf.addImage(imgData, 'PNG', 10, 15, imgWidth, imgHeight);

        root.unmount();
        document.body.removeChild(tempContainer);
      }

      pdf.save(`DORA-Report-${entityType}.pdf`);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      alert('An error occurred while generating the PDF. Please check the console for details.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleCreateTable = async (entityType, entityNames, forDownload = false) => {
    if (!entityNames || entityNames.length === 0) {
      if (forDownload) return null;
      return;
    }

    if (!forDownload) {
      setModalEntityName('');
      setShowComparisonTable(true);
      setLoading(true);
      setComparisonData(null);
      setComparisonEntityType(entityType);
    }

    let urls;
    let roles;

    switch (entityType) {
      case 'cio':
        urls = cioGraphApiUrls;
        roles = [{ role: 'cio', param: 'cio' }];
        break;
      case 'ciol':
      case 'cio1':
        urls = ciolGraphApiUrls;
        roles = [{ role: 'cio1', param: 'cio1' }];
        break;
      case 'owner':
        urls = ownerGraphApiUrls;
        roles = [
          { role: 'portfolioowner', param: 'portfolioowner' },
          { role: 'cio1', param: 'cio1' },
        ];
        break;
      default:
        setLoading(false);
        return;
    }

    const allData = { graph1: [], graph2: [], graph3: [], graph4: [], period: [] };

    try {
      const promises = entityNames.map((name) => fetchDataForEntity(name, urls, roles));
      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        const entityName = entityNames[index];
        let division = 'N/A';

        if (portfolioOwnerData && portfolioOwnerData.length > 0) {
          let record;
          const lowerEntityName = String(entityName).toLowerCase();

          if (entityType === 'cio') {
            const cioObject = CIO.find((c) => String(c.name).toLowerCase() === lowerEntityName);
            if (cioObject) {
              const cioIds = cioObject.ids.map((id) => String(id).toLowerCase());
              record = portfolioOwnerData.find(
                (d) => d.CIO && cioIds.includes(String(d.CIO).toLowerCase())
              );
            }
          } else if (entityType === 'ciol' || entityType === 'cio1') {
            record = portfolioOwnerData.find(
              (d) => d.CIO1 && String(d.CIO1).toLowerCase() === lowerEntityName
            );
          } else if (entityType === 'owner') {
            record = portfolioOwnerData.find(
              (d) => d.PortfolioOwner && String(d.PortfolioOwner).toLowerCase() === lowerEntityName
            );
          }

          if (record?.Division) {
            division = record.Division;
          }
        }

        if (result?.graphsData) {
          if (index === 0) allData.period = result.period;
          Object.keys(result.graphsData).forEach((graphKey) => {
            allData[graphKey].push({
              name: entityName,
              Division: division,
              data: result.graphsData[graphKey],
            });
          });
        }
      });

      if (forDownload) return allData;
      setComparisonData(allData);
    } catch (e) {
      console.error('Error creating comparison table:', e);
      if (forDownload) return null;
    } finally {
      if (!forDownload) setLoading(false);
    }
  };

  const handleDownloadTableReport = async (entityType, entityNames) => {
    if (!entityNames || entityNames.length === 0) return;

    setIsGeneratingPdf(true);

    try {
      const tableData = await handleCreateTable(entityType, entityNames, true);
      if (!tableData || !tableData.period || tableData.period.length === 0) {
        throw new Error('No data available to generate table report.');
      }

      const tempContainer = document.createElement('div');
      Object.assign(tempContainer.style, {
        position: 'absolute',
        left: '-9999px',
        width: '1200px',
        background: '#f8fafc',
        padding: '1rem',
        overflow: 'visible',
        maxHeight: 'none',
        height: 'auto',
        display: 'block',
      });

      document.body.appendChild(tempContainer);
      const root = createRoot(tempContainer);

      const TempTable = ({ title, data, period, graphKey }) => {
        if (!data || data.length === 0) return null;

        const getCellBackgroundColor = (value) => {
          if (typeof value !== 'number') return 'transparent';
          const threshold = METRIC_THRESHOLDS[graphKey];
          if (graphKey === 'graph1') return value < threshold ? '#fecaca' : '#bbf7d0';
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
                    {person.data.map((value, index) => (
                      <td
                        key={index}
                        style={{
                          backgroundColor: getCellBackgroundColor(value),
                          color: 'black',
                        }}
                      >
                        {typeof value === 'number' ? value.toFixed(2) : String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      };

      await new Promise((resolve) => {
        root.render(
          <div className="comparison-grid-container" style={{ background: '#f8fafc' }}>
            <div
              className="comparison-grid"
              style={{
                overflow: 'visible',
                maxHeight: 'none',
                height: 'auto',
                display: 'block',
              }}
            >
              <TempTable title={METRIC_LABELS.graph1} data={tableData.graph1} period={tableData.period} graphKey="graph1" />
              <TempTable title={METRIC_LABELS.graph2} data={tableData.graph2} period={tableData.period} graphKey="graph2" />
              <TempTable title={METRIC_LABELS.graph3} data={tableData.graph3} period={tableData.period} graphKey="graph3" />
              <TempTable title={METRIC_LABELS.graph4} data={tableData.graph4} period={tableData.period} graphKey="graph4" />
            </div>
          </div>
        );
        setTimeout(resolve, 1000);
      });

      const canvas = await html2canvas(tempContainer, { scale: 2, useCORS: true });
      root.unmount();
      document.body.removeChild(tempContainer);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
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
        position = -(pdfHeight - 2 * margin);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position + margin, imgWidth, imgHeight);
        heightLeft -= pdfHeight - 2 * margin;
      }

      pdf.save(`DORA-Table-Report-${entityType}.pdf`);
    } catch (e) {
      console.error('Failed to generate table PDF:', e);
      alert(`Failed to generate table report: ${e.message}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const closeModal = () => {
    setModalEntityName('');
    setPortfolioOwnerGraphs(null);
    setPeriod([]);
  };

  const handleGraphNavigation = (direction) => {
    if (currentOwnerIndex === null) return;

    const newIndex = currentOwnerIndex + direction;
    if (newIndex >= 0 && newIndex < navigationList.length) {
      setCurrentOwnerIndex(newIndex);
      const nextEntityName = navigationList[newIndex];
      fetchAndShowModal(modalEntityType, nextEntityName);
    }
  };

  let cioInfoForModal = '';
  if (modalEntityName && selectedCIOs.length > 0) {
    const allSelectedCioIds = CIO
      .filter((c) => selectedCIOs.includes(c.name))
      .flatMap((c) => c.ids.map((id) => id.toLowerCase()));

    if (modalEntityType === 'ciol' || modalEntityType === 'cio1') {
      const record = portfolioOwnerData.find(
        (d) =>
          d.CIO1 === modalEntityName &&
          d.CIO &&
          allSelectedCioIds.includes(String(d.CIO).toLowerCase())
      );

      if (record?.CIO) {
        const cioObject = CIO.find((c) =>
          c.ids.map((id) => id.toLowerCase()).includes(String(record.CIO).toLowerCase())
        );
        cioInfoForModal = `CIO: ${cioObject ? cioObject.name : record.CIO}`;
      }
    } else if (modalEntityType === 'owner') {
      const lowerCaseCio1s = selectedCiols.map((c) => c.toLowerCase());

      const record = portfolioOwnerData.find((d) => {
        if (d.PortfolioOwner !== modalEntityName) return false;
        const matchesCio = d.CIO && allSelectedCioIds.includes(String(d.CIO).toLowerCase());
        if (!matchesCio) return false;
        if (lowerCaseCio1s.length > 0) {
          return d.CIO1 && lowerCaseCio1s.includes(String(d.CIO1).toLowerCase());
        }
        return true;
      });

      if (record) {
        if (record.CIO1) {
          cioInfoForModal = `CIO-1: ${record.CIO1}`;
        } else if (record.CIO) {
          const cioObject = CIO.find((c) =>
            c.ids.map((id) => id.toLowerCase()).includes(String(record.CIO).toLowerCase())
          );
          cioInfoForModal = `CIO: ${cioObject ? cioObject.name : record.CIO}`;
        }
      }
    }
  }

  return (
    <div className="App">
      <header className="app-header">
        <h1 className="app-title">DORA Report</h1>
        <p className="app-subtitle">
          This dashboard provides an overview of DORA metrics: Deployment Frequency,
          Lead Time for Changes, Change Failure Rate, and Time to Restore.
        </p>
      </header>

      <main className="main-content">
        <div className="info-section">
          <h2>Understanding the DORA Metrics</h2>
          <div className="metrics-definitions">
            <div className="metric-item">
              <div className="metric-title">Release Frequency (2 months avg.)</div>
              <div className="metric-description">
                This metric reflects the volume of releases relative to the volume of applications in scope.
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-title">Lead Time for Change (days)</div>
              <div className="metric-description">
                This metric shows the average time between approval and implementation completion.
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-title">Change Failure Rate (%)</div>
              <div className="metric-description">
                This metric is the percentage of failed changes from the overall change population.
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-title">Mean Time to Recover (hours)</div>
              <div className="metric-description">
                Recovery time is the outage duration recorded in the source system.
              </div>
            </div>
          </div>
        </div>

        <div className="selector">
          <p>Select one or more items from each category to filter the lists below.</p>

          <div className="cio-select-container">
            <label>Select CIO</label>
            <MultiSelectDropdown
              options={CIO.map((c) => c.name)}
              selectedItems={selectedCIOs}
              setSelectedItems={setSelectedCIOs}
              title="CIOs"
            />
            <div className="button-group">
              <button
                className="clear-filters-button"
                onClick={handleClearCioFilters}
                disabled={selectedCIOs.length === 0 || isGeneratingPdf}
              >
                Clear Filters
              </button>
              <button
                className="view-graphs-button"
                onClick={() => handleOpenViewOptions('cio', selectedCIOs)}
                disabled={selectedCIOs.length === 0 || isGeneratingPdf}
              >
                View Report
              </button>
              <button
                className="view-graphs-button"
                onClick={() => handleOpenDownloadOptions('cio', selectedCIOs)}
                disabled={selectedCIOs.length === 0 || isGeneratingPdf}
              >
                Download Report
              </button>
            </div>
          </div>

          {selectedCIOs.length > 0 && (
            <div className="selected-items-display">
              <strong>Selected CIOs:</strong> {selectedCIOs.join(', ')}
            </div>
          )}

          {selectedCIOs.length > 0 && (
            <div className="cio-select-container">
              <label>Select CIO-1</label>
              <MultiSelectDropdown
                options={ciolList.map((c) => c.name)}
                selectedItems={selectedCiols}
                setSelectedItems={setSelectedCiols}
                title="CIO-1s"
              />
              <div className="button-group">
                <button
                  className="clear-filters-button"
                  onClick={handleClearCiolFilters}
                  disabled={selectedCiols.length === 0 || isGeneratingPdf}
                >
                  Clear Filters
                </button>
                <button
                  className="view-graphs-button"
                  onClick={() => handleOpenViewOptions('ciol', selectedCiols)}
                  disabled={selectedCiols.length === 0 || isGeneratingPdf}
                >
                  View Report
                </button>
                <button
                  className="view-graphs-button"
                  onClick={() => handleOpenDownloadOptions('ciol', selectedCiols)}
                  disabled={selectedCiols.length === 0 || isGeneratingPdf}
                >
                  Download Report
                </button>
              </div>
            </div>
          )}

          {selectedCiols.length > 0 && (
            <div className="selected-items-display">
              <strong>Selected CIO-1s:</strong> {selectedCiols.join(', ')}
            </div>
          )}

          <div className="cio-select-container">
            <label>Select Portfolio Owner</label>
            <MultiSelectDropdown
              options={ownerList}
              selectedItems={selectedOwners}
              setSelectedItems={setSelectedOwners}
              title="Portfolio Owners"
            />
            <div className="button-group">
              <button
                className="clear-filters-button"
                onClick={handleClearOwnerFilters}
                disabled={selectedOwners.length === 0 || isGeneratingPdf}
              >
                Clear Filters
              </button>
              <button
                className="view-graphs-button"
                onClick={() => handleOpenViewOptions('owner', selectedOwners)}
                disabled={selectedOwners.length === 0 || isGeneratingPdf}
              >
                View Report
              </button>
              <button
                className="view-graphs-button"
                onClick={() => handleOpenDownloadOptions('owner', selectedOwners)}
                disabled={selectedOwners.length === 0 || isGeneratingPdf}
              >
                Download Report
              </button>
            </div>
          </div>

          {selectedOwners.length > 0 && (
            <div className="selected-items-display">
              <strong>Selected Portfolio Owners:</strong> {selectedOwners.join(', ')}
            </div>
          )}
        </div>

        {modalEntityName && (
          <PortfolioOwnerModal
            cio={cioInfoForModal}
            PortfolioOwner={modalEntityName}
            Period={Period}
            PortfolioOwnerData={portfolioOwnerGraphs}
            onClose={closeModal}
            loading={loading}
            onNavigate={handleGraphNavigation}
            currentIndex={currentOwnerIndex}
            totalItems={navigationList.length}
            onPointClick={handlePointClick}
            key={modalEntityName}
            entityType={modalEntityType}
          />
        )}

        {showComparisonTable && (
          <ComparisonTableModal
            data={comparisonData}
            loading={loading}
            onClose={() => setShowComparisonTable(false)}
            entityType={comparisonEntityType}
          />
        )}

        {showViewOptionsModal && (
          <ViewOptionsModal
            onCancel={() => setShowViewOptionsModal(false)}
            onSelect={handleViewSelection}
          />
        )}

        {showDownloadOptionsModal && (
          <DownloadOptionsModal
            onCancel={() => setShowDownloadOptionsModal(false)}
            onSelect={handleDownloadSelection}
            isGenerating={isGeneratingPdf}
          />
        )}

        {showDetailsModal && (
          <DetailsModal
            title={detailsModalTitle}
            data={detailsModalData}
            columns={detailsModalColumns}
            loading={detailsModalLoading}
            onClose={() => setShowDetailsModal(false)}
            threshold={METRIC_THRESHOLDS[currentGraphKey] ?? null}
            currentGraphKey={currentGraphKey}
            noDataMessage={noDataMessage}
            bestPerformingApps={bestPerformingApps}
          />
        )}
      </main>
    </div>
  );
}

export default App;
