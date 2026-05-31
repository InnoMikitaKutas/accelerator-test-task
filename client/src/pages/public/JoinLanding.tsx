import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CheckCircle2, Lock, Radio } from 'lucide-react';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { assetUrl } from '@/lib/assetUrl';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppSelector } from '@/app/hooks';
import { parseApiError } from '@/services/apiError';
import { useLogoutMutation } from '@/features/auth/api';
import { useGetContextsQuery } from '@/features/context/api';
import {
  useJoinAssociateMutation,
  useJoinRegisterMutation,
  useResolveJoinQuery,
} from '@/features/sharelinks/api';
import type { JoinResolve } from '@/types/api';
import { AuthBanner } from '@/pages/auth/AuthBanner';
import { PasswordStrengthMeter } from '@/pages/auth/PasswordStrengthMeter';
import styles from './join.module.css';

/** Public, trainer-branded join landing (FR-017/018/028/029; M1, L7). */
export function JoinLanding() {
  const { code = '' } = useParams();
  const { data: resolved, isLoading, isError } = useResolveJoinQuery(code, { skip: !code });
  const sessionUser = useAppSelector((s) => s.session.user);
  // Registering sets the session mid-flight; without this latch the branch would flip to
  // the authed "associate" panel (firing a stray contexts fetch) for the instant before
  // we navigate away. Latched at submit start, so it's already set when the session lands.
  const [registering, setRegistering] = useState(false);

  return (
    <ThemeProvider previewColor={resolved?.branding?.primaryColorHex ?? undefined} className={styles.root}>
      <main className={styles.card}>
        <header className={styles.hero}>
          {resolved?.branding?.logoUrl ? (
            // C1: foreign asset origin — render via <img>, never inline.
            <img
              className={styles.logo}
              src={assetUrl(resolved.branding.logoUrl)}
              alt={`${resolved.trainerDisplayName || 'Trainer'} logo`}
            />
          ) : (
            <span className={styles.mark} aria-hidden="true">
              <Radio size={22} />
            </span>
          )}
          {isLoading ? (
            <Skeleton width={220} height={28} label="Loading your invitation" />
          ) : resolved?.status === 'VALID' ? (
            <>
              <p className="u-label">You&apos;re joining</p>
              <h1 className={styles.trainerName}>{resolved.trainerDisplayName || 'your trainer'}</h1>
            </>
          ) : (
            <h1 className={styles.trainerName}>Join</h1>
          )}
        </header>

        <div className={styles.body}>
          {isLoading ? (
            <Skeleton height={140} />
          ) : isError || !resolved ? (
            <Explainer
              tone="foul"
              title="We couldn't open this link"
              body="Please check your connection and try again, or ask your trainer to resend the link."
            />
          ) : (
            <JoinBody
              resolved={resolved}
              code={code}
              authed={Boolean(sessionUser) && !registering}
              onRegisterStart={() => setRegistering(true)}
            />
          )}
        </div>
      </main>
    </ThemeProvider>
  );
}

function JoinBody({
  resolved,
  code,
  authed,
  onRegisterStart,
}: Readonly<{ resolved: JoinResolve; code: string; authed: boolean; onRegisterStart: () => void }>) {
  const name = resolved.trainerDisplayName || 'your trainer';

  if (resolved.status === 'INVALID') {
    return (
      <Explainer
        tone="foul"
        title="This link isn't valid"
        body="Double-check the link you were sent, or ask your trainer for a new one."
      />
    );
  }
  if (resolved.status === 'EXPIRED') {
    return (
      <Explainer
        tone="pending"
        title="This link has expired"
        body={`Invite links don't last forever. Ask ${name} to send you a fresh one.`}
      />
    );
  }
  if (resolved.status === 'USED') {
    return (
      <Explainer
        tone="pending"
        title="This link was already used"
        body="Invite links work once. If you still need access, ask your trainer for a new link."
      />
    );
  }

  // VALID
  if (!authed)
    return <JoinRegisterForm resolved={resolved} code={code} onRegisterStart={onRegisterStart} />;
  // M1: an already-logged-in user cannot redeem a coach invite — they must register fresh.
  if (resolved.type === 'unique') return <UniqueAuthedNotice />;
  return <AssociatePanel resolved={resolved} code={code} />;
}

