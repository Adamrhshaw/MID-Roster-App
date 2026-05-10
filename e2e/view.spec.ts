/**
 * /view visibility rules
 *
 * Prerequisite: supabase/migrations/002_anon_view_policy.sql must be applied
 * so the anon Supabase key can read published roster_blocks.
 * Run: npx supabase db push  (or apply the migration manually in the dashboard)
 */
import { test, expect } from '@playwright/test'
import {
  createFixtureClient,
  createDraftCoveredBlock,
  createPublishedBlock,
  createArchivedBlock,
  cleanupBlocks,
} from './helpers/db'

test('GET /view/<publishedId> returns 200 and shows block label in header', async ({ page }) => {
  const db = createFixtureClient()
  const blockId = await createPublishedBlock(db)

  // Fetch the block name so we can assert on it
  const { data: block } = await db
    .from('roster_blocks')
    .select('name')
    .eq('id', blockId)
    .single()
  const blockLabel = block?.name as string

  try {
    const response = await page.goto(`/view/${blockId}`)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: blockLabel })).toBeVisible()
  } finally {
    await cleanupBlocks(db, [blockId])
  }
})

test('GET /view/<draftId> returns 404', async ({ page }) => {
  const db = createFixtureClient()
  const blockId = await createDraftCoveredBlock(db)

  try {
    const response = await page.goto(`/view/${blockId}`)
    expect(response?.status()).toBe(404)
  } finally {
    await cleanupBlocks(db, [blockId])
  }
})

test('GET /view/<archivedId> returns 404', async ({ page }) => {
  const db = createFixtureClient()
  const blockId = await createArchivedBlock(db)

  try {
    const response = await page.goto(`/view/${blockId}`)
    expect(response?.status()).toBe(404)
  } finally {
    await cleanupBlocks(db, [blockId])
  }
})

test('GET /view redirects to most recent published block', async ({ page }) => {
  const db = createFixtureClient()
  // Block with a far-future start date so it sorts as most recent
  const { data: block, error } = await db
    .from('roster_blocks')
    .insert({
      name: `__e2e_view_redirect_${crypto.randomUUID()}__`,
      start_date: '2099-12-01',
      end_date: '2099-12-28',
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error || !block) throw new Error(`view redirect fixture: ${error?.message}`)
  const blockId = block.id as string

  try {
    await page.goto('/view')
    await page.waitForURL(`/view/${blockId}`)
    expect(page.url()).toContain(`/view/${blockId}`)
  } finally {
    await cleanupBlocks(db, [blockId])
  }
})
