/**
 * calculator.js — Modular Gig Order Net Profit Calculation Engine
 *
 * Pure, framework-free ES module with zero DOM dependencies.
 * Designed so it can be reused directly in:
 *   - This mobile-first web app / PWA
 *   - An Android WebView or floating screen-overlay shell
 *   - A background sync worker (e.g., Google Drive / Sheets sync)
 */

/**
 * Default cost model & threshold assumptions.
 * Pre-populated for a 2009 Chrysler Town & Country in Ohio (2026 IRS rate).
 */
export const DEFAULT_SETTINGS = Object.freeze({
  // Fuel
  gasPrice: 3.40,           // $/gallon (Ohio regular baseline)
  mpg: 15.5,                // Vehicle fuel economy (MPG)

  // Maintenance & wear reserves
  repairCost: 500,          // $ per repair reserve cycle
  repairInterval: 10000,    // miles per repair reserve cycle ($0.05/mi)

  oilCost: 65,              // $ per oil change
  oilInterval: 5000,        // miles per oil change ($0.013/mi)

  tireCost: 600,            // $ per full tire set
  tireInterval: 40000,      // miles per tire set ($0.015/mi)

  // Optional extra reserves (off / 0 by default)
  extraBufferEnabled: false,
  extraPerMile: 0.00,       // $/mile (e.g., brakes, fluids, misc)
  extraPerOrder: 0.00,      // $/order flat buffer
  taxSetAsideEnabled: false,
  taxSetAsidePct: 15,       // % of true net profit to set aside for self-employment tax

  // Reference only — never mixed into cash operating cost
  irsMileageRate: 0.76,     // 2026 IRS standard mileage deduction ($/mile)

  // Decision verdict thresholds
  acceptPerMile: 1.25,      // Min Net $/mile for ACCEPT
  borderlinePerMile: 0.85,  // Min Net $/mile for BORDERLINE (below = DECLINE)
  acceptPerHour: 18.00,     // Min Net $/hr for ACCEPT (when minutes entered)
  borderlinePerHour: 13.00, // Min Net $/hr for BORDERLINE (when minutes entered)

  // Workflow preferences
  defaultRoundTrip: true,   // Double app-shown offer miles by default (deadhead return)
  showPlatform: false       // Hide gig platform selector unless enabled in Settings
});

/**
 * Safely parse a numeric value, falling back to `fallback` if invalid or negative.
 * @param {number|string} value
 * @param {number} [fallback=0]
 * @param {boolean} [allowZero=true]
 * @returns {number}
 */
export function safeNum(value, fallback = 0, allowZero = true) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  if (!allowZero && n === 0) return fallback;
  return n;
}

/**
 * Compute per-mile operating cost rates from user settings.
 * @param {Partial<typeof DEFAULT_SETTINGS>} rawSettings
 */
export function computePerMileRates(rawSettings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...rawSettings };

  const gasPrice = safeNum(s.gasPrice, DEFAULT_SETTINGS.gasPrice);
  const mpg = safeNum(s.mpg, DEFAULT_SETTINGS.mpg, false);

  const repairCost = safeNum(s.repairCost, 0);
  const repairInterval = safeNum(s.repairInterval, DEFAULT_SETTINGS.repairInterval, false);

  const oilCost = safeNum(s.oilCost, 0);
  const oilInterval = safeNum(s.oilInterval, DEFAULT_SETTINGS.oilInterval, false);

  const tireCost = safeNum(s.tireCost, 0);
  const tireInterval = safeNum(s.tireInterval, DEFAULT_SETTINGS.tireInterval, false);

  const gasPerMile = gasPrice / mpg;
  const repairPerMile = repairCost / repairInterval;
  const oilPerMile = oilCost / oilInterval;
  const tirePerMile = tireCost / tireInterval;

  const extraPerMile = s.extraBufferEnabled ? safeNum(s.extraPerMile, 0) : 0;
  const extraPerOrder = s.extraBufferEnabled ? safeNum(s.extraPerOrder, 0) : 0;

  const baseVehiclePerMile = gasPerMile + repairPerMile + oilPerMile + tirePerMile;
  const totalVehiclePerMile = baseVehiclePerMile + extraPerMile;

  return {
    gasPerMile,
    repairPerMile,
    oilPerMile,
    tirePerMile,
    extraPerMile,
    extraPerOrder,
    baseVehiclePerMile,
    totalVehiclePerMile,
    irsMileageRate: safeNum(s.irsMileageRate, DEFAULT_SETTINGS.irsMileageRate)
  };
}

