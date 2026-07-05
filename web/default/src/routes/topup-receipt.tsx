import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { TopUpReceiptPage } from '@/features/topup-receipt'

const searchSchema = z.object({
  trade_no: z.string().optional(),
})

export const Route = createFileRoute('/topup-receipt')({
  validateSearch: searchSchema,
  component: TopUpReceiptPage,
})
