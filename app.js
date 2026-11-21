/**
 * app.js — DOM Controller for GigNet Calculator & Session Dashboard
 *
 * Keeps all financial math delegated to ./calculator.js and persistence
 * delegated to ./storage.js so the UI layer stays thin and maintainable.
 */

import {
  DEFAULT_SETTINGS,
  computePerMileRates,
  evaluateOrder,
  summarizeSession,
  ordersToCSV,
  dailySummaryToCSV,
  formatCurrency,
  toLocalDateKey,
  parseLocalDateKey,
  getOrderDateKey,
  getWeekBounds,
  formatRangeLabel,
  filterOrdersByDateRange,
  groupOrdersHierarchy
} from './calculator.js';

import {
  loadSettings,
  saveSettings,
  loadOrders,
  saveOrders,
  loadTheme,
  saveTheme,
  loadHistoryView,
  saveHistoryView
} from './storage.js';

// Application state
let settings = loadSettings();
let orders = loadOrders();
let roundTripMode = Boolean(settings.defaultRoundTrip);
let currentEval = null;
let toastTimer = null;

let activeTodayKey = toLocalDateKey(new Date());
let midnightTimer = null;
let historyView = loadHistoryView();
let expandedNodeIds = new Set();
let hasUserToggledTree = false;
let currentExportPreset = 'today';

// DOM references
const $ = (id) => document.getElementById(id);

const els = {
  // Quick entry
  pay: $('input-pay'),
  miles: $('input-miles'),
  minutes: $('input-minutes'),
  platformField: $('platform-field'),
  platform: $('input-platform'),
  notesSlot: $('notes-inline-slot'),
  notes: $('input-notes'),
  clearInputsBtn: $('clear-inputs-btn'),
  modeRoundTripBtn: $('mode-round-trip'),
  modeOneWayBtn: $('mode-one-way'),
  drivenMilesHint: $('driven-miles-hint'),

  // Header
  headerCostPerMile: $('header-cost-per-mile'),
  themeToggle: $('theme-toggle'),
  iconSun: $('theme-icon-sun'),
  iconMoon: $('theme-icon-moon'),
  openSettingsBtn: $('open-settings-btn'),
  openSettingsChip: $('open-settings-chip'),

  // Live results
  verdictBanner: $('verdict-banner'),
  verdictLabel: $('verdict-label'),
  verdictReason: $('verdict-reason'),
  resultNetPay: $('result-net-pay'),
  resultNetMile: $('result-net-mile'),
  resultGrossMile: $('result-gross-mile'),
  resultNetHour: $('result-net-hour'),
  resultGrossHour: $('result-gross-hour'),
  resultOpCost: $('result-op-cost'),
  resultOpRate: $('result-op-rate'),
  costBreakdownTotal: $('cost-breakdown-total'),

  segGas: $('seg-gas'),
  segRepair: $('seg-repair'),
  segOil: $('seg-oil'),
  segTire: $('seg-tire'),
  segExtra: $('seg-extra'),

  pillGas: $('pill-gas'),
  pillRepair: $('pill-repair'),
  pillOil: $('pill-oil'),
  pillTire: $('pill-tire'),
  pillExtraWrap: $('pill-extra-wrap'),
  pillExtra: $('pill-extra'),

  ledgerGross: $('ledger-gross'),
  ledgerOpCost: $('ledger-op-cost'),
  ledgerNet: $('ledger-net'),
  ledgerOptionalRow: $('ledger-optional-row'),
  ledgerOptionalLabel: $('ledger-optional-label'),
  ledgerOptionalVal: $('ledger-optional-val'),
  irsRateLabel: $('irs-rate-label'),
  ledgerIrsRef: $('ledger-irs-ref'),
  logOrderBtn: $('log-order-btn'),

  // Today's session dashboard
  todayDateLabel: $('today-date-label'),
  sessionCountBadge: $('session-count-badge'),
  sessionNet: $('session-net'),
  sessionGross: $('session-gross'),
  sessionNetMile: $('session-net-mile'),
  sessionNetHour: $('session-net-hour'),
  sessionMiles: $('session-miles'),
  sessionOpCost: $('session-op-cost'),
  sessionIrsRef: $('session-irs-ref'),
  openExportBtn: $('open-export-btn'),
  clearTodayBtn: $('clear-today-btn'),

  // Session history tree
  historyTotalsSub: $('history-totals-sub'),
  toggleExpandAllBtn: $('toggle-expand-all-btn'),
  viewTabs: Array.from(document.querySelectorAll('.view-tab')),
  historyTree: $('history-tree'),

  // Export modal
  exportBackdrop: $('export-backdrop'),
  exportModal: $('export-modal'),
  closeExportBtn: $('close-export-btn'),
  presetPills: Array.from(document.querySelectorAll('.preset-pill')),
  exportStartDate: $('export-start-date'),
  exportEndDate: $('export-end-date'),
  exportRangeLabel: $('export-range-label'),
  exportMatchBadge: $('export-match-badge'),
  exportPrevNet: $('export-prev-net'),
  exportPrevGross: $('export-prev-gross'),
  exportPrevMiles: $('export-prev-miles'),
  exportPrevCost: $('export-prev-cost'),
  exportPrevIrs: $('export-prev-irs'),
  exportPrevDays: $('export-prev-days'),
  downloadOrdersCsvBtn: $('download-orders-csv-btn'),
  downloadTaxCsvBtn: $('download-tax-csv-btn'),
  downloadJsonBtn: $('download-json-btn'),

  // Settings drawer
  drawerBackdrop: $('drawer-backdrop'),
  settingsDrawer: $('settings-drawer'),
  closeSettingsBtn: $('close-settings-btn'),
  doneSettingsBtn: $('done-settings-btn'),
  resetDefaultsBtn: $('reset-defaults-btn'),
  clearAllHistoryBtn: $('clear-all-history-btn'),

  setGasPrice: $('set-gas-price'),
  setMpg: $('set-mpg'),
  setRepairCost: $('set-repair-cost'),
  setRepairInterval: $('set-repair-interval'),
  setOilCost: $('set-oil-cost'),
  setOilInterval: $('set-oil-interval'),
  setTireCost: $('set-tire-cost'),
  setTireInterval: $('set-tire-interval'),
  setExtraEnabled: $('set-extra-enabled'),
  extraBufferFields: $('extra-buffer-fields'),
  setExtraMile: $('set-extra-mile'),
  setExtraOrder: $('set-extra-order'),
  setTaxEnabled: $('set-tax-enabled'),
  taxFields: $('tax-fields'),
  setTaxPct: $('set-tax-pct'),
  setIrsRate: $('set-irs-rate'),
  setAcceptMile: $('set-accept-mile'),
  setBorderMile: $('set-border-mile'),
  setAcceptHour: $('set-accept-hour'),
  setBorderHour: $('set-border-hour'),
  setDefaultRoundTrip: $('set-default-round-trip'),
  setShowPlatform: $('set-show-platform'),

  rateGasTag: $('rate-gas-tag'),
  rateRepairTag: $('rate-repair-tag'),
  rateOilTag: $('rate-oil-tag'),
  rateTireTag: $('rate-tire-tag'),
  rateExtraTag: $('rate-extra-tag'),

  toast: $('toast')
};

