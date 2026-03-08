import type { Region } from '../types'

/**
 * Region prefix mapping
 * cn (China) has no prefix, other regions use their code as prefix
 */
const REGION_PREFIXES: Record<Region, string> = {
  cn: '',
  us: 'us-',
  hk: 'hk-',
  jp: 'jp-',
  sg: 'sg-',
}

/**
 * 去掉 sessionId 上已有的区域前缀，避免与当前 region 叠加成 us-us-xxx 导致即梦 check login error
 */
export function stripRegionPrefix(sessionId: string): string {
  return sessionId.replace(/^(us|hk|jp|sg)-/i, '')
}

/**
 * Formats the authorization header with the appropriate region prefix
 * @param sessionId - The user's session ID（可能已含 us-/hk- 等前缀，会先被去掉再按 region 加前缀）
 * @param region - The selected region
 * @returns Formatted authorization header value
 */
export function formatAuthHeader(sessionId: string, region: Region): string {
  const raw = stripRegionPrefix(sessionId)
  const prefix = REGION_PREFIXES[region]
  return `Bearer ${prefix}${raw}`
}

/**
 * Gets the region prefix for a given region
 * @param region - The selected region
 * @returns The prefix string (empty for cn)
 */
export function getRegionPrefix(region: Region): string {
  return REGION_PREFIXES[region]
}
