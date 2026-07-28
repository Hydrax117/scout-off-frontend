export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ContractPausedError extends Error {
  constructor() {
    super('ContractPaused');
    this.name = 'ContractPausedError';
  }
}

/**
 * Thrown when the deployed contract's self-reported interface version does
 * not match the version this frontend build was written against. See the
 * "Contract Version Compatibility" section in DEVELOPMENT.md for how this
 * is checked and what to do when it fires after a contract migration.
 */
export class ContractIncompatibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractIncompatibleError';
  }
}