/* ==========================================================================
   Theme & Display Preferences
   ========================================================================== */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'light' ? '#f4f6f9' : '#0e1116');
  }
  els.iconSun.classList.toggle('hidden', theme === 'light');
  els.iconMoon.classList.toggle('hidden', theme === 'dark');
  saveTheme(theme);
}

function applyDisplayPreferences() {
  const showPlatform = Boolean(settings.showPlatform);
  els.platformField.classList.toggle('hidden', !showPlatform);
  els.notesSlot.classList.toggle('full-span', showPlatform);
}

function setTripMode(isRoundTrip) {
  roundTripMode = Boolean(isRoundTrip);
  els.modeRoundTripBtn.setAttribute('aria-pressed', String(roundTripMode));
  els.modeOneWayBtn.setAttribute('aria-pressed', String(!roundTripMode));
  renderLiveCalculation();
}

/* ==========================================================================
   Toast Feedback
   ========================================================================== */
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('show');
  }, 2200);
}

/* ==========================================================================
   Settings Drawer Sync
   ========================================================================== */
function populateSettingsUI() {
  els.setGasPrice.value = settings.gasPrice;
  els.setMpg.value = settings.mpg;
  els.setRepairCost.value = settings.repairCost;
  els.setRepairInterval.value = settings.repairInterval;
  els.setOilCost.value = settings.oilCost;
  els.setOilInterval.value = settings.oilInterval;
  els.setTireCost.value = settings.tireCost;
  els.setTireInterval.value = settings.tireInterval;

  els.setExtraEnabled.checked = Boolean(settings.extraBufferEnabled);
  els.extraBufferFields.classList.toggle('hidden', !settings.extraBufferEnabled);
  els.setExtraMile.value = settings.extraPerMile;
  els.setExtraOrder.value = settings.extraPerOrder;

  els.setTaxEnabled.checked = Boolean(settings.taxSetAsideEnabled);
  els.taxFields.classList.toggle('hidden', !settings.taxSetAsideEnabled);
  els.setTaxPct.value = settings.taxSetAsidePct;
  els.setIrsRate.value = settings.irsMileageRate;

  els.setAcceptMile.value = settings.acceptPerMile;
  els.setBorderMile.value = settings.borderlinePerMile;
  els.setAcceptHour.value = settings.acceptPerHour;
  els.setBorderHour.value = settings.borderlinePerHour;

  els.setDefaultRoundTrip.checked = Boolean(settings.defaultRoundTrip);
  els.setShowPlatform.checked = Boolean(settings.showPlatform);

  updateRateTags();
}

function updateRateTags() {
  const r = computePerMileRates(settings);
  els.headerCostPerMile.textContent = `$${r.totalVehiclePerMile.toFixed(2)}/mi`;
  els.rateGasTag.textContent = `$${r.gasPerMile.toFixed(3)}/mi`;
  els.rateRepairTag.textContent = `$${r.repairPerMile.toFixed(3)}/mi`;
  els.rateOilTag.textContent = `$${r.oilPerMile.toFixed(3)}/mi`;
  els.rateTireTag.textContent = `$${r.tirePerMile.toFixed(3)}/mi`;
  els.rateExtraTag.textContent = settings.extraBufferEnabled
    ? `+$${r.extraPerMile.toFixed(2)}/mi`
    : 'Off';
}

