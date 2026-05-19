export class AsyncLocalStorage<T = any> {
  private store: T | undefined;

  getStore() {
    return this.store;
  }

  run(store: T, callback: (...args: any[]) => any, ...args: any[]) {
    const previous = this.store;
    this.store = store;
    try {
      return callback(...args);
    } finally {
      this.store = previous;
    }
  }

  enterWith(store: T) {
    this.store = store;
  }
}
