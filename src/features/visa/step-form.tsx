import { Field, Input, Select } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { stepFields } from './form-fields'
import type { StepId } from './form-schema'

const area = 'min-h-28 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm aria-invalid:border-red-500'

export function StepForm({
  step, values, errors, onChange,
}: {
  step: StepId
  values: Record<string, string>
  errors: Record<string, string>
  onChange(field: string, value: string): void
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {stepFields[step].map((f) => {
        const id = `${step}-${f.name}`
        const common = {
          id, value: values[f.name] ?? '', 'aria-invalid': !!errors[f.name], autoComplete: f.autoComplete,
          'aria-describedby': f.hint ? `${id}-hint` : undefined,
        }
        return (
          <div key={f.name} className={cn(f.wide && 'sm:col-span-2')}>
            <Field label={f.label} htmlFor={id} error={errors[f.name]}>
              {f.type === 'textarea' ? (
                <textarea {...common} className={area} onChange={(e) => onChange(f.name, e.target.value)} />
              ) : f.type === 'select' ? (
                <Select {...common} onChange={(e) => onChange(f.name, e.target.value)}>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : (
                <Input {...common} type={f.type} onChange={(e) => onChange(f.name, e.target.value)} />
              )}
            </Field>
            {f.hint && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-soft">{f.hint}</p>}
          </div>
        )
      })}
    </div>
  )
}
