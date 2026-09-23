/**
 * BFA Centralized Currency Formatter
 * Standardizes Nigerian Naira (₦ / NGN) formatting across the application.
 */

export const DEFAULT_CURRENCY = 'NGN';
export const CURRENCY_SYMBOL = '₦';
export const CURRENCY_LOCALE = 'en-NG';

/**
 * Format a numeric amount as Nigerian Naira (e.g. ₦250,000.00)
 * @param {number|string} amount - The numeric monetary value
 * @param {object} options
 * @param {boolean} options.showDecimals - Whether to show 2 decimal places (default: true)
 * @param {boolean} options.showSymbol - Whether to prefix with ₦ (default: true)
 * @param {boolean} options.useCode - Whether to suffix/prefix with NGN code instead of ₦
 * @returns {string} Formatted currency string
 */
export function formatNaira(amount, { showDecimals = true, showSymbol = true, useCode = false } = {}) {
  if (amount === null || amount === undefined || amount === '' || isNaN(Number(amount))) {
    const zeroVal = showDecimals ? '0.00' : '0';
    if (useCode) return `NGN ${zeroVal}`;
    return showSymbol ? `₦${zeroVal}` : zeroVal;
  }

  const num = Number(amount);
  const formatted = new Intl.NumberFormat(CURRENCY_LOCALE, {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(num);

  if (useCode) {
    return `NGN ${formatted}`;
  }

  return showSymbol ? `₦${formatted}` : formatted;
}

export const formatCurrency = formatNaira;

export default formatNaira;
