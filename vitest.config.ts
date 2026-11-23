/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Reports contain local times; a fixed zone keeps snapshots identical on every machine.
process.env.TZ = 'UTC';

export default getViteConfig({ test: { include: ['tests/**/*.test.ts'] } });
