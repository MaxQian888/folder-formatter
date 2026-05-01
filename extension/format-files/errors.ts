export class OperationAborted extends Error {
  constructor(message = 'Operation aborted') {
    super(message);
    this.name = 'OperationAborted';
  }

  toString(): string {
    return 'OperationAborted';
  }
}

export function isOperationAborted(err: unknown): err is OperationAborted {
  return err instanceof OperationAborted;
}