function Explainer({
  tone,
  title,
  body,
}: Readonly<{ tone: 'foul' | 'pending'; title: string; body: string }>) {
  return (
    <div className={styles.explainer} role="status">
      <span className={styles.explainIcon} data-tone={tone}>
        <AlertCircle size={22} aria-hidden="true" />
      </span>
      <h2 className={styles.explainTitle}>{title}</h2>
      <p className={styles.muted}>{body}</p>
      <p className={styles.alt}>
        <Link to="/login">Back to login</Link>
      </p>
    </div>
  );
}

/** M1 — coach invite, already authenticated: must log out and register a new account. */
function UniqueAuthedNotice() {
  const [logout, { isLoading }] = useLogoutMutation();
  return (
    <div className={styles.notice}>
      <AuthBanner tone="info" live="status">
        This coach invite must be redeemed by creating a new account. Log out, then open this link
        again to register as a coach.
      </AuthBanner>
      <Button variant="secondary" loading={isLoading} onClick={() => logout()}>
        Log out
      </Button>
    </div>
  );
}

const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(128, 'Use at most 128 characters')
    .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'Include a letter and a number'),
  phone: z.string().max(32).optional(),
});
type RegisterValues = z.infer<typeof registerSchema>;
const REGISTER_FIELDS = ['firstName', 'lastName', 'email', 'password', 'phone'] as const;

/** Unauthenticated branch — register + auto-login (still unverified → L7 banner). */
function JoinRegisterForm({
  resolved,
  code,
  onRegisterStart,
}: Readonly<{ resolved: JoinResolve; code: string; onRegisterStart: () => void }>) {
  const navigate = useNavigate();
  const [register_, { isLoading }] = useJoinRegisterMutation();
  // Coach invites lock the email to the invited address (server enforces email == prefill).
  const lockedEmail = resolved.type === 'unique' ? resolved.prefillEmail : null;
  const [banner, setBanner] = useState<ReactNode | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: '', lastName: '', email: lockedEmail ?? '', password: '', phone: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    // Claim the view before the mutation: its onQueryStarted sets the session mid-flight,
    // and this keeps the parent on the register branch (no associate-panel flicker).
    onRegisterStart();
    try {
      await register_({
        code,
        body: {
          email: lockedEmail ?? values.email,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone?.trim() ? values.phone.trim() : undefined,
        },
      }).unwrap();
      // Session is set by the mutation; land on the app where the verify banner shows (L7).
      navigate('/', { replace: true });
    } catch (e) {
      const parsed = parseApiError(e);
      if (parsed.errorCode === 'EMAIL_EXISTS') {
        setBanner(
          <>
            You already have an account. <Link to="/login">Log in</Link> and open this link again to
            connect.
          </>,
        );
        return;
      }
      if (parsed.errorCode === 'SHARELINK_EXPIRED' || parsed.errorCode === 'SHARELINK_USED') {
        setBanner('This link is no longer available — ask your trainer for a new one.');
        return;
      }
      if (parsed.errorCode === 'VALIDATION_ERROR') {
        for (const fe of parsed.details ?? []) {
          if ((REGISTER_FIELDS as readonly string[]).includes(fe.field)) {
            setError(fe.field as (typeof REGISTER_FIELDS)[number], { message: fe.message });
          }
        }
        return;
      }
      setBanner('Something went wrong creating your account. Please try again.');
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {banner ? (
        <AuthBanner tone="foul" live="alert">
          {banner}
        </AuthBanner>
      ) : null}

      <div className={styles.grid2}>
        <FormField label="First name" required error={errors.firstName?.message}>
          {({ id, describedBy, invalid }) => (
            <input id={id} autoComplete="given-name" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...register('firstName')} />
          )}
        </FormField>
        <FormField label="Last name" required error={errors.lastName?.message}>
          {({ id, describedBy, invalid }) => (
            <input id={id} autoComplete="family-name" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...register('lastName')} />
          )}
        </FormField>
      </div>

      {lockedEmail ? (
        <FormField label="Email" helper="This invite is tied to your email.">
          {({ id }) => (
            <div className={styles.lockedField}>
              <Lock size={14} aria-hidden="true" />
              <input id={id} type="email" value={lockedEmail} readOnly aria-readonly="true" />
            </div>
          )}
        </FormField>
      ) : (
        <FormField label="Email" required error={errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <input id={id} type="email" autoComplete="email" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...register('email')} />
          )}
        </FormField>
      )}

      <FormField label="Password" required error={errors.password?.message}>
        {({ id, describedBy, invalid }) => (
          <input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...register('password')} />
        )}
      </FormField>
      <PasswordStrengthMeter value={watch('password')} />

      <FormField label="Phone" error={errors.phone?.message} helper="Optional. Include country code.">
        {({ id, describedBy, invalid }) => (
          <input id={id} type="tel" autoComplete="tel" aria-describedby={describedBy} aria-invalid={invalid || undefined} {...register('phone')} />
        )}
      </FormField>

      <Button type="submit" className={styles.submit} loading={isLoading}>
        Create account &amp; join
      </Button>
    </form>
  );
}

