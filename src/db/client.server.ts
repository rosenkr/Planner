import postgres from 'postgres'
import { existsSync } from 'node:fs'

let pool: postgres.Sql | undefined

export function database() {
  if (!pool) {
    if (!process.env.DATABASE_URL && existsSync('.env')) process.loadEnvFile('.env')
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('Set DATABASE_URL to connect to the Planner database.')
    pool = postgres(url, { idle_timeout: 20, connect_timeout: 5 })
  }
  return pool
}