function readSettingsFromUI() {
  const parseOr = (inputEl, fallback) => {
    const val = parseFloat(inputEl.value);
    return Number.isFinite(val) && val >= 0 ? val : fallback;
  };

  const prevDefaultRT = Boolean(settings.defaultRoundTrip);
  const nextDefaultRT = els.setDefaultRoundTrip.checked;

  settings = {
    ...settings,
    gasPrice: parseOr(els.setGasPrice, DEFAULT_SETTINGS.gasPrice),
    mpg: Math.max(1, parseOr(els.setMpg, DEFAULT_SETTINGS.mpg)),
    repairCost: parseOr(els.setRepairCost, 0),
    repairInterval: Math.max(100, parseOr(els.setRepairInterval, DEFAULT_SETTINGS.repairInterval)),
    oilCost: parseOr(els.setOilCost, 0),
    oilInterval: Math.max(100, parseOr(els.setOilInterval, DEFAULT_SETTINGS.oilInterval)),
    tireCost: parseOr(els.setTireCost, 0),
    tireInterval: Math.max(1000, parseOr(els.setTireInterval, DEFAULT_SETTINGS.tireInterval)),
    extraBufferEnabled: els.setExtraEnabled.checked,
    extraPerMile: parseOr(els.setExtraMile, 0),
    extraPerOrder: parseOr(els.setExtraOrder, 0),
    taxSetAsideEnabled: els.setTaxEnabled.checked,
    taxSetAsidePct: Math.min(60, parseOr(els.setTaxPct, 0)),
    irsMileageRate: parseOr(els.setIrsRate, DEFAULT_SETTINGS.irsMileageRate),
    acceptPerMile: parseOr(els.setAcceptMile, DEFAULT_SETTINGS.acceptPerMile),
    borderlinePerMile: parseOr(els.setBorderMile, DEFAULT_SETTINGS.borderlinePerMile),
    acceptPerHour: parseOr(els.setAcceptHour, DEFAULT_SETTINGS.acceptPerHour),
    borderlinePerHour: parseOr(els.setBorderHour, DEFAULT_SETTINGS.borderlinePerHour),
    defaultRoundTrip: nextDefaultRT,
    showPlatform: els.setShowPlatform.checked
  };

  els.extraBufferFields.classList.toggle('hidden', !settings.extraBufferEnabled);
  els.taxFields.classList.toggle('hidden', !settings.taxSetAsideEnabled);

  saveSettings(settings);
  applyDisplayPreferences();
  updateRateTags();

  if (prevDefaultRT !== nextDefaultRT) {
    setTripMode(nextDefaultRT);
  } else {
    renderLiveCalculation();
  }
}

function setDrawerOpen(isOpen) {
  els.drawerBackdrop.classList.toggle('open', isOpen);
  els.settingsDrawer.classList.toggle('open', isOpen);
  els.drawerBackdrop.setAttribute('aria-hidden', String(!isOpen));
  if (isOpen) {
    populateSettingsUI();
  }
}

/* ==========================================================================
   Live Order Calculation Render
   ========================================================================== */
