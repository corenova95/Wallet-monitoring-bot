/**
 * Node 18 does not define global File (added in Node 20).
 * Cheerio/undici dependency chain expects it. This must be imported first in server.js.
 */
if (typeof globalThis.File === 'undefined' && typeof globalThis.Blob !== 'undefined') {
  globalThis.File = class File extends globalThis.Blob {
    constructor(bits, name, options = {}) {
      super(bits, options);
      this.name = name;
      this.lastModified = options.lastModified ?? Date.now();
    }
  };
}
