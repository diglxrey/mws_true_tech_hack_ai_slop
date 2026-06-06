import { createHash } from "node:crypto"
import { Inject, Injectable } from "@nestjs/common"
import type Redis from "ioredis"

export function stableSortedQueryString(query: Record<string, string>): string {
  const keys = Object.keys(query).sort()
  return JSON.stringify(Object.fromEntries(keys.map((k) => [k, query[k]])))
}

function stableContextString(context: Record<string, string>): string {
  return stableSortedQueryString(context)
}

export function renderCacheRedisKey(slug: string, context: Record<string, string>): string {
  const payload = slug + stableContextString(context)
  const hash = createHash("sha256").update(payload).digest("hex")
  return `snippeter:render:${slug}:${hash}`
}

export function embedPageCacheKey(slug: string, query: Record<string, string>): string {
  const payload = slug + stableSortedQueryString(query)
  const hash = createHash("sha256").update(payload).digest("hex")
  return `snippeter:embed:${slug}:${hash}`
}

export function sharePageCacheKey(slug: string, query: Record<string, string>): string {
  const payload = slug + stableSortedQueryString(query)
  const hash = createHash("sha256").update(payload).digest("hex")
  return `snippeter:share:${slug}:${hash}`
}

function slugKeysSetKey(slug: string): string {
  return `snippeter:keys:${slug}`
}

@Injectable()
export class RenderCacheService {
  constructor(@Inject("REDIS") private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key)
  }

  async set(key: string, ttlSeconds: number, body: string): Promise<void> {
    if (ttlSeconds <= 0) return
    const pipeline = this.redis.pipeline()
    pipeline.setex(key, ttlSeconds, body)
    // Track key in the slug's key-set so we can invalidate without SCAN
    const slug = this.extractSlugFromKey(key)
    if (slug) {
      const setKey = slugKeysSetKey(slug)
      pipeline.sadd(setKey, key)
      // Keep the set alive at least as long as the longest possible TTL
      pipeline.expire(setKey, ttlSeconds + 60)
    }
    await pipeline.exec()
  }

  async invalidateSlug(slug: string): Promise<void> {
    const setKey = slugKeysSetKey(slug)
    const keys = await this.redis.smembers(setKey)
    if (keys.length > 0) {
      await this.redis.del(...keys, setKey)
    } else {
      await this.redis.del(setKey)
    }
  }

  /** Track a cache key under an arbitrary group for later bulk invalidation. */
  async trackInGroup(groupKey: string, cacheKey: string, ttlSeconds: number): Promise<void> {
    const pipeline = this.redis.pipeline()
    pipeline.sadd(groupKey, cacheKey)
    pipeline.expire(groupKey, ttlSeconds + 60)
    await pipeline.exec()
  }

  /** Invalidate all keys previously tracked under a group key. */
  async invalidateGroup(groupKey: string): Promise<void> {
    const keys = await this.redis.smembers(groupKey)
    if (keys.length > 0) {
      await this.redis.del(...keys, groupKey)
    } else {
      await this.redis.del(groupKey)
    }
  }

  private extractSlugFromKey(key: string): string | null {
    // Key format: snippeter:{render|embed|share}:{slug}:{hash}
    const parts = key.split(":")
    if (parts.length >= 3) return parts[2] ?? null
    return null
  }
}
