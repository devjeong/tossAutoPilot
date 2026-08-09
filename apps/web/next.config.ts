import type { NextConfig } from 'next'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

// 루트 .env 를 읽되, apps/web/.env.local 이 있으면 Next 기본 로더가 우선한다.
loadEnv({ path: resolve(__dirname, '../../.env') })

const nextConfig: NextConfig = {
  transpilePackages: ['@tosspilot/core', '@tosspilot/shared']
}

export default nextConfig
