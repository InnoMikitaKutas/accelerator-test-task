import { PackageOpen } from 'lucide-react';
import styles from './users.module.css';

/**
 * Camp-import boundary (FR-040). The full conversion flow is owned by Epic-08; this
 * is a labeled, non-functional preview so the surface exists without implying it works.
 */
export function CampImportPanel() {
  return (
    <section className={styles.campStub} aria-label="Camp import">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        <PackageOpen size={18} aria-hidden="true" />
        <span className="u-label">Camp import — Epic-08 preview</span>
      </div>
      <p>
        Bulk conversion of camp registrations into platform accounts lands in Epic-08. This panel is a
        placeholder for that workflow.
      </p>
    </section>
  );
}