function renderLiveCalculation() {
  const result = evaluateOrder(
    {
      pay: els.pay.value,
      miles: els.miles.value,
      minutes: els.minutes.value,
      roundTrip: roundTripMode
    },
    settings
  );
  currentEval = result;

  // Driven miles hint next to Round Trip / One-Way toggle
  if (result.inputs.offerMiles > 0) {
    els.drivenMilesHint.textContent = result.inputs.roundTrip
      ? `${result.inputs.offerMiles.toFixed(1)} mi offer → ${result.inputs.effectiveMiles.toFixed(1)} mi driven`
      : `${result.inputs.effectiveMiles.toFixed(1)} mi one-way`;
  } else {
    els.drivenMilesHint.textContent = roundTripMode
      ? '2× round-trip active'
      : '1× one-way active';
  }

  // Verdict banner
  els.verdictBanner.setAttribute('data-verdict', result.verdict.code);
  els.verdictLabel.textContent = result.verdict.label;
  els.verdictReason.textContent = result.verdict.reason;
  els.resultNetPay.textContent = formatCurrency(result.trueNetPay);

  // Headline metrics
  if (result.hasValidOffer) {
    els.resultNetMile.textContent = `${formatCurrency(result.netPerMile)}/mi`;
    els.resultGrossMile.textContent = `Gross: ${formatCurrency(result.grossPerMile)}/mi`;
  } else {
    els.resultNetMile.textContent = '—';
    els.resultGrossMile.textContent = 'Gross: —';
  }

  if (result.hasValidOffer && result.hasMinutes) {
    els.resultNetHour.textContent = `${formatCurrency(result.netPerHour)}/hr`;
    els.resultGrossHour.textContent = `Gross: ${formatCurrency(result.grossPerHour)}/hr`;
  } else {
    els.resultNetHour.textContent = '—';
    els.resultGrossHour.textContent = 'Add mins';
  }

  els.resultOpCost.textContent = formatCurrency(result.costs.vehicleOperatingCost);
  els.resultOpRate.textContent = `$${result.rates.totalVehiclePerMile.toFixed(2)}/mi`;
  els.costBreakdownTotal.textContent = formatCurrency(result.costs.vehicleOperatingCost);

  // Stacked cost bar
  const hasCost = result.costs.vehicleOperatingCost > 0;
  els.segGas.style.width = hasCost ? `${result.costShares.gasPct.toFixed(2)}%` : '0%';
  els.segRepair.style.width = hasCost ? `${result.costShares.repairPct.toFixed(2)}%` : '0%';
  els.segOil.style.width = hasCost ? `${result.costShares.oilPct.toFixed(2)}%` : '0%';
  els.segTire.style.width = hasCost ? `${result.costShares.tirePct.toFixed(2)}%` : '0%';
  els.segExtra.style.width = hasCost ? `${result.costShares.extraPct.toFixed(2)}%` : '0%';

  // Cost pills
  els.pillGas.textContent = formatCurrency(result.costs.gasCost);
  els.pillRepair.textContent = formatCurrency(result.costs.repairCost);
  els.pillOil.textContent = formatCurrency(result.costs.oilCost);
  els.pillTire.textContent = formatCurrency(result.costs.tireCost);

  const showExtraPill = settings.extraBufferEnabled && result.rates.extraPerMile > 0;
  els.pillExtraWrap.classList.toggle('hidden', !showExtraPill);
  els.pillExtra.textContent = formatCurrency(result.costs.extraMileCost);

  // Ledger rows
  els.ledgerGross.textContent = formatCurrency(result.grossPay);
  els.ledgerOpCost.textContent = `-${formatCurrency(result.costs.vehicleOperatingCost)}`;
  els.ledgerNet.textContent = formatCurrency(result.trueNetPay);

  const hasOptionalDeduction =
    (settings.extraBufferEnabled && result.costs.extraOrderBuffer > 0) ||
    (settings.taxSetAsideEnabled && result.costs.taxSetAsidePct > 0);

  els.ledgerOptionalRow.classList.toggle('hidden', !hasOptionalDeduction);
  if (hasOptionalDeduction) {
    const parts = [];
    if (settings.extraBufferEnabled && result.costs.extraOrderBuffer > 0) {
      parts.push(`$${result.costs.extraOrderBuffer.toFixed(2)} buffer`);
    }
    if (settings.taxSetAsideEnabled && result.costs.taxSetAsidePct > 0) {
      parts.push(`${result.costs.taxSetAsidePct}% tax (${formatCurrency(result.costs.taxSetAsideAmount)})`);
    }
    els.ledgerOptionalLabel.textContent = `After ${parts.join(' + ')}`;
    els.ledgerOptionalVal.textContent = formatCurrency(result.takeHomeAfterOptional);
  }

  els.irsRateLabel.textContent = `$${result.rates.irsMileageRate.toFixed(2)}`;
  els.ledgerIrsRef.textContent = formatCurrency(result.irsDeductionRef);

  // Enable log button only when offer pay & miles are valid
  els.logOrderBtn.disabled = !result.hasValidOffer;
}

/* ==========================================================================
   Midnight Auto-Rollover (Daily Sessions end at 12:00 AM local time)
   ========================================================================== */
function checkMidnightRollover(silent = false) {
  const nowKey = toLocalDateKey(new Date());
  if (nowKey && nowKey !== activeTodayKey) {
    activeTodayKey = nowKey;
    hasUserToggledTree = false;
    expandedNodeIds.clear();
    renderSession();
    if (!silent) {
      showToast('Midnight rollover — new daily session started');
    }
  }
  scheduleMidnightRollover();
}

function scheduleMidnightRollover() {
  clearTimeout(midnightTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  const delay = Math.max(1000, nextMidnight.getTime() - now.getTime());
  midnightTimer = setTimeout(() => checkMidnightRollover(false), delay);
}

/* ==========================================================================
   Session Dashboard & Collapsible History Tree
   ========================================================================== */
function logCurrentOrder() {
  if (!currentEval || !currentEval.hasValidOffer) return;

  // Ensure session date reflects current local day even if clock just passed midnight
  checkMidnightRollover(true);

  const now = new Date();
  const sessionDate = toLocalDateKey(now);
  const platform = settings.showPlatform ? els.platform.value : '';

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now.toISOString(),
    sessionDate,
    platform,
    notes: els.notes.value.trim(),
    verdict: currentEval.verdict.code,
    grossPay: currentEval.grossPay,
    offerMiles: currentEval.inputs.offerMiles,
    effectiveMiles: currentEval.inputs.effectiveMiles,
    miles: currentEval.inputs.effectiveMiles,
    roundTrip: currentEval.inputs.roundTrip,
    minutes: currentEval.inputs.minutes || null,
    gasCost: currentEval.costs.gasCost,
    repairCost: currentEval.costs.repairCost,
    oilCost: currentEval.costs.oilCost,
    tireCost: currentEval.costs.tireCost,
    extraMileCost: currentEval.costs.extraMileCost,
    vehicleOperatingCost: currentEval.costs.vehicleOperatingCost,
    trueNetPay: currentEval.trueNetPay,
    netPerMile: currentEval.netPerMile,
    netPerHour: currentEval.netPerHour,
    irsDeductionRef: currentEval.irsDeductionRef
  };

  orders.unshift(entry);
  saveOrders(orders);

  // Auto-expand the path to today's session so the newly logged order is visible
  expandPathToDate(sessionDate);
  renderSession();

  // Reset offer fields for fast next entry (restore default round-trip preference)
  els.pay.value = '';
  els.miles.value = '';
  els.minutes.value = '';
  els.notes.value = '';
  setTripMode(settings.defaultRoundTrip);
  els.pay.focus();

  const label = platform ? `${platform} order` : 'order';
  showToast(`Logged ${label} (${formatCurrency(entry.trueNetPay)} net)`);
}

