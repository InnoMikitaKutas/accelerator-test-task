import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Lock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { TagInput } from '@/components/ui/TagInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { PhotoUploader } from '@/components/upload/PhotoUploader';
import { parseApiError } from '@/services/apiError';
import {
  useGetMyProfileQuery,
  useUpdateMyProfileMutation,
  type UpdateProfileRequest,
} from '@/features/profile/api';
import type { Gender, ProfileDetails, ProfileResponse, Role } from '@/types/api';
import styles from './profile.module.css';

const ROLE_EYEBROW: Record<Role, string> = {
  SUPER_ADMIN: 'Account',
  TRAINER: 'Trainer',
  COACH: 'Coach',
  PLAYER: 'Account',
};

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'UNSPECIFIED', label: 'Prefer not to say' },
];

const MANAGED_HINT = 'Managed by your trainer — not editable';

/** Flat editable view of the role-shaped profile (read-only fields are excluded). */
interface FormState {
  firstName: string;
  lastName: string;
  phone: string;
  businessName: string;
  businessAddress: string;
  bio: string;
  credentials: string[];
  certifications: string[];
  publicVisible: boolean;
  gender: Gender;
  school: string;
  emName: string;
  emPhone: string;
}

function toFormState(p: ProfileResponse): FormState {
  const d = p.details;
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    phone: p.phone ?? '',
    businessName: d.kind === 'trainer' ? d.businessName : '',
    businessAddress: d.kind === 'trainer' ? (d.businessAddress ?? '') : '',
    bio: d.kind === 'coach' ? (d.bio ?? '') : '',
    credentials: d.kind === 'coach' ? [...d.credentials] : [],
    certifications: d.kind === 'coach' ? [...d.certifications] : [],
    publicVisible: d.kind === 'coach' ? d.publicVisible : false,
    gender: d.kind === 'player' ? d.gender : 'UNSPECIFIED',
    school: d.kind === 'player' ? (d.school ?? '') : '',
    emName: d.kind === 'player' ? (d.emergencyContact.name ?? '') : '',
    emPhone: d.kind === 'player' ? (d.emergencyContact.phone ?? '') : '',
  };
}

/** Assemble the PATCH body — common + role-appropriate fields only (read-only fields,
 *  e.g. email/role/skillLevel, are never sent; the server whitelist would reject them). */
function toRequest(f: FormState, kind: ProfileDetails['kind']): UpdateProfileRequest {
  const req: UpdateProfileRequest = { firstName: f.firstName.trim(), lastName: f.lastName.trim() };
  const phone = f.phone.trim();
  if (phone) req.phone = phone; // server rejects an empty phone; omit to leave unchanged

  if (kind === 'trainer') {
    req.businessName = f.businessName.trim();
    req.businessAddress = f.businessAddress.trim();
  } else if (kind === 'coach') {
    req.bio = f.bio.trim();
    req.credentials = f.credentials;
    req.certifications = f.certifications;
    req.publicVisible = f.publicVisible;
  } else if (kind === 'player') {
    req.gender = f.gender;
    req.school = f.school.trim();
    const name = f.emName.trim();
    const phoneNum = f.emPhone.trim();
    // The contract requires both fields together (or neither).
    if (name && phoneNum) req.emergencyContact = { name, phone: phoneNum };
  }
  return req;
}

function validate(f: FormState, kind: ProfileDetails['kind']): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.firstName.trim()) e.firstName = 'First name is required';
  if (!f.lastName.trim()) e.lastName = 'Last name is required';
  if (kind === 'player') {
    const hasName = Boolean(f.emName.trim());
    const hasPhone = Boolean(f.emPhone.trim());
    if (hasName !== hasPhone) {
      e.emergencyContact = 'Enter both a name and a phone, or leave both blank.';
    }
  }
  return e;
}

const equalForm = (a: FormState, b: FormState) => JSON.stringify(a) === JSON.stringify(b);

/** Read-only "locked" chip for server-managed fields (FR-038). */
function ReadOnlyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={styles.readonly}>
      <span className="u-label">{label}</span>
      <span className={styles.readonlyValue} title={hint}>
        <Lock size={14} aria-hidden="true" />
        <span>{value}</span>
        {hint ? <span className="sr-only"> — {hint}</span> : null}
      </span>
    </div>
  );
}