/**
 * Evaluate a single gig order offer.
 *
 * @param {{ pay: number|string, miles: number|string, minutes?: number|string, roundTrip?: boolean }} order
 * @param {Partial<typeof DEFAULT_SETTINGS>} rawSettings
 */
export function evaluateOrder(order, rawSettings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...rawSettings };
  const rates = computePerMileRates(s);

  const grossPay = safeNum(order?.pay, 0);
  const offerMiles = safeNum(order?.miles, 0);
  const roundTrip = order?.roundTrip !== undefined
    ? Boolean(order.roundTrip)
    : Boolean(s.defaultRoundTrip);
  const effectiveMiles = roundTrip ? offerMiles * 2 : offerMiles;
  const minutes = safeNum(order?.minutes, 0);

  const hasValidOffer = grossPay > 0 && offerMiles > 0;
  const hasMinutes = minutes > 0;

  // Individual vehicle operating costs for total driven miles (round-trip or one-way)
  const gasCost = effectiveMiles * rates.gasPerMile;
  const repairCost = effectiveMiles * rates.repairPerMile;
  const oilCost = effectiveMiles * rates.oilPerMile;
  const tireCost = effectiveMiles * rates.tirePerMile;
  const extraMileCost = effectiveMiles * rates.extraPerMile;

  // Total vehicle operating cost (gas + repairs + oil + tires + optional extra per-mile)
  const vehicleOperatingCost = gasCost + repairCost + oilCost + tireCost + extraMileCost;

  // True Net Pay = Gross Offer Pay - Total Vehicle Operating Cost
  const trueNetPay = grossPay - vehicleOperatingCost;

  // Optional flat per-order buffer & self-employment tax set-aside (kept separate from true operating cost)
  const extraOrderBuffer = s.extraBufferEnabled ? rates.extraPerOrder : 0;
  const taxSetAsidePct = s.taxSetAsideEnabled ? Math.min(100, safeNum(s.taxSetAsidePct, 0)) : 0;
  const taxSetAsideAmount = s.taxSetAsideEnabled && trueNetPay > 0
    ? trueNetPay * (taxSetAsidePct / 100)
    : 0;

  const takeHomeAfterOptional = trueNetPay - extraOrderBuffer - taxSetAsideAmount;

  // Efficiency metrics based on total driven miles
  const grossPerMile = effectiveMiles > 0 ? grossPay / effectiveMiles : 0;
  const netPerMile = effectiveMiles > 0 ? trueNetPay / effectiveMiles : 0;
  const netPerHour = hasMinutes ? (trueNetPay / (minutes / 60)) : null;
  const grossPerHour = hasMinutes ? (grossPay / (minutes / 60)) : null;

  // 2026 IRS Standard Mileage Deduction reference (NOT subtracted from cash net pay)
  const irsDeductionRef = effectiveMiles * rates.irsMileageRate;

  // Verdict evaluation
  const verdict = computeVerdict({
    hasValidOffer,
    trueNetPay,
    netPerMile,
    netPerHour,
    hasMinutes,
    settings: s
  });

  // Cost share percentages for visual breakdown bar
  const costTotal = vehicleOperatingCost > 0 ? vehicleOperatingCost : 1;
  const costShares = {
    gasPct: (gasCost / costTotal) * 100,
    repairPct: (repairCost / costTotal) * 100,
    oilPct: (oilCost / costTotal) * 100,
    tirePct: (tireCost / costTotal) * 100,
    extraPct: (extraMileCost / costTotal) * 100
  };

  return {
    hasValidOffer,
    hasMinutes,
    inputs: {
      grossPay,
      offerMiles,
      effectiveMiles,
      miles: effectiveMiles,
      roundTrip,
      minutes
    },
    rates,
    costs: {
      gasCost,
      repairCost,
      oilCost,
      tireCost,
      extraMileCost,
      vehicleOperatingCost,
      extraOrderBuffer,
      taxSetAsideAmount,
      taxSetAsidePct
    },
    costShares,
    grossPay,
    trueNetPay,
    takeHomeAfterOptional,
    grossPerMile,
    netPerMile,
    netPerHour,
    grossPerHour,
    irsDeductionRef,
    verdict
  };
}

