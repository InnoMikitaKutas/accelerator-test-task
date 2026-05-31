import type { ReactNode } from 'react';
import styles from './AuthLayout.module.css';

export interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Shared split shell for every auth screen (login/verify/forgot/reset/forced).
 * Platform-Cinder and unbranded by design — the only branded public screen is the
 * Join landing (Phase 6). The form column is the live region; the panel is decorative.
 */
export function AuthLayout({ children }: Readonly<AuthLayoutProps>) {
  return (
    <div className={styles.layout}>
      <aside className={styles.panel} aria-hidden="true">
        <div className={styles.brandMark}>
          <span className={styles.dot} />
          <span className="u-label">Cinder &amp; Chalk</span>
        </div>
        <div className={styles.panelBody}>
          <p className="u-display-l">Train. Track. Improve.</p>
          <p className={styles.tagline}>
            One channel per coach. No merged views — you always know whose program you&apos;re in.
          </p>
        </div>
        <div className={styles.stat}>
          <span className="u-label">Athletes coached</span>
          <span className={`${styles.statValue} u-stat`}>12,480</span>
        </div>
      </aside>
      <main className={styles.formCol}>
        <div className={styles.formInner}>{children}</div>
      </main>
    </div>
  );
}
