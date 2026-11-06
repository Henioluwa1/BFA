const pool = require('../db/pool');

async function seedBankSettings() {
  const bankSettings = [
    { category: 'banking', key: 'bank_name', val: 'Zenith Bank PLC', desc: 'Official BFA Corporate Bank' },
    { category: 'banking', key: 'account_name', val: 'BFA Serviced Luxury Apartments Ltd', desc: 'BFA Settlement Account Name' },
    { category: 'banking', key: 'account_number', val: '1018273645', desc: 'Official NGN Settlement Account Number' },
    { category: 'banking', key: 'transfer_instructions', val: 'Please include your Booking Reference or Guest Name as the payment narration. Once transfer is completed, upload your receipt screenshot or PDF for front desk verification.', desc: 'Guest bank transfer guidance' },
  ];

  for (const s of bankSettings) {
    const existing = await pool.query('SELECT id FROM system_settings WHERE setting_key = ?', [s.key]);
    if (!existing || existing.length === 0) {
      await pool.query(
        'INSERT INTO system_settings (category, setting_key, setting_value, description) VALUES (?, ?, ?, ?)',
        [s.category, s.key, s.val, s.desc]
      );
    }
  }
}

if (require.main === module) {
  seedBankSettings()
    .then(() => {
      console.log('Bank settings successfully configured.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to configure bank settings:', err);
      process.exit(1);
    });
}

module.exports = seedBankSettings;