function deleteOrder(id) {
  orders = orders.filter((o) => o.id !== id);
  saveOrders(orders);
  renderSession();
  if (els.exportModal.classList.contains('open')) {
    updateExportPreview();
  }
  showToast('Order removed');
}

function clearTodaySession() {
  const todayOrders = orders.filter((o) => getOrderDateKey(o) === activeTodayKey);
  if (todayOrders.length === 0) return;
  if (!window.confirm(`Clear all ${todayOrders.length} logged orders from today's session? Past days will remain in your history.`)) {
    return;
  }
  orders = orders.filter((o) => getOrderDateKey(o) !== activeTodayKey);
  saveOrders(orders);
  renderSession();
  showToast("Today's session cleared");
}

function clearAllHistory() {
  if (orders.length === 0) {
    showToast('No saved history to clear');
    return;
  }
  if (!window.confirm(`Permanently delete ALL ${orders.length} logged orders across all days and years? Consider exporting a backup first.`)) {
    return;
  }
  orders = [];
  expandedNodeIds.clear();
  hasUserToggledTree = false;
  saveOrders(orders);
  renderSession();
  showToast('All session history cleared');
}

function formatShortTime(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collectNodeIds(nodes, out = []) {
  for (const n of nodes) {
    out.push(n.id);
    if (n.children && n.children.length > 0) {
      collectNodeIds(n.children, out);
    }
  }
  return out;
}

function expandPathToDate(dateKey) {
  const tree = groupOrdersHierarchy(orders, historyView, activeTodayKey);
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.startKey <= dateKey && n.endKey >= dateKey) {
        expandedNodeIds.add(n.id);
        if (n.children && n.children.length > 0) {
          walk(n.children);
        }
        return true;
      }
    }
    return false;
  };
  walk(tree);
}

function setHistoryView(view) {
  if (historyView === view) return;
  historyView = view;
  saveHistoryView(view);
  expandedNodeIds.clear();
  hasUserToggledTree = false;
  renderSession();
}

function renderOrderItemHTML(o) {
  const platformHtml = o.platform
    ? `<span class="platform-tag">${escapeHTML(o.platform)}</span>`
    : '';
  const tripTag = o.roundTrip ? '2× RT' : '1× OW';
  const drivenMiles = o.effectiveMiles ?? o.miles ?? 0;
  const hrChip = o.netPerHour !== null && o.netPerHour !== undefined
    ? `<span>${formatCurrency(o.netPerHour)}/hr</span>`
    : '';
  const notesHtml = o.notes
    ? `<div class="order-notes">${escapeHTML(o.notes)}</div>`
    : '';

  return `
    <article class="order-item">
      <div class="order-top">
        <div class="order-meta">
          ${platformHtml}
          <span class="verdict-chip ${escapeHTML(o.verdict)}">${escapeHTML(o.verdict)}</span>
          <span class="platform-tag">${tripTag}</span>
          <span class="order-time">${escapeHTML(formatShortTime(o.timestamp))}</span>
        </div>
        <button type="button" class="order-delete" data-delete-id="${escapeHTML(o.id)}" aria-label="Delete order" title="Remove order">&times;</button>
      </div>
      <div class="order-nums tabular">
        <div class="order-net-main">
          ${formatCurrency(o.trueNetPay)} net
          <small>from ${formatCurrency(o.grossPay)}</small>
        </div>
        <div class="order-stats">
          <span>${drivenMiles.toFixed(1)} mi</span>
          <span>${formatCurrency(o.netPerMile)}/mi</span>
          ${hrChip}
        </div>
      </div>
      ${notesHtml}
    </article>
  `;
}

function renderTreeNodeHTML(node) {
  const isExpanded = expandedNodeIds.has(node.id);
  const s = node.summary;
  const netClass = s.trueNetPay < 0 ? 'tree-net is-negative' : 'tree-net';
  const orderCountStr = `${s.count} ${s.count === 1 ? 'order' : 'orders'}`;
  const subParts = [];
  if (node.level !== 'day') {
    subParts.push(node.sublabel);
  }
  subParts.push(orderCountStr);
  subParts.push(`${s.totalMiles.toFixed(1)} mi`);
  subParts.push(`Gross ${formatCurrency(s.grossPay)}`);
  subParts.push(`IRS ${formatCurrency(s.irsDeductionRef)}`);

  let childrenHTML = '';
  if (isExpanded) {
    if (node.children && node.children.length > 0) {
      childrenHTML = `<div class="tree-children">${node.children.map(renderTreeNodeHTML).join('')}</div>`;
    } else {
      childrenHTML = `<div class="tree-children">${node.orders.map(renderOrderItemHTML).join('')}</div>`;
    }
  }

  return `
    <div class="tree-node" data-level="${escapeHTML(node.level)}" data-expanded="${isExpanded}" data-today="${Boolean(node.isToday)}">
      <div class="tree-node-header">
        <button type="button" class="tree-toggle-btn" data-toggle-node="${escapeHTML(node.id)}" aria-expanded="${isExpanded}">
          <span class="tree-chevron" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </span>
          <div class="tree-info">
            <div class="tree-top-line">
              <span class="tree-label">${escapeHTML(node.label)}</span>
              <span class="${netClass} tabular">${formatCurrency(s.trueNetPay)}</span>
            </div>
            <div class="tree-meta-line tabular">
              <span>${escapeHTML(subParts.join(' · '))}</span>
            </div>
          </div>
        </button>
        <button
          type="button"
          class="tree-export-btn"
          data-export-start="${escapeHTML(node.startKey)}"
          data-export-end="${escapeHTML(node.endKey)}"
          data-export-label="${escapeHTML(node.label)}"
          aria-label="Export ${escapeHTML(node.label)}"
          title="Export ${escapeHTML(node.label)}"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
      ${childrenHTML}
    </div>
  `;
}

