#!/usr/bin/env node
/** Packaged command entry; the TypeScript core owns command parsing and domain operations. */
import { main } from './cli/main.ts'

process.exitCode = await main(process.argv.slice(2))
