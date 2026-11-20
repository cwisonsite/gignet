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
  formatCurrency
} from './calculator.js';

import {
  loadSettings,
  saveSettings,
  loadOrders,
  saveOrders,
  loadTheme,
  saveTheme
} from './storage.js';

// Application state
let settings = loadSettings();
let orders = loadOrders();
let roundTripMode = Boolean(settings.defaultRoundTrip);
let currentEval = null;
let toastTimer = null;

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

  // Session dashboard
  sessionCountBadge: $('session-count-badge'),
  sessionNet: $('session-net'),
  sessionGross: $('session-gross'),
  sessionNetMile: $('session-net-mile'),
  sessionNetHour: $('session-net-hour'),
  sessionMiles: $('session-miles'),
  sessionOpCost: $('session-op-cost'),
  sessionIrsRef: $('session-irs-ref'),
  exportCsvBtn: $('export-csv-btn'),
  exportJsonBtn: $('export-json-btn'),
  clearSessionBtn: $('clear-session-btn'),
  orderList: $('order-list'),

  // Settings drawer
  drawerBackdrop: $('drawer-backdrop'),
  settingsDrawer: $('settings-drawer'),
  closeSettingsBtn: $('close-settings-btn'),
  doneSettingsBtn: $('done-settings-btn'),
  resetDefaultsBtn: $('reset-defaults-btn'),

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
   Session Dashboard & Order History
   ========================================================================== */
function logCurrentOrder() {
  if (!currentEval || !currentEval.hasValidOffer) return;

  const platform = settings.showPlatform ? els.platform.value : '';

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
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
  showToast('Order removed');
}

function clearSession() {
  if (orders.length === 0) return;
  if (!window.confirm(`Clear all ${orders.length} logged orders from this session?`)) return;
  orders = [];
  saveOrders(orders);
  renderSession();
  showToast('Session cleared');
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

function renderSession() {
  const summary = summarizeSession(orders);

  els.sessionCountBadge.textContent = `${summary.count} ${summary.count === 1 ? 'order' : 'orders'}`;
  els.sessionNet.textContent = formatCurrency(summary.trueNetPay);
  els.sessionGross.textContent = formatCurrency(summary.grossPay);
  els.sessionNetMile.textContent = summary.totalMiles > 0
    ? `${formatCurrency(summary.avgNetPerMile)}/mi`
    : '—';
  els.sessionNetHour.textContent = summary.avgNetPerHour !== null
    ? `${formatCurrency(summary.avgNetPerHour)}/hr`
    : '—';

  els.sessionMiles.textContent = `${summary.totalMiles.toFixed(1)} mi`;
  els.sessionOpCost.textContent = formatCurrency(summary.vehicleOperatingCost);
  els.sessionIrsRef.textContent = formatCurrency(summary.irsDeductionRef);

  const hasOrders = orders.length > 0;
  els.exportCsvBtn.disabled = !hasOrders;
  els.exportJsonBtn.disabled = !hasOrders;
  els.clearSessionBtn.disabled = !hasOrders;

  if (!hasOrders) {
    els.orderList.innerHTML = `
      <div class="empty-state">
        No orders logged yet. Punch in an offer and tap <strong>Log Order to Session</strong> to track your shift totals.
      </div>
    `;
    return;
  }

  els.orderList.innerHTML = orders
    .map((o) => {
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
    })
    .join('');
}

/* ==========================================================================
   Export Helpers (CSV & JSON)
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

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
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
    if (e.key === 'Escape' && els.settingsDrawer.classList.contains('open')) {
      setDrawerOpen(false);
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

  // Order list delete delegation
  els.orderList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-delete-id]');
    if (!btn) return;
    deleteOrder(btn.getAttribute('data-delete-id'));
  });

  // Exports & clear session
  els.exportCsvBtn.addEventListener('click', () => {
    if (orders.length === 0) return;
    triggerDownload(ordersToCSV(orders), `gignet-session-${dateStamp()}.csv`, 'text/csv;charset=utf-8');
    showToast('Exported session CSV');
  });

  els.exportJsonBtn.addEventListener('click', () => {
    if (orders.length === 0) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      settings,
      summary: summarizeSession(orders),
      orders
    };
    triggerDownload(JSON.stringify(payload, null, 2), `gignet-session-${dateStamp()}.json`, 'application/json');
    showToast('Exported session JSON');
  });

  els.clearSessionBtn.addEventListener('click', clearSession);
}

init();
