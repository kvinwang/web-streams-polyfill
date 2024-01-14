import { reflectCall } from 'lib/helpers/webidl';
import { typeIsObject } from '../helpers/miscellaneous';
import assert from '../../stub/assert';

declare global {
  interface ArrayBuffer {
    readonly detached: boolean;

    transfer(): ArrayBuffer;
  }

  function structuredClone<T>(value: T, options: { transfer: ArrayBuffer[] }): T;
}

export function CreateArrayFromList<T extends any[]>(elements: T): T {
  // We use arrays to represent lists, so this is basically a no-op.
  // Do a slice though just in case we happen to depend on the unique-ness.
  return elements.slice() as T;
}

export function CopyDataBlockBytes(dest: ArrayBuffer,
                                   destOffset: number,
                                   src: ArrayBuffer,
                                   srcOffset: number,
                                   n: number) {
  new Uint8Array(dest).set(new Uint8Array(src, srcOffset, n), destOffset);
}

export let TransferArrayBuffer = (O: ArrayBuffer): ArrayBuffer => {
  if (typeof O.transfer === 'function') {
    TransferArrayBuffer = buffer => buffer.transfer();
  } else if (typeof structuredClone === 'function') {
    TransferArrayBuffer = buffer => structuredClone(buffer, { transfer: [buffer] });
  } else {
    // Not implemented correctly
    TransferArrayBuffer = buffer => buffer;
  }
  return TransferArrayBuffer(O);
};

export function CanTransferArrayBuffer(O: ArrayBuffer): boolean {
  return !IsDetachedBuffer(O);
}

export let IsDetachedBuffer = (O: ArrayBuffer): boolean => {
  if (typeof O.detached === 'boolean') {
    IsDetachedBuffer = buffer => buffer.detached;
  } else {
    // Not implemented correctly
    IsDetachedBuffer = buffer => buffer.byteLength === 0;
  }
  return IsDetachedBuffer(O);
};

export function ArrayBufferSlice(buffer: ArrayBuffer, begin: number, end: number): ArrayBuffer {
  // ArrayBuffer.prototype.slice is not available on IE10
  // https://www.caniuse.com/mdn-javascript_builtins_arraybuffer_slice
  if (buffer.slice) {
    return buffer.slice(begin, end);
  }
  const length = end - begin;
  const slice = new ArrayBuffer(length);
  CopyDataBlockBytes(slice, 0, buffer, begin, length);
  return slice;
}

export type MethodName<T> = {
  [P in keyof T]: T[P] extends Function | undefined ? P : never;
}[keyof T];

export function GetMethod<T, K extends MethodName<T>>(receiver: T, prop: K): T[K] | undefined {
  const func = receiver[prop];
  if (func === undefined || func === null) {
    return undefined;
  }
  if (typeof func !== 'function') {
    throw new TypeError(`${String(prop)} is not a function`);
  }
  return func;
}

export interface SyncIteratorRecord<T> {
  iterator: Iterator<T>,
  nextMethod: Iterator<T>['next'],
  done: boolean;
}

export interface AsyncIteratorRecord<T> {
  iterator: AsyncIterator<T>,
  nextMethod: AsyncIterator<T>['next'],
  done: boolean;
}

export type SyncOrAsyncIteratorRecord<T> = SyncIteratorRecord<T> | AsyncIteratorRecord<T>;

export function CreateAsyncFromSyncIterator<T>(syncIteratorRecord: SyncIteratorRecord<T>): AsyncIteratorRecord<T> {
  // Instead of re-implementing CreateAsyncFromSyncIterator and %AsyncFromSyncIteratorPrototype%,
  // we use yield* inside an async generator function to achieve the same result.

  // Wrap the sync iterator inside a sync iterable, so we can use it with yield*.
  const syncIterable = {
    [Symbol.iterator]: () => syncIteratorRecord.iterator
  };
  // Create an async generator function and immediately invoke it.
  const asyncIterator = (async function* () {
    return yield* syncIterable;
  }());
  // Return as an async iterator record.
  const nextMethod = asyncIterator.next;
  return { iterator: asyncIterator, nextMethod, done: false };
}

// Aligns with core-js/modules/es.symbol.async-iterator.js
export const SymbolAsyncIterator: (typeof Symbol)['asyncIterator'] =
  Symbol.asyncIterator ??
  Symbol.for?.('Symbol.asyncIterator') ??
  '@@asyncIterator';

export type SyncOrAsyncIterable<T> = Iterable<T> | AsyncIterable<T>;
export type SyncOrAsyncIteratorMethod<T> = () => (Iterator<T> | AsyncIterator<T>);

function GetIterator<T>(
  obj: SyncOrAsyncIterable<T>,
  hint: 'async',
  method?: SyncOrAsyncIteratorMethod<T>
): AsyncIteratorRecord<T>;
function GetIterator<T>(
  obj: Iterable<T>,
  hint: 'sync',
  method?: SyncOrAsyncIteratorMethod<T>
): SyncIteratorRecord<T>;
function GetIterator<T>(
  obj: SyncOrAsyncIterable<T>,
  hint = 'sync',
  method?: SyncOrAsyncIteratorMethod<T>
): SyncOrAsyncIteratorRecord<T> {
  assert(hint === 'sync' || hint === 'async');
  if (method === undefined) {
    if (hint === 'async') {
      method = GetMethod(obj as AsyncIterable<T>, SymbolAsyncIterator);
      if (method === undefined) {
        const syncMethod = GetMethod(obj as Iterable<T>, Symbol.iterator);
        const syncIteratorRecord = GetIterator(obj as Iterable<T>, 'sync', syncMethod);
        return CreateAsyncFromSyncIterator(syncIteratorRecord);
      }
    } else {
      method = GetMethod(obj as Iterable<T>, Symbol.iterator);
    }
  }
  if (method === undefined) {
    throw new TypeError('The object is not iterable');
  }
  const iterator = reflectCall(method, obj, []);
  if (!typeIsObject(iterator)) {
    throw new TypeError('The iterator method must return an object');
  }
  const nextMethod = iterator.next;
  return { iterator, nextMethod, done: false } as SyncOrAsyncIteratorRecord<T>;
}

export { GetIterator };

export function IteratorNext<T>(iteratorRecord: AsyncIteratorRecord<T>): Promise<IteratorResult<T>> {
  const result = reflectCall(iteratorRecord.nextMethod, iteratorRecord.iterator, []);
  if (!typeIsObject(result)) {
    throw new TypeError('The iterator.next() method must return an object');
  }
  return result;
}