function renderSession() {
  // 1. Today's Session KPIs (midnight-bounded local day)
  const todayDateObj = parseLocalDateKey(activeTodayKey) || new Date();
  const todayNice = todayDateObj.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  els.todayDateLabel.textContent = `${todayNice} · Ends 12:00 AM`;

  const todayOrders = orders.filter((o) => getOrderDateKey(o) === activeTodayKey);
  const todaySummary = summarizeSession(todayOrders);

  els.sessionCountBadge.textContent = `${todaySummary.count} ${todaySummary.count === 1 ? 'order' : 'orders'}`;
  els.sessionNet.textContent = formatCurrency(todaySummary.trueNetPay);
  els.sessionGross.textContent = formatCurrency(todaySummary.grossPay);
  els.sessionNetMile.textContent = todaySummary.totalMiles > 0
    ? `${formatCurrency(todaySummary.avgNetPerMile)}/mi`
    : '—';
  els.sessionNetHour.textContent = todaySummary.avgNetPerHour !== null
    ? `${formatCurrency(todaySummary.avgNetPerHour)}/hr`
    : '—';

  els.sessionMiles.textContent = `${todaySummary.totalMiles.toFixed(1)} mi`;
  els.sessionOpCost.textContent = formatCurrency(todaySummary.vehicleOperatingCost);
  els.sessionIrsRef.textContent = formatCurrency(todaySummary.irsDeductionRef);

  els.openExportBtn.disabled = orders.length === 0;
  els.clearTodayBtn.disabled = todayOrders.length === 0;

  // 2. View Switcher Tabs
  els.viewTabs.forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.getAttribute('data-view') === historyView));
  });

  // 3. Collapsible History Tree
  const allSummary = summarizeSession(orders);
  const distinctDays = new Set(orders.map(getOrderDateKey).filter(Boolean)).size;
  els.historyTotalsSub.textContent = orders.length > 0
    ? `${allSummary.count} ${allSummary.count === 1 ? 'order' : 'orders'} · ${distinctDays} ${distinctDays === 1 ? 'day' : 'days'} · ${formatCurrency(allSummary.trueNetPay)} net`
    : '0 orders logged';

  if (orders.length === 0) {
    els.toggleExpandAllBtn.disabled = true;
    els.toggleExpandAllBtn.textContent = 'Expand All';
    els.historyTree.innerHTML = `
      <div class="empty-state">
        No orders logged yet. Punch in an offer and tap <strong>Log Order to Session</strong> to start today's shift. Sessions automatically close each day at midnight.
      </div>
    `;
    return;
  }

  const tree = groupOrdersHierarchy(orders, historyView, activeTodayKey);

  // On initial view load (before user toggles anything), auto-expand today's path or the most recent top-level node
  if (!hasUserToggledTree && expandedNodeIds.size === 0 && tree.length > 0) {
    if (todayOrders.length > 0) {
      expandPathToDate(activeTodayKey);
    } else {
      expandedNodeIds.add(tree[0].id);
    }
  }

  const allNodeIds = collectNodeIds(tree);
  const allExpanded = allNodeIds.length > 0 && allNodeIds.every((id) => expandedNodeIds.has(id));
  els.toggleExpandAllBtn.disabled = false;
  els.toggleExpandAllBtn.textContent = allExpanded ? 'Collapse All' : 'Expand All';

  els.historyTree.innerHTML = tree.map(renderTreeNodeHTML).join('');
}

/* ==========================================================================
   Export Timeframe Modal & File Downloads (CSV / Tax Summary / JSON)
   ========================================================================== */
function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getPresetRange(preset) {
  const todayObj = parseLocalDateKey(activeTodayKey) || new Date();
  const year = todayObj.getFullYear();
  const month = todayObj.getMonth();

  if (preset === 'today') {
    return { startKey: activeTodayKey, endKey: activeTodayKey, label: 'Today' };
  }
  if (preset === 'this-week') {
    const { weekStartKey, weekEndKey } = getWeekBounds(activeTodayKey);
    return { startKey: weekStartKey, endKey: weekEndKey, label: 'This Week' };
  }
  if (preset === 'this-month') {
    const startKey = toLocalDateKey(new Date(year, month, 1));
    const endKey = toLocalDateKey(new Date(year, month + 1, 0));
    return { startKey, endKey, label: 'This Month' };
  }
  if (preset === 'this-year') {
    return { startKey: `${year}-01-01`, endKey: `${year}-12-31`, label: `${year} Tax Year` };
  }
  if (preset === 'last-year') {
    const prev = year - 1;
    return { startKey: `${prev}-01-01`, endKey: `${prev}-12-31`, label: `${prev} Tax Year` };
  }
  // 'all'
  const keys = orders.map(getOrderDateKey).filter(Boolean).sort();
  return {
    startKey: keys[0] || activeTodayKey,
    endKey: keys[keys.length - 1] || activeTodayKey,
    label: 'All Time'
  };
}

