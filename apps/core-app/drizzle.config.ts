import type { Config } from 'drizzle-kit'

export default {
  schema: './src/main/db/schema.ts',
  out: './resources/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './tuff/modules/database/database.db',
  },
} satisfies Config
