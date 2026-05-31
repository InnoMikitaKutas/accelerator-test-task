import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useAppSelector } from '@/app/hooks';
import { useGetBrandingByTrainerQuery } from '@/features/branding/api';
import { deriveBrandVars } from './brand';

/**
 * The single source for the zone↔theme rule (frontend-design-spec §Color & Theming):
 *  - Auth, Super-Admin, Zone-1 account chrome → platform Cinder (pass `cinder`).
 *  - Zone-3 workspace + Channel Bar → the active trainer's brand (default behavior).
 *  - JoinLanding / a specific trainer → pass `trainerId`.
 *  - Branding live preview → pass `previewColor` (no fetch).
 * Branded scopes get the `branded` class (focus ring becomes the 3px brand line).
 * Missing/invalid branding falls back to Cinder via deriveBrandVars.
 */

function currentSurface(): string {
  if (typeof document === 'undefined') return '#FFFFFF';
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'dark') return '#161A21';
  if (explicit === 'light') return '#FFFFFF';
  const mm = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
  return mm?.matches ? '#161A21' : '#FFFFFF';
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Theme by this trainer (fetches branding). Defaults to the active context's trainer. */
  trainerId?: string;
  /** Explicit color, skips the fetch — for live previews (BrandingSettings). */
  previewColor?: string;
  /** Force platform Cinder regardless of active context (auth, Super-Admin, Zone-1). */
  cinder?: boolean;
  className?: string;
}

export function ThemeProvider({
  children,
  trainerId,
  previewColor,
  cinder = false,
  className,
}: ThemeProviderProps) {
  const activeTrainerId = useAppSelector((s) => s.activeContext.current?.trainerId);
  const effectiveTrainerId = cinder ? undefined : (trainerId ?? activeTrainerId);

  const shouldFetch = !cinder && !previewColor && Boolean(effectiveTrainerId);
  const { data } = useGetBrandingByTrainerQuery(
    shouldFetch && effectiveTrainerId ? effectiveTrainerId : skipToken,
  );

  const color = previewColor ?? data?.primaryColorHex;
  const surface = currentSurface();
  const vars = useMemo(() => (color ? deriveBrandVars(color, surface) : null), [color, surface]);

  if (!vars) {
    // Unbranded zone: inherit :root Cinder; no `branded` class so focus stays neutral.
    return <div className={className}>{children}</div>;
  }

  const style = {
    '--brand': vars.brand,
    '--brand-text': vars.brandText,
    '--brand-ink': vars.brandInk,
    '--brand-tint': vars.brandTint,
    '--brand-line': vars.brandLine,
  } as CSSProperties;

  return (
    <div className={`branded ${className ?? ''}`.trim()} style={style} data-branded="true">
      {children}
    </div>
  );
}