/**
 * Determine Accept / Borderline / Decline verdict and human-readable rationale.
 */
function computeVerdict({ hasValidOffer, trueNetPay, netPerMile, netPerHour, hasMinutes, settings }) {
  if (!hasValidOffer) {
    return {
      code: 'idle',
      label: 'ENTER OFFER',
      reason: 'Type offer pay and trip miles for an instant verdict.'
    };
  }

  const acceptMi = safeNum(settings.acceptPerMile, DEFAULT_SETTINGS.acceptPerMile);
  const borderMi = safeNum(settings.borderlinePerMile, DEFAULT_SETTINGS.borderlinePerMile);
  const acceptHr = safeNum(settings.acceptPerHour, DEFAULT_SETTINGS.acceptPerHour);
  const borderHr = safeNum(settings.borderlinePerHour, DEFAULT_SETTINGS.borderlinePerHour);

  if (trueNetPay <= 0) {
    return {
      code: 'decline',
      label: 'DECLINE',
      reason: 'Negative net profit — operating costs exceed offer pay.'
    };
  }

  const mileTier = netPerMile >= acceptMi ? 2 : (netPerMile >= borderMi ? 1 : 0);

  if (!hasMinutes) {
    if (mileTier === 2) {
      return {
        code: 'accept',
        label: 'ACCEPT',
        reason: `Clears $${acceptMi.toFixed(2)}/mi net target.`
      };
    }
    if (mileTier === 1) {
      return {
        code: 'borderline',
        label: 'BORDERLINE',
        reason: `Between $${borderMi.toFixed(2)} and $${acceptMi.toFixed(2)}/mi — check traffic & wait time.`
      };
    }
    return {
      code: 'decline',
      label: 'DECLINE',
      reason: `Below $${borderMi.toFixed(2)}/mi minimum floor.`
    };
  }

  const hourTier = netPerHour >= acceptHr ? 2 : (netPerHour >= borderHr ? 1 : 0);
  const combinedTier = Math.min(mileTier, hourTier);

  if (combinedTier === 2) {
    return {
      code: 'accept',
      label: 'ACCEPT',
      reason: `Hits both $${acceptMi.toFixed(2)}/mi and $${acceptHr.toFixed(0)}/hr targets.`
    };
  }

  if (combinedTier === 1) {
    const bottleneck = mileTier < hourTier
      ? `$/mi is below $${acceptMi.toFixed(2)}`
      : (hourTier < mileTier
        ? `$/hr is below $${acceptHr.toFixed(0)}`
        : 'Both $/mi and $/hr are in the borderline zone');
    return {
      code: 'borderline',
      label: 'BORDERLINE',
      reason: `${bottleneck} — worth it only if slow or heading home.`
    };
  }

  const failReasons = [];
  if (mileTier === 0) failReasons.push(`under $${borderMi.toFixed(2)}/mi`);
  if (hourTier === 0) failReasons.push(`under $${borderHr.toFixed(0)}/hr`);
  return {
    code: 'decline',
    label: 'DECLINE',
    reason: `Falls short (${failReasons.join(' & ')}).`
  };
}

