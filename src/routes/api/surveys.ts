import { createFileRoute } from '@tanstack/react-router'
import { SURVEYS } from '../../lib/surveys'

export const Route = createFileRoute('/api/surveys')({
  server: {
    handlers: {
      GET: () => Response.json({ surveys: SURVEYS }),
    },
  },
})
