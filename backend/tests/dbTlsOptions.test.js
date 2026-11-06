const fs = require('fs');
const os = require('os');
const path = require('path');
const { getTlsOptions } = require('../src/db/tlsOptions');

describe('database TLS options', () => {
  const ca = '-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----';

  test('enables verified TLS with PEM CA content', () => {
    expect(getTlsOptions({ enabled: true, ca })).toEqual({
      ssl: { ca, rejectUnauthorized: true },
    });
  });

  test('reads CA certificate from a file', () => {
    const caPath = path.join(os.tmpdir(), `bfa-tidb-ca-${process.pid}.pem`);
    fs.writeFileSync(caPath, ca);
    try {
      expect(getTlsOptions({ enabled: true, caPath })).toEqual({
        ssl: { ca, rejectUnauthorized: true },
      });
    } finally {
      fs.unlinkSync(caPath);
    }
  });

  test('fails clearly when TLS is enabled without a CA', () => {
    expect(() => getTlsOptions({ enabled: true })).toThrow('Set DB_TLS_CA or DB_TLS_CA_PATH');
  });

  test('fails clearly when the CA file is unreadable or missing', () => {
    expect(() => getTlsOptions({ enabled: true, caPath: path.join(os.tmpdir(), 'missing-bfa-ca.pem') }))
      .toThrow('DB_TLS_CA_PATH could not be read');
  });

  test('keeps local non-TLS defaults unchanged', () => {
    expect(getTlsOptions({ enabled: false })).toBeUndefined();
  });
});