function setExportModalOpen(isOpen) {
  els.exportBackdrop.classList.toggle('open', isOpen);
  els.exportModal.classList.toggle('open', isOpen);
  els.exportBackdrop.setAttribute('aria-hidden', String(!isOpen));
  els.exportModal.setAttribute('aria-hidden', String(!isOpen));
}

function openExportModal(opts = {}) {
  if (opts.startKey && opts.endKey) {
    currentExportPreset = 'custom';
    els.exportStartDate.value = opts.startKey;
    els.exportEndDate.value = opts.endKey;
    els.exportRangeLabel.textContent = opts.label || formatRangeLabel(opts.startKey, opts.endKey);
  } else {
    const defaultPreset = orders.some((o) => getOrderDateKey(o) === activeTodayKey)
      ? 'today'
      : 'all';
    applyExportPreset(opts.preset || defaultPreset);
  }
  syncPresetPills();
  updateExportPreview();
  setExportModalOpen(true);
}

function applyExportPreset(preset) {
  currentExportPreset = preset;
  const { startKey, endKey, label } = getPresetRange(preset);
  els.exportStartDate.value = startKey;
  els.exportEndDate.value = endKey;
  els.exportRangeLabel.textContent = label;
  syncPresetPills();
  updateExportPreview();
}

function syncPresetPills() {
  els.presetPills.forEach((pill) => {
    pill.classList.toggle('active', pill.getAttribute('data-preset') === currentExportPreset);
  });
}

function getExportSelection() {
  let startKey = els.exportStartDate.value || null;
  let endKey = els.exportEndDate.value || null;
  if (startKey && endKey && startKey > endKey) {
    [startKey, endKey] = [endKey, startKey];
  }
  const matching = filterOrdersByDateRange(orders, startKey, endKey);
  const fileSlug = startKey && endKey
    ? (startKey === endKey ? startKey : `${startKey}_to_${endKey}`)
    : activeTodayKey;
  return { startKey, endKey, matching, fileSlug };
}

function updateExportPreview() {
  const { startKey, endKey, matching } = getExportSelection();
  const summary = summarizeSession(matching);
  const days = new Set(matching.map(getOrderDateKey).filter(Boolean)).size;

  if (currentExportPreset === 'custom' && startKey && endKey) {
    els.exportRangeLabel.textContent = formatRangeLabel(startKey, endKey);
  }

  els.exportMatchBadge.textContent = `${summary.count} ${summary.count === 1 ? 'order' : 'orders'}`;
  els.exportPrevNet.textContent = formatCurrency(summary.trueNetPay);
  els.exportPrevGross.textContent = formatCurrency(summary.grossPay);
  els.exportPrevMiles.textContent = `${summary.totalMiles.toFixed(1)} mi`;
  els.exportPrevCost.textContent = formatCurrency(summary.vehicleOperatingCost);
  els.exportPrevIrs.textContent = formatCurrency(summary.irsDeductionRef);
  els.exportPrevDays.textContent = String(days);

  const disabled = matching.length === 0;
  els.downloadOrdersCsvBtn.disabled = disabled;
  els.downloadTaxCsvBtn.disabled = disabled;
  els.downloadJsonBtn.disabled = disabled;
}

/* ==========================================================================
   Event Wiring & Initialization
   ========================================================================== */