/**
 * Aggregate an array of logged order records into session totals.
 * @param {Array<object>} orders
 */
export function summarizeSession(orders = []) {
  const totals = {
    count: orders.length,
    grossPay: 0,
    vehicleOperatingCost: 0,
    trueNetPay: 0,
    totalMiles: 0,
    totalMinutes: 0,
    timedNetPay: 0,
    timedOrders: 0,
    irsDeductionRef: 0,
    gasCost: 0,
    maintenanceCost: 0
  };

  for (const o of orders) {
    totals.grossPay += safeNum(o.grossPay, 0);
    totals.vehicleOperatingCost += safeNum(o.vehicleOperatingCost, 0);
    totals.trueNetPay += Number.isFinite(o.trueNetPay) ? o.trueNetPay : 0;
    totals.totalMiles += safeNum(o.miles, 0);
    totals.irsDeductionRef += safeNum(o.irsDeductionRef, 0);
    totals.gasCost += safeNum(o.gasCost, 0);
    totals.maintenanceCost += safeNum(o.repairCost, 0) + safeNum(o.oilCost, 0) + safeNum(o.tireCost, 0);

    const mins = safeNum(o.minutes, 0);
    if (mins > 0) {
      totals.totalMinutes += mins;
      totals.timedNetPay += Number.isFinite(o.trueNetPay) ? o.trueNetPay : 0;
      totals.timedOrders += 1;
    }
  }

  const avgNetPerMile = totals.totalMiles > 0 ? totals.trueNetPay / totals.totalMiles : 0;
  const avgNetPerHour = totals.totalMinutes > 0 ? totals.timedNetPay / (totals.totalMinutes / 60) : null;

  return {
    ...totals,
    avgNetPerMile,
    avgNetPerHour
  };
}

/**
 * Convert a Date or ISO string into a local calendar date key (YYYY-MM-DD).
 * Ensures daily sessions roll over at local midnight (12:00 AM).
 * @param {Date|string|number} [dateInput]
 * @returns {string}
 */