/** Role-shaped account settings (FR-038, FR-032). Loaded form lives in `ProfileForm`. */
export function ProfileSettings() {
  const { data, isLoading, isError, refetch } = useGetMyProfileQuery();

  if (isLoading) {
    return (
      <main className={styles.page}>
        <Skeleton label="Loading your profile" height={28} width={220} />
        <div className={styles.section}>
          <Skeleton height={88} width={88} radius="var(--r-md)" />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </div>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className={styles.page}>
        <div className={styles.loadError} role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <h2>We couldn't load your profile</h2>
            <p>Please check your connection and try again.</p>
          </div>
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCw size={16} aria-hidden="true" /> Retry
          </Button>
        </div>
      </main>
    );
  }

  // Remount on identity change (e.g. impersonation) so the form re-seeds from scratch.
  return <ProfileForm key={data.id} profile={data} />;
}

function ProfileForm({ profile }: Readonly<{ profile: ProfileResponse }>) {
  const [update, { isLoading: saving }] = useUpdateMyProfileMutation();
  const [form, setForm] = useState<FormState>(() => toFormState(profile));
  const [baseline, setBaseline] = useState<FormState>(() => toFormState(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const details = profile.details;
  const kind = details.kind;
  const dirty = !equalForm(form, baseline);

  // Edit a field: clear its error, drop the saved flash and any form-level error.
  const patch = (p: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...p }));
    setSaved(false);
    setFormError(null);
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(p)) delete next[k];
      if ('emName' in p || 'emPhone' in p) delete next.emergencyContact;
      return next;
    });
  };

  const onSave = async () => {
    const v = validate(form, kind);
    if (Object.keys(v).length) {
      setErrors(v);
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      const updated = await update(toRequest(form, kind)).unwrap();
      const next = toFormState(updated);
      setBaseline(next);
      setForm(next);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      const parsed = parseApiError(e);
      if (parsed.details?.length) {
        const mapped: Record<string, string> = {};
        for (const fe of parsed.details) {
          mapped[fe.field.startsWith('emergencyContact') ? 'emergencyContact' : fe.field] = fe.message;
        }
        setErrors(mapped);
      } else {
        setFormError(parsed.message ?? 'Could not save your changes. Please try again.');
      }
    }
  };

  const onDiscard = () => {
    setForm(baseline);
    setErrors({});
    setFormError(null);
    setSaved(false);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headTitles}>
          <p className="u-label">{ROLE_EYEBROW[profile.role]}</p>
          <h1>Profile &amp; account</h1>
        </div>
      </header>

      <section className={styles.section} aria-labelledby="sec-photo">
        <h2 id="sec-photo" className={styles.sectionTitle}>
          Profile photo
        </h2>
        <PhotoUploader
          currentUrl={profile.thumbnailUrl ?? profile.photoUrl}
          name={`${profile.firstName} ${profile.lastName}`}
        />
      </section>

      <section className={styles.section} aria-labelledby="sec-account">
        <h2 id="sec-account" className={styles.sectionTitle}>
          Your details
        </h2>
        <div className={styles.grid2}>
          <FormField label="First name" required error={errors.firstName}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                value={form.firstName}
                maxLength={100}
                autoComplete="given-name"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                onChange={(e) => patch({ firstName: e.target.value })}
              />
            )}
          </FormField>
          <FormField label="Last name" required error={errors.lastName}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                value={form.lastName}
                maxLength={100}
                autoComplete="family-name"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                onChange={(e) => patch({ lastName: e.target.value })}
              />
            )}
          </FormField>
        </div>
        <FormField label="Phone" error={errors.phone} helper="Optional. Include country code.">
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="tel"
              value={form.phone}
              autoComplete="tel"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              onChange={(e) => patch({ phone: e.target.value })}
            />
          )}
        </FormField>

        <div className={styles.grid2}>
          <ReadOnlyField label="Email" value={profile.email} hint={MANAGED_HINT} />
          <ReadOnlyField label="Role" value={profile.role} hint={MANAGED_HINT} />
        </div>
      </section>

      {details.kind === 'trainer' ? (
        <section className={styles.section} aria-labelledby="sec-business">
          <h2 id="sec-business" className={styles.sectionTitle}>
            Business
          </h2>
          <FormField label="Business name" error={errors.businessName}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                value={form.businessName}
                maxLength={200}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                onChange={(e) => patch({ businessName: e.target.value })}
              />
            )}
          </FormField>
          <FormField label="Business address" error={errors.businessAddress}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                value={form.businessAddress}
                maxLength={500}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                onChange={(e) => patch({ businessAddress: e.target.value })}
              />
            )}
          </FormField>
        </section>
      ) : null}

      {details.kind === 'coach' ? (
        <section className={styles.section} aria-labelledby="sec-coach">
          <h2 id="sec-coach" className={styles.sectionTitle}>
            Coach profile
          </h2>
          <FormField label="Bio" error={errors.bio} helper="Up to 2000 characters.">
            {({ id, describedBy, invalid }) => (
              <textarea
                id={id}
                rows={4}
                value={form.bio}
                maxLength={2000}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                onChange={(e) => patch({ bio: e.target.value })}
              />
            )}
          </FormField>
          <FormField label="Credentials" error={errors.credentials} helper="Press Enter or comma to add.">
            {({ id, describedBy, invalid }) => (
              <TagInput
                id={id}
                describedBy={describedBy}
                invalid={invalid}
                value={form.credentials}
                placeholder="e.g. UEFA B License"
                onChange={(v) => patch({ credentials: v })}
              />
            )}
          </FormField>
          <FormField
            label="Certifications"
            error={errors.certifications}
            helper="Press Enter or comma to add."
          >
            {({ id, describedBy, invalid }) => (
              <TagInput
                id={id}
                describedBy={describedBy}
                invalid={invalid}
                value={form.certifications}
                placeholder="e.g. First Aid"
                onChange={(v) => patch({ certifications: v })}
              />
            )}
          </FormField>

          <div className={styles.toggleRow}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={form.publicVisible}
                onChange={(e) => patch({ publicVisible: e.target.checked })}
                aria-describedby="public-help"
              />
              <span>Show my profile in public discovery</span>
            </label>
            <p id="public-help" className={styles.help}>
              When on, your name, bio, and credentials are visible to people browsing coaches.
            </p>
          </div>

          <div className={styles.preview} aria-label="Public profile preview">
            <span className="u-label">What others see</span>
            {form.publicVisible ? (
              <div className={styles.previewCard}>
                <strong>
                  {form.firstName} {form.lastName}
                </strong>
                {form.bio ? <p>{form.bio}</p> : <p className={styles.muted}>No bio yet.</p>}
                {form.credentials.length ? (
                  <ul className={styles.previewTags}>
                    {form.credentials.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className={styles.muted}>Your profile is hidden from public discovery.</p>
            )}
          </div>
        </section>
      ) : null}

      {details.kind === 'player' ? (
        <section className={styles.section} aria-labelledby="sec-player">
          <h2 id="sec-player" className={styles.sectionTitle}>
            Player details
          </h2>
          <div className={styles.grid2}>
            <FormField label="Gender">
              {({ id, describedBy }) => (
                <select
                  id={id}
                  value={form.gender}
                  aria-describedby={describedBy}
                  onChange={(e) => patch({ gender: e.target.value as Gender })}
                >
                  {GENDERS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="School" error={errors.school}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  value={form.school}
                  maxLength={200}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  onChange={(e) => patch({ school: e.target.value })}
                />
              )}
            </FormField>
          </div>

          <ReadOnlyField label="Skill level" value={details.skillLevel ?? 'Not set'} hint={MANAGED_HINT} />

          <fieldset className={styles.fieldset}>
            <legend className="u-label">Emergency contact</legend>
            <div className={styles.grid2}>
              <FormField label="Contact name">
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    value={form.emName}
                    maxLength={120}
                    aria-describedby={describedBy}
                    onChange={(e) => patch({ emName: e.target.value })}
                  />
                )}
              </FormField>
              <FormField label="Contact phone">
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    type="tel"
                    value={form.emPhone}
                    autoComplete="tel"
                    aria-describedby={describedBy}
                    onChange={(e) => patch({ emPhone: e.target.value })}
                  />
                )}
              </FormField>
            </div>
            {errors.emergencyContact ? (
              <p className={styles.error} role="alert">
                {errors.emergencyContact}
              </p>
            ) : null}
          </fieldset>
        </section>
      ) : null}

      {formError ? (
        <p className={styles.formError} role="alert">
          <AlertCircle size={16} aria-hidden="true" /> {formError}
        </p>
      ) : null}

      {dirty || saved ? (
        <div className={styles.saveBar} role="region" aria-label="Save changes">
          {dirty ? (
            <>
              <span className={styles.saveNote}>You have unsaved changes</span>
              <div className={styles.saveActions}>
                <Button variant="secondary" onClick={onDiscard} disabled={saving}>
                  Discard
                </Button>
                <Button onClick={onSave} loading={saving}>
                  Save changes
                </Button>
              </div>
            </>
          ) : (
            <span className={styles.savedFlash}>
              <Check size={16} aria-hidden="true" /> Saved
            </span>
          )}
        </div>
      ) : null}
    </main>
  );
}