function init() {
  applyTheme(loadTheme());
  applyDisplayPreferences();
  populateSettingsUI();
  setTripMode(settings.defaultRoundTrip);
  renderSession();
  scheduleMidnightRollover();

  // Check midnight rollover when returning to the app/tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkMidnightRollover(false);
    }
  });
  window.addEventListener('focus', () => checkMidnightRollover(false));

  // Instant live calculation on every keystroke
  [els.pay, els.miles, els.minutes].forEach((input) => {
    input.addEventListener('input', renderLiveCalculation);
  });

  // One-tap Round Trip (2x) vs One-Way (1x) toggle
  els.modeRoundTripBtn.addEventListener('click', () => setTripMode(true));
  els.modeOneWayBtn.addEventListener('click', () => setTripMode(false));

  els.clearInputsBtn.addEventListener('click', () => {
    els.pay.value = '';
    els.miles.value = '';
    els.minutes.value = '';
    els.notes.value = '';
    setTripMode(settings.defaultRoundTrip);
    els.pay.focus();
  });

  els.logOrderBtn.addEventListener('click', logCurrentOrder);

  // Theme toggle
  els.themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  // Settings drawer open/close
  els.openSettingsBtn.addEventListener('click', () => setDrawerOpen(true));
  els.openSettingsChip.addEventListener('click', () => setDrawerOpen(true));
  els.closeSettingsBtn.addEventListener('click', () => setDrawerOpen(false));
  els.doneSettingsBtn.addEventListener('click', () => setDrawerOpen(false));
  els.drawerBackdrop.addEventListener('click', () => setDrawerOpen(false));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (els.exportModal.classList.contains('open')) {
        setExportModalOpen(false);
      } else if (els.settingsDrawer.classList.contains('open')) {
        setDrawerOpen(false);
      }
    }
  });

  // Live settings updates
  const settingInputs = [
    els.setGasPrice,
    els.setMpg,
    els.setRepairCost,
    els.setRepairInterval,
    els.setOilCost,
    els.setOilInterval,
    els.setTireCost,
    els.setTireInterval,
    els.setExtraEnabled,
    els.setExtraMile,
    els.setExtraOrder,
    els.setTaxEnabled,
    els.setTaxPct,
    els.setIrsRate,
    els.setAcceptMile,
    els.setBorderMile,
    els.setAcceptHour,
    els.setBorderHour,
    els.setDefaultRoundTrip,
    els.setShowPlatform
  ];

  settingInputs.forEach((el) => {
    const eventName = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, readSettingsFromUI);
  });

  els.resetDefaultsBtn.addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS };
    saveSettings(settings);
    applyDisplayPreferences();
    populateSettingsUI();
    setTripMode(settings.defaultRoundTrip);
    showToast('Reset to default assumptions');
  });

  els.clearAllHistoryBtn.addEventListener('click', clearAllHistory);

  // View switcher tabs (Daily / Weekly / Monthly / Yearly)
  els.viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setHistoryView(tab.getAttribute('data-view'));
    });
  });

  // Expand All / Collapse All
  els.toggleExpandAllBtn.addEventListener('click', () => {
    const tree = groupOrdersHierarchy(orders, historyView, activeTodayKey);
    const allIds = collectNodeIds(tree);
    const allExpanded = allIds.length > 0 && allIds.every((id) => expandedNodeIds.has(id));
    hasUserToggledTree = true;
    if (allExpanded) {
      expandedNodeIds.clear();
    } else {
      allIds.forEach((id) => expandedNodeIds.add(id));
    }
    renderSession();
  });

  // Delegated clicks inside History Tree (expand/collapse, per-period export, delete order)
  els.historyTree.addEventListener('click', (e) => {
    const exportBtn = e.target.closest('[data-export-start]');
    if (exportBtn) {
      openExportModal({
        startKey: exportBtn.getAttribute('data-export-start'),
        endKey: exportBtn.getAttribute('data-export-end'),
        label: exportBtn.getAttribute('data-export-label')
      });
      return;
    }

    const toggleBtn = e.target.closest('[data-toggle-node]');
    if (toggleBtn) {
      const id = toggleBtn.getAttribute('data-toggle-node');
      hasUserToggledTree = true;
      if (expandedNodeIds.has(id)) {
        expandedNodeIds.delete(id);
      } else {
        expandedNodeIds.add(id);
      }
      renderSession();
      return;
    }

    const delBtn = e.target.closest('[data-delete-id]');
    if (delBtn) {
      deleteOrder(delBtn.getAttribute('data-delete-id'));
    }
  });

  // Today's session actions
  els.openExportBtn.addEventListener('click', () => openExportModal());
  els.clearTodayBtn.addEventListener('click', clearTodaySession);

  // Export modal interactions
  els.closeExportBtn.addEventListener('click', () => setExportModalOpen(false));
  els.exportBackdrop.addEventListener('click', () => setExportModalOpen(false));

  els.presetPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      applyExportPreset(pill.getAttribute('data-preset'));
    });
  });

  [els.exportStartDate, els.exportEndDate].forEach((input) => {
    input.addEventListener('change', () => {
      currentExportPreset = 'custom';
      syncPresetPills();
      updateExportPreview();
    });
  });

  els.downloadOrdersCsvBtn.addEventListener('click', () => {
    const { matching, fileSlug } = getExportSelection();
    if (matching.length === 0) return;
    triggerDownload(ordersToCSV(matching), `gignet-orders-${fileSlug}.csv`, 'text/csv;charset=utf-8');
    showToast(`Exported ${matching.length} orders to CSV`);
  });

  els.downloadTaxCsvBtn.addEventListener('click', () => {
    const { matching, fileSlug } = getExportSelection();
    if (matching.length === 0) return;
    triggerDownload(dailySummaryToCSV(matching), `gignet-tax-summary-${fileSlug}.csv`, 'text/csv;charset=utf-8');
    showToast('Exported Tax Daily Summary CSV');
  });

  els.downloadJsonBtn.addEventListener('click', () => {
    const { startKey, endKey, matching, fileSlug } = getExportSelection();
    if (matching.length === 0) return;
    const dailySummaries = groupOrdersHierarchy(matching, 'daily', activeTodayKey)
      .reverse()
      .map((d) => ({ date: d.startKey, ...d.summary }));
    const payload = {
      exportedAt: new Date().toISOString(),
      timeframe: {
        label: els.exportRangeLabel.textContent,
        startDate: startKey,
        endDate: endKey
      },
      settings,
      summary: summarizeSession(matching),
      dailySummaries,
      orders: matching
    };
    triggerDownload(JSON.stringify(payload, null, 2), `gignet-backup-${fileSlug}.json`, 'application/json');
    showToast('Exported JSON backup');
  });
}

init();
