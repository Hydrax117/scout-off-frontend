/**
 * Server-side runtime configuration validation.
 *
 * These checks run at request time (not build time), so they catch
 * misconfigurations that slip past the build-time `scripts/validate-env.js`
 * check — for example when an env var is set in `.env.local` but not in the
 * production hosting platform.
 */

export interface ConfigWarning {
  key: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Checks all critical environment variables and returns any warnings.
 *
 * Intended to be called once per request in the root layout and the result
 * passed down to a client-side banner component.
 */
export function validateConfig(): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  // ── NEXT_PUBLIC_CONTRACT_ID ──────────────────────────────────────────────
  const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
  if (!contractId || contractId.trim() === '') {
    warnings.push({
      key: 'NEXT_PUBLIC_CONTRACT_ID',
      message:
        'NEXT_PUBLIC_CONTRACT_ID is not set. The Soroban contract ID must be ' +
        'configured before any on-chain operations will work. Set it in your ' +
        'hosting environment or .env.local file.',
      severity: 'error',
    });
  }

  return warnings;
}

/**
 * Returns true when all critical configuration values are present and valid.
 */
export function isConfigValid(): boolean {
  return validateConfig().length === 0;
}
