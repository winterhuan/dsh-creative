import { clientBundle } from '../../../scripts/tsdown.client.ts'

export default clientBundle(import.meta.dirname, ['lib/types/agent.js', 'lib/types/index.js'])
