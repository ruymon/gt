import { describe, expect, it, vi } from 'vitest';
import { warnDeprecated } from '../deprecation';
import { gtInstanceLogger } from '../logger';

describe('warnDeprecated', () => {
  it('warns once per deprecated key with a generaltranslation diagnostic', () => {
    const warn = vi.spyOn(gtInstanceLogger, 'warn');

    warnDeprecated('GT.oldMethod()', 'GT.newMethod()');
    warnDeprecated('GT.oldMethod()', 'GT.newMethod()');
    warnDeprecated('GT.otherMethod()', 'GT.newMethod()');

    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      'generaltranslation Warning: `GT.oldMethod()` is deprecated and will be removed in the next major version. Use `GT.newMethod()` instead.',
      'generaltranslation Warning: `GT.otherMethod()` is deprecated and will be removed in the next major version. Use `GT.newMethod()` instead.',
    ]);
  });
});
