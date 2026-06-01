import { useEffect, useMemo, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { LogoUploader } from '@/components/upload/LogoUploader';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { CINDER, contrastRatio, deriveBrandVars } from '@/theme/brand';
import { useAppDispatch } from '@/app/hooks';
import { pushToast } from '@/features/toasts/toastsSlice';
import { parseApiError } from '@/services/apiError';
import { useGetOwnBrandingQuery, useSetBrandingColorMutation } from '@/features/branding/api';
import styles from './branding.module.css';

const HEX6 = /^#[0-9A-Fa-f]{6}$/;
const PREVIEW_SURFACE = '#FFFFFF'; // read-out judged against a light portal surface
const AA = 4.5;

/**
 * BrandingSettings (FR-037) — the meta screen. A hex color picker (validated
 * `^#[0-9A-Fa-f]{6}$`) + LogoUploader; on every valid change the preview pane
 * re-themes instantly via ThemeProvider(previewColor) → deriveBrandVars, with a
 * contrast read-out warning when the brand must darken for AA-safe text. Reset to
 * Cinder + Apply org-wide (PUT; invalidates Branding so players re-theme on next
 * resolve). States: clean / dirty / saving / saved / error.
 */
export function BrandingSettings() {
  const dispatch = useAppDispatch();
  const { data: branding } = useGetOwnBrandingQuery();
  const [save, { isLoading: saving }] = useSetBrandingColorMutation();

  const saved = branding?.primaryColorHex ?? CINDER.brand;
  const [color, setColor] = useState(saved);
  const [justSaved, setJustSaved] = useState(false);

  // Re-seed when the saved color changes (initial load + post-save refetch).
  useEffect(() => {
    setColor(saved);
  }, [saved]);

  const valid = HEX6.test(color);
  const previewColor = valid ? color : saved; // invalid input keeps the last good preview
  const dirty = valid && color.toUpperCase() !== saved.toUpperCase();

  const ratio = useMemo(() => (valid ? contrastRatio(color, PREVIEW_SURFACE) : 0), [valid, color]);
  const willDarken = valid && ratio < AA;
  const brandText = useMemo(
    () => (valid ? deriveBrandVars(color, PREVIEW_SURFACE).brandText : ''),
    [valid, color],
  );

  const onColorChange = (v: string) => {
    setColor(v);
    setJustSaved(false);
  };

  const onApply = async () => {
    if (!dirty) return;
    try {
      await save({ primaryColorHex: color.toUpperCase() }).unwrap();
      setJustSaved(true);
      dispatch(pushToast({ tone: 'go', message: 'Branding applied to your portal.' }));
    } catch (e) {
      dispatch(pushToast({ tone: 'foul', message: parseApiError(e).message ?? 'Could not save branding.' }));
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headTitles}>
          <p className="u-label">Trainer</p>
          <h1>Portal branding</h1>
        </div>
      </header>

      <div className={styles.layout}>
        <section className={styles.controls} aria-label="Branding controls">
          <FormField label="Logo">{() => <LogoUploader currentUrl={branding?.logoUrl ?? null} />}</FormField>

          <FormField
            label="Primary color"
            error={!valid && color ? 'Enter a 6-digit hex color, e.g. #1A73E8' : undefined}
            helper="Used across your players’ portal."
          >
            {({ id, describedBy, invalid }) => (
              <div className={styles.colorRow}>
                <input
                  type="color"
                  aria-label="Color picker"
                  className={styles.swatch}
                  value={valid ? color : saved}
                  onChange={(e) => onColorChange(e.target.value.toUpperCase())}
                />
                <input
                  id={id}
                  className={styles.hexInput}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  value={color}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => onColorChange(e.target.value)}
                />
              </div>
            )}
          </FormField>

          {valid ? (
            <p className={willDarken ? styles.contrastWarn : styles.contrastOk} role="status">
              {willDarken
                ? `Low contrast on white (${ratio.toFixed(1)}:1) — we’ll use a darker shade (${brandText}) for text so it stays readable (AA).`
                : `Contrast ${ratio.toFixed(1)}:1 on white — AA-safe for text.`}
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => onColorChange(CINDER.brand)} disabled={saving}>
              <RotateCcw size={15} aria-hidden="true" /> Reset to default
            </Button>
            <Button onClick={onApply} loading={saving} disabled={!dirty}>
              {justSaved && !dirty ? (
                <>
                  <Check size={15} aria-hidden="true" /> Saved
                </>
              ) : (
                'Apply org-wide'
              )}
            </Button>
          </div>
        </section>

        <section className={styles.previewWrap} aria-label="Live preview">
          <p className="u-label">Preview — what your players see</p>
          <ThemeProvider previewColor={previewColor} className={styles.preview}>
            <div className={styles.miniBar}>
              <span className={styles.miniSubject}>Alex • You</span>
              <span className={styles.miniTab}>Channel</span>
            </div>
            <div className={styles.miniCard}>
              <h3 className={styles.miniTitle}>Next session</h3>
              <p className={styles.miniText}>Saturday 10:00 — confirmed with your coach.</p>
              <div className={styles.miniRow}>
                <button type="button" className={styles.miniBtn}>
                  Book a session
                </button>
                <span className={styles.miniBadge}>NEW</span>
                <a className={styles.miniLink} href="#preview" onClick={(e) => e.preventDefault()}>
                  Details
                </a>
              </div>
            </div>
          </ThemeProvider>
        </section>
      </div>
    </main>
  );
}
