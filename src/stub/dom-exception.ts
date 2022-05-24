/// <reference types="node" />
import { globals } from '../globals';

interface DOMException extends Error {
  name: string;
  message: string;
}

type DOMExceptionConstructor = new (message?: string, name?: string) => DOMException;

function isDOMExceptionConstructor(ctor: unknown): ctor is DOMExceptionConstructor {
  if (!(typeof ctor === 'function' || typeof ctor === 'object')) {
    return false;
  }
  try {
    new (ctor as DOMExceptionConstructor)();
    return true;
  } catch {
    return false;
  }
}

// - Web browsers
// - Node 18 and higher (https://github.com/nodejs/node/commit/e4b1fb5e6422c1ff151234bb9de792d45dd88d87)
function getFromGlobal(): DOMExceptionConstructor | undefined {
  const ctor = globals?.DOMException;
  return isDOMExceptionConstructor(ctor) ? ctor : undefined;
}

// - Other platforms
function createPolyfill(): DOMExceptionConstructor {
  // eslint-disable-next-line no-shadow
  const ctor = function DOMException(this: DOMException, message?: string, name?: string) {
    this.message = message || '';
    this.name = name || 'Error';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  } as any;
  ctor.prototype = Object.create(Error.prototype);
  Object.defineProperty(ctor.prototype, 'constructor', { value: ctor, writable: true, configurable: true });
  return ctor;
}

// eslint-disable-next-line no-redeclare
const DOMException: DOMExceptionConstructor = getFromGlobal() || createPolyfill();

export { DOMException };
