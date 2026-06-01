import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailCheck } from 'lucide-react';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { useForgotPasswordMutation } from '@/features/auth/api';
import { AuthLayout } from './AuthLayout';
import styles from './auth.module.css';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});
type ForgotValues = z.infer<typeof schema>;

export function ForgotPassword() {
  const [forgot, { isLoading }] = useForgotPasswordMutation();
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await forgot({ email }).unwrap();
    } catch {
      /* endpoint always returns 202; never reveal whether the account exists */
    } finally {
      setDone(true);
    }
  });

  if (done) {
    return (
      <AuthLayout>
        <header className={styles.head}>
          <p className="u-label">Reset password</p>
          <h1>Check your email</h1>
        </header>
        <div className={styles.panel}>
          <span className={styles.panelIcon} data-tone="go">
            <MailCheck size={22} aria-hidden="true" />
          </span>
          <p className={styles.muted}>
            If an account exists for that address, we&apos;ve sent a link to reset your password. The
            link expires in 1 hour.
          </p>
          <Link to="/login">Back to login</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <header className={styles.head}>
        <p className="u-label">Reset password</p>
        <h1>Forgot your password?</h1>
        <p className={styles.sub}>
          Enter your email and we&apos;ll send a link to set a new one.
        </p>
      </header>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <FormField label="Email" required error={errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="email"
              autoComplete="email"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...register('email')}
            />
          )}
        </FormField>
        <Button type="submit" className={styles.submit} loading={isLoading}>
          Send reset link
        </Button>
      </form>

      <p className={styles.alt}>
        <Link to="/login">Back to login</Link>
      </p>
    </AuthLayout>
  );
}
