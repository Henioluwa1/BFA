const { ValidationError } = require('../../core/errors/apiError');

/**
 * Exact Decimal Arithmetic Engine using Minor Units (Cents/Kobo) as BigInt
 * Eliminates IEEE 754 binary floating-point drift, ensuring mathematical
 * consistency between the application and MariaDB DECIMAL(15, 2) columns.
 */

// Maximum supported by DECIMAL(15, 2): 999,999,999,999.99 (13 integer digits, 2 decimals)
const MAX_CENTS = 99999999999999n;

/**
 * Converts monetary value (number, numeric string, or bigint) to BigInt minor units.
 * Validates that precision does not exceed 2 decimal places and does not exceed DECIMAL(15,2) limit.
 * @param {string|number|bigint} val
 * @param {string} fieldName - context for error message
 * @returns {bigint} Minor units (kobo/cents)
 */
function toMinorUnits(val, fieldName = 'Amount') {
  if (val === null || val === undefined || val === '') {
    return 0n;
  }

  if (typeof val === 'bigint') {
    if (val > MAX_CENTS || val < -MAX_CENTS) {
      throw new ValidationError(`${fieldName} exceeds maximum allowable financial limit (999,999,999,999.99).`);
    }
    return val;
  }

  const str = String(val).trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new ValidationError(`${fieldName} must be a valid numeric amount, received '${val}'.`);
  }

  const isNegative = str.startsWith('-');
  const cleanStr = isNegative ? str.slice(1) : str;
  const [intPart, decPart = ''] = cleanStr.split('.');

  // Precision check: reject extra non-zero fractional digits beyond 2 decimal places
  if (decPart.length > 2) {
    if (/[1-9]/.test(decPart.slice(2))) {
      throw new ValidationError(
        `${fieldName} '${val}' exceeds maximum precision of 2 decimal places (fractional cents/kobo not permitted).`
      );
    }
  }

  const paddedDec = decPart.padEnd(2, '0').slice(0, 2);
  const cents = BigInt(intPart) * 100n + BigInt(paddedDec);

  if (cents > MAX_CENTS) {
    throw new ValidationError(`${fieldName} exceeds maximum allowable financial limit (999,999,999,999.99).`);
  }

  return isNegative ? -cents : cents;
}

/**
 * Converts BigInt minor units back to an exact 2-decimal string representation.
 * @param {bigint} cents
 * @returns {string} e.g. "15000.50" or "-500.00"
 */
function fromMinorUnits(cents) {
  const isNegative = cents < 0n;
  const abs = isNegative ? -cents : cents;
  const intPart = abs / 100n;
  const decPart = abs % 100n;
  const formatted = `${intPart.toString()}.${decPart.toString().padStart(2, '0')}`;
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Returns exact floating number for standard JSON response serialization.
 * @param {bigint} cents
 * @returns {number}
 */
function toDecimalNumber(cents) {
  return Number(fromMinorUnits(cents));
}

/**
 * Sums an array of items by extracting minor units.
 * @param {Array} items
 * @param {Function} extractor
 * @returns {bigint}
 */
function sumMinorUnits(items, extractor = (x) => x) {
  let total = 0n;
  for (let i = 0; i < items.length; i++) {
    const val = extractor(items[i], i);
    total += typeof val === 'bigint' ? val : toMinorUnits(val);
  }
  return total;
}

module.exports = {
  MAX_CENTS,
  toMinorUnits,
  fromMinorUnits,
  toDecimalNumber,
  sumMinorUnits,
};
