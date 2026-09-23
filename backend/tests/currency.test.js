const { formatNaira, DEFAULT_CURRENCY, CURRENCY_SYMBOL } = require('../src/utils/currency');

describe('Currency Formatter Utility Tests (Section 19, 20, 27)', () => {
  it('should format 250000 into ₦250,000.00 by default', () => {
    const formatted = formatNaira(250000);
    expect(formatted).toBe('₦250,000.00');
  });

  it('should format large amounts such as 1500000 into ₦1,500,000.00', () => {
    const formatted = formatNaira(1500000);
    expect(formatted).toBe('₦1,500,000.00');
  });

  it('should handle zero amounts gracefully', () => {
    expect(formatNaira(0)).toBe('₦0.00');
    expect(formatNaira('0')).toBe('₦0.00');
  });

  it('should handle null, undefined, and empty string without throwing', () => {
    expect(formatNaira(null)).toBe('₦0.00');
    expect(formatNaira(undefined)).toBe('₦0.00');
    expect(formatNaira('')).toBe('₦0.00');
  });

  it('should support disabling decimal precision when requested', () => {
    const formatted = formatNaira(250000, { showDecimals: false });
    expect(formatted).toBe('₦250,000');
  });

  it('should support disabling currency symbol', () => {
    const formatted = formatNaira(250000, { showSymbol: false });
    expect(formatted).toBe('250,000.00');
  });

  it('should support useCode option to render NGN code', () => {
    const formatted = formatNaira(250000, { useCode: true });
    expect(formatted).toBe('NGN 250,000.00');
  });

  it('should verify global default currency constants', () => {
    expect(DEFAULT_CURRENCY).toBe('NGN');
    expect(CURRENCY_SYMBOL).toBe('₦');
  });
});
