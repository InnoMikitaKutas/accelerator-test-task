import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { parseApiError } from '@/services/apiError';
import {
  useAddChildTrainerMutation,
  useCreateChildMutation,
  type CreateChildRequest,
} from '@/features/family/api';
import type { ChildSummary, Gender, TrainerRef } from '@/types/api';
import styles from './family.module.css';

const MIN_AGE = 1;
const MAX_AGE = 18;
const clampAge = (n: number) => Math.min(MAX_AGE, Math.max(MIN_AGE, Math.round(n) || MIN_AGE));

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'UNSPECIFIED', label: 'Prefer not to say' },
];

export interface AddChildFlowProps {
  open: boolean;
  onClose: () => void;
  onCreated: (child: ChildSummary) => void;
  /** Trainers already known to the family (other children) — offered in step 2 (FR-022). */
  knownTrainers: TrainerRef[];
}

/** Add-child flow (FR-021/022, L2): details → trainer selection. */
export function AddChildFlow({ open, onClose, onCreated, knownTrainers }: Readonly<AddChildFlowProps>) {
  const [createChild, { isLoading: creating }] = useCreateChildMutation();
  const [addTrainer, { isLoading: associating }] = useAddChildTrainerMutation();

  const [step, setStep] = useState<1 | 2>(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState(8);
  const [gender, setGender] = useState<Gender>('UNSPECIFIED');
  const [school, setSchool] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState(false);
  const [child, setChild] = useState<ChildSummary | null>(null);
  const [selectedTrainers, setSelectedTrainers] = useState<ReadonlySet<string>>(new Set());

  const submitDetails = async (confirmDuplicate: boolean) => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = 'First name is required';
    if (!lastName.trim()) e.lastName = 'Last name is required';
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    const body: CreateChildRequest = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      age: clampAge(age),
      gender,
      school: school.trim() ? school.trim() : undefined,
      ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
    };
    try {
      const created = await createChild(body).unwrap();
      setChild(created);
      setStep(2);
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed.errorCode === 'DUPLICATE_CHILD_WARNING') {
        setDuplicate(true);
        return;
      }
      if (parsed.errorCode === 'VALIDATION_ERROR') {
        const mapped: Record<string, string> = {};
        for (const fe of parsed.details ?? []) mapped[fe.field] = fe.message;
        setErrors(mapped);
        return;
      }
      setErrors({ form: parsed.message ?? 'Could not add this child. Please try again.' });
    }
  };

  const toggleTrainer = (trainerId: string) =>
    setSelectedTrainers((prev) => {
      const next = new Set(prev);
      if (next.has(trainerId)) next.delete(trainerId);
      else next.add(trainerId);
      return next;
    });

  const finish = async () => {
    if (child && selectedTrainers.size) {
      for (const trainerId of selectedTrainers) {
        try {
          await addTrainer({ childId: child.profileId, body: { trainerId } }).unwrap();
        } catch {
          /* a failed association is surfaced globally; keep the child that was created */
        }
      }
    }
    if (child) onCreated(child);
    reset();
    onClose();
  };

  const reset = () => {
    setStep(1);
    setFirstName('');
    setLastName('');
    setAge(8);
    setGender('UNSPECIFIED');
    setSchool('');
    setErrors({});
    setDuplicate(false);
    setChild(null);
    setSelectedTrainers(new Set());
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={step === 1 ? 'Add a child' : 'Connect a coach'}
      footer={
        step === 1 ? (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            {duplicate ? (
              <Button variant="danger" loading={creating} onClick={() => submitDetails(true)}>
                Add anyway
              </Button>
            ) : (
              <Button loading={creating} onClick={() => submitDetails(false)}>
                Continue
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={finish}>
              Skip for now
            </Button>
            <Button loading={associating} onClick={finish}>
              Done
            </Button>
          </>
        )
      }
    >
      {step === 1 ? (
        <div className={styles.form}>
          {errors.form ? (
            <p className={styles.formError} role="alert">
              {errors.form}
            </p>
          ) : null}
          <div className={styles.grid2}>
            <FormField label="First name" required error={errors.firstName}>
              {({ id, describedBy, invalid }) => (
                <input id={id} value={firstName} aria-describedby={describedBy} aria-invalid={invalid || undefined} onChange={(e) => setFirstName(e.target.value)} />
              )}
            </FormField>
            <FormField label="Last name" required error={errors.lastName}>
              {({ id, describedBy, invalid }) => (
                <input id={id} value={lastName} aria-describedby={describedBy} aria-invalid={invalid || undefined} onChange={(e) => setLastName(e.target.value)} />
              )}
            </FormField>
          </div>

          <div className={styles.grid2}>
            <FormField label="Age" error={errors.age}>
              {({ id, describedBy }) => (
                <div className={styles.stepper}>
                  <button type="button" aria-label="Decrease age" disabled={age <= MIN_AGE} onClick={() => setAge((a) => clampAge(a - 1))}>
                    <Minus size={16} aria-hidden="true" />
                  </button>
                  <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={MIN_AGE}
                    max={MAX_AGE}
                    value={age}
                    aria-describedby={describedBy}
                    onChange={(e) => setAge(clampAge(Number(e.target.value)))}
                  />
                  <button type="button" aria-label="Increase age" disabled={age >= MAX_AGE} onClick={() => setAge((a) => clampAge(a + 1))}>
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
            </FormField>
            <FormField label="Gender">
              {({ id }) => (
                <select id={id} value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
                  {GENDERS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>

          <FormField label="School" error={errors.school} helper="Optional.">
            {({ id, describedBy, invalid }) => (
              <input id={id} value={school} aria-describedby={describedBy} aria-invalid={invalid || undefined} onChange={(e) => setSchool(e.target.value)} />
            )}
          </FormField>

          {duplicate ? (
            <p className={styles.dupWarn} role="alert">
              You already have a child with this name and age. Add anyway?
            </p>
          ) : null}
        </div>
      ) : (
        <div className={styles.form}>
          <p className={styles.muted}>
            Connect {child?.firstName ?? 'your child'} to a coach now, or skip and do it later.
          </p>
          {knownTrainers.length === 0 ? (
            <p className={styles.muted}>
              You aren&apos;t connected to any coaches yet. Use a coach&apos;s share link from their
              roster, then add the connection here.
            </p>
          ) : (
            <fieldset className={styles.checklist}>
              <legend className="u-label">Your coaches</legend>
              {knownTrainers.map((t) => (
                <label key={t.trainerId} className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={selectedTrainers.has(t.trainerId)}
                    onChange={() => toggleTrainer(t.trainerId)}
                  />
                  <span>{t.name}</span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
      )}
    </Modal>
  );
}
