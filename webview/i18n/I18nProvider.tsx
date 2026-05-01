import { makeT } from '@shared/i18n';
import { createContext, useContext, useMemo } from 'react';

import type { DictKey } from '@shared/i18n';
import type { Locale } from '@shared/messages';
import type { ReactNode } from 'react';

interface I18nContextValue {
  locale: Locale;
  t: (key: DictKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

interface ProviderProps {
  locale: Locale;
  children: ReactNode;
}

export function I18nProvider({ locale, children }: ProviderProps) {
  const value = useMemo<I18nContextValue>(
    () => ({ locale, t: makeT(locale) }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Hook returning the active locale and a bound `t()` helper. Falls back to
 * English if used outside an `I18nProvider` (defensive — components rendered
 * via the regular app tree always have a provider).
 */
export function useT(): (key: DictKey, params?: Record<string, string | number>) => string {
  const ctx = useContext(I18nContext);
  if (!ctx)
    return makeT('en');
  return ctx.t;
}

export function useLocale(): Locale {
  const ctx = useContext(I18nContext);
  return ctx?.locale ?? 'en';
}
