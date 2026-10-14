import { describe, it, expect } from 'vitest';
import pkg from '../src/security/secretScanner.js';

const { scanAndRedact } = pkg;

describe('scanAndRedact', () => {
  it('redacts an AWS access key', () => {
    const code = `const key = "AKIAIOSFODNN7EXAMPLE";`;
    const { redactedCode, hasSecrets, findings } = scanAndRedact(code);

    expect(hasSecrets).toBe(true);
    expect(redactedCode).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(redactedCode).toContain('[REDACTED_SECRET]');
    expect(findings.some((f) => f.name === 'AWS Access Key')).toBe(true);
  });

  it('redacts a private key block', () => {
    const code = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEpAIBAAKCAQEA1234567890abcdef',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');

    const { redactedCode, hasSecrets } = scanAndRedact(code);

    expect(hasSecrets).toBe(true);
    expect(redactedCode).not.toContain('MIIEpAIBAAKCAQEA1234567890abcdef');
  });

  it('redacts a GitHub token', () => {
    const code = `const token = "ghp_${'a'.repeat(36)}";`;
    const { hasSecrets, findings } = scanAndRedact(code);

    expect(hasSecrets).toBe(true);
    expect(findings.some((f) => f.name === 'GitHub Token')).toBe(true);
  });

  it('does not flag ordinary source code', () => {
    const code = `function add(a, b) {\n  return a + b;\n}`;
    const { hasSecrets, redactedCode } = scanAndRedact(code);

    expect(hasSecrets).toBe(false);
    expect(redactedCode).toBe(code);
  });

  it('never leaks the raw secret value into findings metadata', () => {
    const code = `const key = "AKIAIOSFODNN7EXAMPLE";`;
    const { findings } = scanAndRedact(code);

    const serialized = JSON.stringify(findings);
    expect(serialized).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });
});
