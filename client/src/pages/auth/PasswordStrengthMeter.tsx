import { scorePassword } from './passwordStrength';
import styles from './auth.module.css';

export interface PasswordStrengthMeterProps {
  value: string;
  /** Wires aria-describedby from the password field. */
  id?: string;
}

/** Four-segment advisory meter + a text label (the label is the SR equivalent). */
export function PasswordStrengthMeter({ value, id }: Readonly<PasswordStrengthMeterProps>) {
  const { score, label, tone } = scorePassword(value);

  return (
    <div className={styles.meter} id={id}>
      <div className={styles.meterTrack} aria-hidden="true">
        {[1, 2, 3, 4].map((seg) => (
          <span
            key={seg}
            className={styles.meterSeg}
            data-on={score >= seg}
            data-tone={tone}
          />
        ))}
      </div>
      <p className={styles.meterLabel} aria-live="polite">
        {value ? `Password strength: ${label}` : 'Use at least 8 characters, with a letter and a number.'}
      </p>
    </div>
  );
}