/** Authenticated branch (static link) — associate an owned subject with this trainer. */
function AssociatePanel({ resolved, code }: Readonly<{ resolved: JoinResolve; code: string }>) {
  const name = resolved.trainerDisplayName || 'your trainer';
  const { data: contexts, isLoading: loadingSubjects } = useGetContextsQuery();
  const [associate, { isLoading }] = useJoinAssociateMutation();

  const subjects = contexts?.subjects ?? [];
  const selfId = subjects.find((s) => s.isSelf)?.profileId ?? '';
  const [chosen, setChosen] = useState('');
  const [done, setDone] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // Default to self until the user picks; an empty value lets the server default to self too.
  const effectiveSubject = chosen || selfId;

  if (done) {
    return (
      <div className={styles.explainer} role="status">
        <span className={styles.explainIcon} data-tone="go">
          <CheckCircle2 size={22} aria-hidden="true" />
        </span>
        <h2 className={styles.explainTitle}>You&apos;re connected to {name}</h2>
        <p className={styles.muted}>This channel is now available in your switcher.</p>
        <Link to="/" className={styles.linkButton}>
          Go to my dashboard
        </Link>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className={styles.explainer} role="status">
        <span className={styles.explainIcon} data-tone="pending">
          <AlertCircle size={22} aria-hidden="true" />
        </span>
        <h2 className={styles.explainTitle}>Ask a parent to add this</h2>
        <p className={styles.muted}>
          Connecting to a new coach needs a grown-up. We&apos;ve emailed your parent a link to finish
          it for you.
        </p>
      </div>
    );
  }

  const onConfirm = async () => {
    setBanner(null);
    try {
      await associate({ code, body: { subjectProfileId: effectiveSubject || undefined } }).unwrap();
      setDone(true);
    } catch (e) {
      const parsed = parseApiError(e);
      if (parsed.errorCode === 'MINOR_FORBIDDEN') setBlocked(true);
      else if (parsed.errorCode === 'SHARELINK_EXPIRED' || parsed.errorCode === 'SHARELINK_USED')
        setBanner('This link is no longer available — ask your trainer for a new one.');
      else setBanner('Could not add this connection. Please try again.');
    }
  };

  const multiple = subjects.length > 1;

  return (
    <div className={styles.associate}>
      {banner ? (
        <AuthBanner tone="foul" live="alert">
          {banner}
        </AuthBanner>
      ) : null}
      <p className={styles.muted}>Add this connection to your account.</p>

      {loadingSubjects ? (
        <Skeleton height={48} />
      ) : multiple ? (
        <fieldset className={styles.chooser}>
          <legend className="u-label">Who is joining?</legend>
          {subjects.map((s) => (
            <label key={s.profileId} className={styles.chooserOption}>
              <input
                type="radio"
                name="join-subject"
                value={s.profileId}
                checked={effectiveSubject === s.profileId}
                onChange={() => setChosen(s.profileId)}
              />
              <span>
                {s.displayName}
                {s.isSelf ? ' (me)' : ''}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <Button className={styles.submit} loading={isLoading} onClick={onConfirm}>
        Add this connection
      </Button>
    </div>
  );
}