export function toLocalDateKey(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse a YYYY-MM-DD key into a local Date at 00:00:00 (avoids UTC offset shifts).
 * @param {string} dateKey
 * @returns {Date|null}
 */
export function parseLocalDateKey(dateKey) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Resolve the local session date key (YYYY-MM-DD) for an order record.
 * Supports both new orders (with explicit sessionDate) and legacy orders.
 * @param {object} order
 * @returns {string}
 */
export function getOrderDateKey(order) {
  if (order?.sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(order.sessionDate)) {
    return order.sessionDate;
  }
  return toLocalDateKey(order?.timestamp);
}

/**
 * Return Sunday-to-Saturday week bounds for a local YYYY-MM-DD date key.
 * @param {string} dateKey
 */
export function getWeekBounds(dateKey) {
  const d = parseLocalDateKey(dateKey);
  if (!d) return { weekStartKey: '', weekEndKey: '' };
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return {
    weekStartKey: toLocalDateKey(start),
    weekEndKey: toLocalDateKey(end)
  };
}

/**
 * Format a local YYYY-MM-DD date key into a short human-readable label.
 * @param {string} dateKey
 * @param {string} [todayKey]
 */
export function formatDateKeyLabel(dateKey, todayKey = toLocalDateKey()) {
  const d = parseLocalDateKey(dateKey);
  if (!d) return dateKey || 'Unknown Date';
  const base = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  if (dateKey === todayKey) {
    const short = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return `Today · ${short}`;
  }
  return base;
}

/**
 * Format a YYYY-MM month key into "November 2026".
 * @param {string} monthKey
 */
export function formatMonthKeyLabel(monthKey) {
  if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * Format a start/end YYYY-MM-DD pair into a concise week range label.
 * @param {string} startKey
 * @param {string} endKey
 */
export function formatRangeLabel(startKey, endKey) {
  const s = parseLocalDateKey(startKey);
  const e = parseLocalDateKey(endKey);
  if (!s || !e) return `${startKey} – ${endKey}`;
  if (startKey === endKey) {
    return s.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  const sFmt = s.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  });
  const eFmt = e.toLocaleDateString(undefined, {
    ...(sameMonth ? {} : { month: 'short' }),
    day: 'numeric',
    year: 'numeric'
  });
  return `${sFmt} – ${eFmt}`;
}

/**
 * Filter orders whose local session date falls inclusively within [startKey, endKey].
 * @param {Array<object>} orders
 * @param {string|null} startKey
 * @param {string|null} endKey
 */
export function filterOrdersByDateRange(orders = [], startKey = null, endKey = null) {
  return orders.filter((o) => {
    const k = getOrderDateKey(o);
    if (!k) return false;
    if (startKey && k < startKey) return false;
    if (endKey && k > endKey) return false;
    return true;
  });
}

/**
 * Build a sorted, collapsible tree of sessions for the requested view mode.
 *   - 'daily'   -> [Day -> Orders]
 *   - 'weekly'  -> [Week -> Day -> Orders]
 *   - 'monthly' -> [Month -> Week (clamped to month) -> Day -> Orders]
 *   - 'yearly'  -> [Year -> Month -> Week (clamped to month) -> Day -> Orders]
 *
 * Every node includes { id, level, label, sublabel, startKey, endKey, dayCount, summary, orders, children }.
 *
 * @param {Array<object>} orders
 * @param {'daily'|'weekly'|'monthly'|'yearly'} [viewMode='daily']
 * @param {string} [todayKey]
 */
export function groupOrdersHierarchy(orders = [], viewMode = 'daily', todayKey = toLocalDateKey()) {
  const byDay = new Map();
  for (const o of orders) {
    const dayKey = getOrderDateKey(o);
    if (!dayKey) continue;
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(o);
  }

  // Sort orders within each day newest-first
  for (const list of byDay.values()) {
    list.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  }

  const sortedDayKeys = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a));

  const makeDayNode = (dayKey, idPrefix = '') => {
    const dayOrders = byDay.get(dayKey) || [];
    const summary = summarizeSession(dayOrders);
    return {
      id: `${idPrefix}day:${dayKey}`,
      level: 'day',
      label: formatDateKeyLabel(dayKey, todayKey),
      sublabel: dayKey === todayKey ? 'Active session · ends 12:00 AM' : 'Ended 12:00 AM',
      startKey: dayKey,
      endKey: dayKey,
      dayCount: 1,
      isToday: dayKey === todayKey,
      summary,
      orders: dayOrders,
      children: []
    };
  };

  if (viewMode === 'daily') {
    return sortedDayKeys.map((dk) => makeDayNode(dk));
  }

  const buildWeekNodes = (dayKeys, clampStart = null, clampEnd = null, idPrefix = '') => {
    const byWeek = new Map();
    for (const dk of dayKeys) {
      const { weekStartKey, weekEndKey } = getWeekBounds(dk);
      const effStart = clampStart && weekStartKey < clampStart ? clampStart : weekStartKey;
      const effEnd = clampEnd && weekEndKey > clampEnd ? clampEnd : weekEndKey;
      const wKey = `${effStart}_${effEnd}`;
      if (!byWeek.has(wKey)) {
        byWeek.set(wKey, { startKey: effStart, endKey: effEnd, dayKeys: [] });
      }
      byWeek.get(wKey).dayKeys.push(dk);
    }

    return Array.from(byWeek.values())
      .sort((a, b) => b.startKey.localeCompare(a.startKey))
      .map((w) => {
        const children = w.dayKeys
          .sort((a, b) => b.localeCompare(a))
          .map((dk) => makeDayNode(dk, `${idPrefix}w:${w.startKey}|`));
        const allOrders = children.flatMap((c) => c.orders);
        return {
          id: `${idPrefix}week:${w.startKey}_${w.endKey}`,
          level: 'week',
          label: `Week · ${formatRangeLabel(w.startKey, w.endKey)}`,
          sublabel: `${children.length} ${children.length === 1 ? 'day' : 'days'}`,
          startKey: w.startKey,
          endKey: w.endKey,
          dayCount: children.length,
          summary: summarizeSession(allOrders),
          orders: allOrders,
          children
        };
      });
  };

  if (viewMode === 'weekly') {
    return buildWeekNodes(sortedDayKeys);
  }

  const buildMonthNodes = (dayKeys, idPrefix = '') => {
    const byMonth = new Map();
    for (const dk of dayKeys) {
      const mKey = dk.slice(0, 7);
      if (!byMonth.has(mKey)) byMonth.set(mKey, []);
      byMonth.get(mKey).push(dk);
    }

    return Array.from(byMonth.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mKey, mDays]) => {
        const [y, m] = mKey.split('-').map(Number);
        const monthStart = `${mKey}-01`;
        const monthEnd = toLocalDateKey(new Date(y, m, 0));
        const children = buildWeekNodes(mDays, monthStart, monthEnd, `${idPrefix}m:${mKey}|`);
        const allOrders = children.flatMap((c) => c.orders);
        return {
          id: `${idPrefix}month:${mKey}`,
          level: 'month',
          label: formatMonthKeyLabel(mKey),
          sublabel: `${mDays.length} ${mDays.length === 1 ? 'day' : 'days'}`,
          startKey: monthStart,
          endKey: monthEnd,
          dayCount: mDays.length,
          summary: summarizeSession(allOrders),
          orders: allOrders,
          children
        };
      });
  };

  if (viewMode === 'monthly') {
    return buildMonthNodes(sortedDayKeys);
  }

  // 'yearly'
  const byYear = new Map();
  for (const dk of sortedDayKeys) {
    const yKey = dk.slice(0, 4);
    if (!byYear.has(yKey)) byYear.set(yKey, []);
    byYear.get(yKey).push(dk);
  }

  return Array.from(byYear.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([yKey, yDays]) => {
      const children = buildMonthNodes(yDays, `y:${yKey}|`);
      const allOrders = children.flatMap((c) => c.orders);
      return {
        id: `year:${yKey}`,
        level: 'year',
        label: `${yKey} Tax Year`,
        sublabel: `${children.length} ${children.length === 1 ? 'month' : 'months'} · ${yDays.length} ${yDays.length === 1 ? 'day' : 'days'}`,
        startKey: `${yKey}-01-01`,
        endKey: `${yKey}-12-31`,
        dayCount: yDays.length,
        summary: summarizeSession(allOrders),
        orders: allOrders,
        children
      };
    });
}

