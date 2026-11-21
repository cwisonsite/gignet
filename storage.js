/**
 * storage.js — Persistent localStorage Adapter
 *
 * Isolates all browser storage reads/writes behind a tiny interface so it can
 * later be swapped or synced with IndexedDB, Android SharedPreferences, or
 * Google Drive without touching calculator or UI logic.
 */

import { DEFAULT_SETTINGS } from './calculator.js';

const KEYS = {
  SETTINGS: 'gignet_settings_v1',
  ORDERS: 'gignet_orders_v1',
  THEME: 'gignet_theme_v1',
  HISTORY_VIEW: 'gignet_history_view_v1'
};

function safeRead(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings() {
  const saved = safeRead(KEYS.SETTINGS, null);
  return saved && typeof saved === 'object'
    ? { ...DEFAULT_SETTINGS, ...saved }
    : { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings) {
  return safeWrite(KEYS.SETTINGS, settings);
}

export function loadOrders() {
  const saved = safeRead(KEYS.ORDERS, []);
  return Array.isArray(saved) ? saved : [];
}

export function saveOrders(orders) {
  return safeWrite(KEYS.ORDERS, orders);
}

export function loadTheme() {
  try {
    const saved = window.localStorage.getItem(KEYS.THEME);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore storage errors
  }
  return 'dark';
}

export function saveTheme(theme) {
  try {
    window.localStorage.setItem(KEYS.THEME, theme);
  } catch {
    // ignore storage errors
  }
}

const VALID_VIEWS = new Set(['daily', 'weekly', 'monthly', 'yearly']);

export function loadHistoryView() {
  try {
    const saved = window.localStorage.getItem(KEYS.HISTORY_VIEW);
    if (VALID_VIEWS.has(saved)) return saved;
  } catch {
    // ignore storage errors
  }
  return 'daily';
}

export function saveHistoryView(view) {
  if (!VALID_VIEWS.has(view)) return;
  try {
    window.localStorage.setItem(KEYS.HISTORY_VIEW, view);
  } catch {
    // ignore storage errors
  }
}
