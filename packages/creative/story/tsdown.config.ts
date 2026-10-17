import { clientBundle } from '../../../scripts/tsdown.client.ts'

export default clientBundle(import.meta.dirname, ['lib/types/index.js', 'lib/types/cli.js', 'lib/types/agent.js'])
