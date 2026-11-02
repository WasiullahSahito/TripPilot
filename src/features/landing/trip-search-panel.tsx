import { zodResolver } from '@hookform/resolvers/zod'
import { Search } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { tripPurposes } from '@/config/site'
import { ROUTES } from '@/config/routes'
import { tripSearchSchema, toVisaQuery, type TripSearch } from './search-schema'

export function TripSearchPanel() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TripSearch>({
    resolver: zodResolver(tripSearchSchema),
    defaultValues: { purpose: 'Tourism' },
  })

  return (
    <Card className="p-4 sm:p-5">
      <form
        onSubmit={handleSubmit((v) => navigate(`${ROUTES.app.visa}?${toVisaQuery(v)}`))}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6"
        noValidate
        aria-label="Plan your trip"
      >
        <Field label="Destination" htmlFor="destination" error={errors.destination?.message}>
          <Input id="destination" placeholder="e.g. France" aria-invalid={!!errors.destination} {...register('destination')} />
        </Field>
        <Field label="Nationality" htmlFor="nationality" error={errors.nationality?.message}>
          <Input id="nationality" placeholder="e.g. India" aria-invalid={!!errors.nationality} {...register('nationality')} />
        </Field>
        <Field label="Departure" htmlFor="departure" error={errors.departure?.message}>
          <Input id="departure" type="date" aria-invalid={!!errors.departure} {...register('departure')} />
        </Field>
        <Field label="Return" htmlFor="returnDate" error={errors.returnDate?.message}>
          <Input id="returnDate" type="date" aria-invalid={!!errors.returnDate} {...register('returnDate')} />
        </Field>
        <Field label="Trip purpose" htmlFor="purpose" error={errors.purpose?.message}>
          <Select id="purpose" {...register('purpose')}>
            {tripPurposes.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="accent" className="w-full">
            <Search className="size-4" aria-hidden />
            Check visa path
          </Button>
        </div>
      </form>
    </Card>
  )
}
