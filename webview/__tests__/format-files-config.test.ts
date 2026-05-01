import { describe, expect, it } from 'vitest';

import {
  buildIncludeGlob,
  composeExcludeGlob,
  folderToGlob,
  normalizeFolderList,
  normalizeLogLevel,
  parseExtensions,
  parseGlobList,
} from '../../extension/format-files/config-utils';

describe('parseExtensions', () => {
  it('returns empty for empty / non-string input', () => {
    expect(parseExtensions('')).toEqual([]);
    expect(parseExtensions('   ')).toEqual([]);
    expect(parseExtensions(undefined)).toEqual([]);
    expect(parseExtensions(null)).toEqual([]);
    expect(parseExtensions(42)).toEqual([]);
  });

  it('splits on commas and prefixes a dot', () => {
    expect(parseExtensions('ts,tsx,js')).toEqual(['.ts', '.tsx', '.js']);
  });

  it('trims surrounding whitespace', () => {
    expect(parseExtensions(' ts , tsx , js ')).toEqual(['.ts', '.tsx', '.js']);
  });

  it('keeps an existing leading dot', () => {
    expect(parseExtensions('.md,.txt')).toEqual(['.md', '.txt']);
  });

  it('strips back-compat brace wrappers', () => {
    expect(parseExtensions('{ts,js}')).toEqual(['.ts', '.js']);
    expect(parseExtensions('{{ts,js}}')).toEqual(['.ts', '.js']);
  });

  it('dedupes preserving order', () => {
    expect(parseExtensions('ts,ts,.ts,tsx')).toEqual(['.ts', '.tsx']);
  });

  it('drops empty entries from trailing commas', () => {
    expect(parseExtensions('ts,,tsx,')).toEqual(['.ts', '.tsx']);
  });
});

describe('parseGlobList', () => {
  it('returns empty for empty input', () => {
    expect(parseGlobList('')).toEqual([]);
    expect(parseGlobList(undefined)).toEqual([]);
  });

  it('splits, trims, dedupes', () => {
    expect(parseGlobList('**/*.min.js, **/vendor/** , **/*.min.js'))
      .toEqual(['**/*.min.js', '**/vendor/**']);
  });

  it('preserves glob characters as-is', () => {
    expect(parseGlobList('packages/*/dist/**')).toEqual(['packages/*/dist/**']);
  });
});

describe('normalizeFolderList', () => {
  const fallback = ['node_modules', '.git'];

  it('returns fallback when input is not an array', () => {
    expect(normalizeFolderList(undefined, fallback)).toEqual(fallback);
    expect(normalizeFolderList('node_modules', fallback)).toEqual(fallback);
    expect(normalizeFolderList(null, fallback)).toEqual(fallback);
  });

  it('keeps trimmed unique strings', () => {
    expect(normalizeFolderList(['  node_modules  ', '.git', '.git', ''], fallback))
      .toEqual(['node_modules', '.git']);
  });

  it('drops non-string entries', () => {
    expect(normalizeFolderList(['a', 1, true, 'b'], fallback)).toEqual(['a', 'b']);
  });
});

describe('folderToGlob', () => {
  it('wraps simple names', () => {
    expect(folderToGlob('node_modules')).toBe('**/node_modules/**');
  });

  it('handles paths with separators', () => {
    expect(folderToGlob('packages/foo')).toBe('**/packages/foo/**');
  });

  it('strips leading and trailing slashes', () => {
    expect(folderToGlob('/dist/')).toBe('**/dist/**');
    expect(folderToGlob('\\dist\\')).toBe('**/dist/**');
  });

  it('passes through entries that already contain glob meta-chars', () => {
    expect(folderToGlob('packages/*/dist')).toBe('packages/*/dist');
  });

  it('returns empty string for empty input', () => {
    expect(folderToGlob('')).toBe('');
    expect(folderToGlob('/')).toBe('');
  });
});

describe('composeExcludeGlob', () => {
  it('returns null when nothing to exclude', () => {
    expect(composeExcludeGlob([])).toBeNull();
    expect(composeExcludeGlob(['', '   '])).toBeNull();
  });

  it('returns the single entry unchanged', () => {
    expect(composeExcludeGlob(['**/node_modules/**'])).toBe('**/node_modules/**');
  });

  it('wraps multiple entries in brace expansion', () => {
    expect(composeExcludeGlob(['a', 'b', 'c'])).toBe('{a,b,c}');
  });
});

describe('buildIncludeGlob', () => {
  it('returns **/* when neither extensions nor globs supplied', () => {
    expect(buildIncludeGlob({ extensions: [] })).toBe('**/*');
  });

  it('uses extension brace fragment for multiple extensions', () => {
    expect(buildIncludeGlob({ extensions: ['.ts', '.tsx', '.js'] })).toBe('**/*.{ts,tsx,js}');
  });

  it('uses single-extension form for one extension', () => {
    expect(buildIncludeGlob({ extensions: ['.ts'] })).toBe('**/*.ts');
  });

  it('prefers user-supplied globs over extensions', () => {
    expect(buildIncludeGlob({ extensions: ['.ts'], globs: ['**/*.json'] })).toBe('**/*.json');
  });

  it('wraps multiple user-supplied globs', () => {
    expect(buildIncludeGlob({ extensions: [], globs: ['**/*.ts', '**/*.json'] }))
      .toBe('{**/*.ts,**/*.json}');
  });
});

describe('normalizeLogLevel', () => {
  it('returns valid levels untouched', () => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const)
      expect(normalizeLogLevel(level)).toBe(level);
  });

  it('falls back for invalid input', () => {
    expect(normalizeLogLevel('VERBOSE')).toBe('debug');
    expect(normalizeLogLevel(undefined)).toBe('debug');
    expect(normalizeLogLevel(42, 'info')).toBe('info');
  });
});
