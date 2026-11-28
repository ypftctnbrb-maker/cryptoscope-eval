import { X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const candidateRoot = 'A6:37:9E:7C:EC:C0:5F:AA:3C:BF:07:60:13:D7:45:E3:27:BB:BA:A3:8C:0B:9A:F2:24:69:D4:70:1D:18:AA:BC';

export function enforceAnchorWindow(time, uncertaintyMs, earliest, deadline) {
  if (![time, uncertaintyMs, earliest, deadline].every(Number.isSafeInteger) ||
      uncertaintyMs < 0 || time - uncertaintyMs < earliest || time + uncertaintyMs >= deadline) {
    throw new Error('Timestamp uncertainty overlaps boundary');
  }
}

export function verifyFreeTsaCandidate({ query, response, root, expectedDigest, earliest, deadline }) {
  if (new X509Certificate(root).fingerprint256 !== candidateRoot ||
      (String(root).match(/-----BEGIN CERTIFICATE-----/g) ?? []).length !== 1) {
    throw new Error('Unrecognized fixture root');
  }
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) throw new Error('Expected SHA-256 digest required');
  const dir = mkdtempSync(join(tmpdir(), 'g0-rfc3161-'));
  const run = args => execFileSync('openssl', ['ts', ...args], {
    cwd: dir, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, LC_ALL: 'C', SSL_CERT_FILE: join(dir, 'root.pem'), SSL_CERT_DIR: dir },
  });
  try {
    writeFileSync(join(dir, 'query.der'), query);
    writeFileSync(join(dir, 'response.der'), response);
    writeFileSync(join(dir, 'root.pem'), root);
    const request = run(['-query', '-in', 'query.der', '-text']);
    if (!/^Hash Algorithm: sha256$/m.test(request) || !/^Nonce: 0x[0-9A-F]+$/im.test(request)) {
      throw new Error('SHA-256 query with nonce required');
    }
    const verify = ['-verify', '-in', 'response.der', '-CAfile', 'root.pem', '-CApath', dir];
    run([...verify, '-queryfile', 'query.der']);
    run([...verify, '-digest', expectedDigest]);
    const token = run(['-reply', '-in', 'response.der', '-text']);
    const time = Date.parse(token.match(/^Time stamp: (.+) GMT$/m)?.[1] + ' GMT');
    const accuracy = token.match(/^Accuracy: (0x[0-9a-f]+|unspecified) seconds, (0x[0-9a-f]+|unspecified) millis, (0x[0-9a-f]+|unspecified) micros$/im);
    if (!accuracy || accuracy.slice(1).every(value => value === 'unspecified')) {
      throw new Error('Timestamp accuracy missing or unsupported');
    }
    const [seconds, millis, micros] = accuracy.slice(1).map(value => value === 'unspecified' ? 0 : Number(value));
    if (millis > 999 || micros > 999) throw new Error('Invalid timestamp accuracy');
    // Include a millisecond for OpenSSL text / JS fractional-second precision.
    const uncertaintyMs = seconds * 1000 + millis + Math.ceil(micros / 1000) + 1;
    enforceAnchorWindow(time, uncertaintyMs, earliest, deadline);
    return { time, uncertaintyMs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
