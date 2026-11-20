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
 * Convert logged orders to a clean RFC-4180 CSV string for spreadsheet export.
 * @param {Array<object>} orders
 * @returns {string}
 */
export function ordersToCSV(orders = []) {
  const headers = [
    'Timestamp',
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

  const escapeCell = (val) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = orders.map((o) => {
    const drivenMiles = o.effectiveMiles ?? o.miles ?? 0;
    const offerMiles = o.offerMiles ?? (o.roundTrip ? drivenMiles / 2 : drivenMiles);
    const tripType = o.roundTrip ? 'Round Trip (2x)' : 'One-Way (1x)';

    return [
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
    ].map(escapeCell).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Currency formatter helper ($12.34 or -$1.20)
 */
export function formatCurrency(amount) {
  if (!Number.isFinite(amount)) return '$0.00';
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}