function escapeCSVCell(val) {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert logged orders to a clean RFC-4180 CSV string for spreadsheet / tax export.
 * @param {Array<object>} orders
 * @returns {string}
 */
export function ordersToCSV(orders = []) {
  const headers = [
    'Session Date',
    'Local Time',
    'Timestamp (ISO)',
    'Platform',
    'Verdict',
    'Gross Pay ($)',
    'Offer Miles',
    'Trip Type',
    'Driven Miles',
    'Est. Mins',
    'Gas Cost ($)',
    'Repair Reserve ($)',
    'Oil Reserve ($)',
    'Tire Wear ($)',
    'Extra Per-Mile ($)',
    'Total Operating Cost ($)',
    'True Net Pay ($)',
    'Net $/Mile',
    'Net $/Hour',
    'IRS Mileage Ref ($)',
    'Notes'
  ];

  const rows = orders.map((o) => {
    const drivenMiles = o.effectiveMiles ?? o.miles ?? 0;
    const offerMiles = o.offerMiles ?? (o.roundTrip ? drivenMiles / 2 : drivenMiles);
    const tripType = o.roundTrip ? 'Round Trip (2x)' : 'One-Way (1x)';
    const sessionDate = getOrderDateKey(o);
    let localTime = '';
    if (o.timestamp) {
      const d = new Date(o.timestamp);
      if (!Number.isNaN(d.getTime())) {
        localTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }

    return [
      sessionDate,
      localTime,
      o.timestamp || '',
      o.platform || '',
      (o.verdict || '').toUpperCase(),
      (o.grossPay ?? 0).toFixed(2),
      offerMiles.toFixed(2),
      tripType,
      drivenMiles.toFixed(2),
      o.minutes ? String(o.minutes) : '',
      (o.gasCost ?? 0).toFixed(2),
      (o.repairCost ?? 0).toFixed(2),
      (o.oilCost ?? 0).toFixed(2),
      (o.tireCost ?? 0).toFixed(2),
      (o.extraMileCost ?? 0).toFixed(2),
      (o.vehicleOperatingCost ?? 0).toFixed(2),
      (o.trueNetPay ?? 0).toFixed(2),
      (o.netPerMile ?? 0).toFixed(2),
      o.netPerHour !== null && o.netPerHour !== undefined ? o.netPerHour.toFixed(2) : '',
      (o.irsDeductionRef ?? 0).toFixed(2),
      o.notes || ''
    ].map(escapeCSVCell).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Convert orders in a timeframe into a tax-ready Daily Summary CSV with a TOTAL row.
 * @param {Array<object>} orders
 * @returns {string}
 */
export function dailySummaryToCSV(orders = []) {
  const headers = [
    'Session Date',
    'Orders',
    'Driven Miles',
    'Timed Mins',
    'Gross Income ($)',
    'Gas Cost ($)',
    'Maintenance Reserve ($)',
    'Total Vehicle Cost ($)',
    'True Net Profit ($)',
    'Avg Net $/Mile',
    'Avg Net $/Hour',
    'IRS Mileage Deduction Ref ($)'
  ];

  const dayNodes = groupOrdersHierarchy(orders, 'daily').reverse(); // chronological for tax ledger
  const rows = dayNodes.map((day) => {
    const s = day.summary;
    return [
      day.startKey,
      String(s.count),
      s.totalMiles.toFixed(2),
      s.totalMinutes > 0 ? String(s.totalMinutes) : '',
      s.grossPay.toFixed(2),
      s.gasCost.toFixed(2),
      s.maintenanceCost.toFixed(2),
      s.vehicleOperatingCost.toFixed(2),
      s.trueNetPay.toFixed(2),
      s.totalMiles > 0 ? s.avgNetPerMile.toFixed(2) : '',
      s.avgNetPerHour !== null ? s.avgNetPerHour.toFixed(2) : '',
      s.irsDeductionRef.toFixed(2)
    ].map(escapeCSVCell).join(',');
  });

  const grand = summarizeSession(orders);
  const totalRow = [
    'TOTAL',
    String(grand.count),
    grand.totalMiles.toFixed(2),
    grand.totalMinutes > 0 ? String(grand.totalMinutes) : '',
    grand.grossPay.toFixed(2),
    grand.gasCost.toFixed(2),
    grand.maintenanceCost.toFixed(2),
    grand.vehicleOperatingCost.toFixed(2),
    grand.trueNetPay.toFixed(2),
    grand.totalMiles > 0 ? grand.avgNetPerMile.toFixed(2) : '',
    grand.avgNetPerHour !== null ? grand.avgNetPerHour.toFixed(2) : '',
    grand.irsDeductionRef.toFixed(2)
  ].map(escapeCSVCell).join(',');

  return [headers.join(','), ...rows, totalRow].join('\n');
}

/**
 * Currency formatter helper ($12.34 or -$1.20)
 */
export function formatCurrency(amount) {
  if (!Number.isFinite(amount)) return '$0.00';
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}
