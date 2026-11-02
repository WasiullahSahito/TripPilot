import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

export const Accordion = AccordionPrimitive.Root

export function AccordionItem({ value, question, children }: { value: string; question: string; children: ReactNode }) {
  return (
    <AccordionPrimitive.Item value={value} className="border-b border-line">
      <AccordionPrimitive.Header>
        <AccordionPrimitive.Trigger className="group flex w-full items-center justify-between gap-4 py-5 text-left text-base font-medium">
          {question}
          <ChevronDown className="size-4 shrink-0 text-ink-soft transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="pb-5 text-sm leading-relaxed text-ink-soft">{children}</AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  )
}
