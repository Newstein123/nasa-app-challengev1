import { createFileRoute } from '@tanstack/react-router'
import { searchObservations } from '../../server/sia'
import { formatZodError, observationQuerySchema } from '../../server/validate'

export const Route = createFileRoute('/api/observations')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = Object.fromEntries(new URL(request.url).searchParams)
        const parsed = observationQuerySchema.safeParse(params)
        if (!parsed.success) {
          return Response.json(
            { status: 'error', kind: 'bad-request', message: formatZodError(parsed.error), retryable: false },
            { status: 400 },
          )
        }
        const result = await searchObservations(parsed.data)
        const httpStatus = result.status === 'error' ? (result.kind === 'timeout' ? 504 : 502) : 200
        return Response.json(result, { status: httpStatus })
      },
    },
  },
})
