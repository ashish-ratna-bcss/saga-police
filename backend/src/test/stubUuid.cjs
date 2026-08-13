/**
 * uuid@13 is ESM-only. Node 18 cannot `require('uuid')`, which would make every
 * self-check that loads monitorService / Alert fail before any assertion runs.
 * Install this stub BEFORE requiring those modules. Production is unchanged.
 */
const Module = require('module');

if (!Module.__sockeyeUuidStubbed) {
  const origLoad = Module._load;
  Module._load = function stubUuid(request, parent, isMain) {
    if (request === 'uuid') {
      return {
        v4: () => '00000000-0000-4000-8000-000000000001',
        validate: () => true,
        stringify: (b) => String(b),
        parse: () => Buffer.alloc(16)
      };
    }
    return origLoad.apply(this, arguments);
  };
  Module.__sockeyeUuidStubbed = true;
}
