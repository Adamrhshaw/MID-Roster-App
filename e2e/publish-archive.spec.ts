import { test, expect } from '@playwright/test'
import {
  createFixtureClient,
  createDraftCoveredBlock,
  createDraftGapsBlock,
  createPublishedBlock,
  createArchivedBlock,
  cleanupBlocks,
} from './helpers/db'

// ---------------------------------------------------------------------------
// Test 1: Publish a fully-covered draft (no gaps → no dialog)
// ---------------------------------------------------------------------------
test('publish fully-covered draft succeeds without dialog', async ({ page }) => {
  const db = createFixtureClient()
  const blockId = await createDraftCoveredBlock(db)

  try {
    await page.goto(`/roster/${blockId}`)
    await expect(page.getByTestId('block-status-badge')).toHaveText('draft')

    await page.getByRole('button', { name: 'Publish' }).click()

    // No dialog — wait for the page to reflect the new state
    await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()
    await expect(page.getByTestId('block-status-badge')).toHaveText('published')

    // Draft-only actions are gone
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate Draft', exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).not.toBeVisible()

    // DB confirms published_at is set
    const { data: block } = await db
      .from('roster_blocks')
      .select('status, published_at')
      .eq('id', blockId)
      .single()
    expect(block?.status).toBe('published')
    expect(block?.published_at).not.toBeNull()
  } finally {
    await cleanupBlocks(db, [blockId])
  }
})

// ---------------------------------------------------------------------------
// Test 2: Publish draft with coverage gaps — cancel keeps status draft
// ---------------------------------------------------------------------------
test('publish draft with gaps shows dialog; cancel leaves status draft', async ({ page }) => {
  const db = createFixtureClient()
  const { blockId, areaId } = await createDraftGapsBlock(db)

  try {
    await page.goto(`/roster/${blockId}`)
    await expect(page.getByTestId('block-status-badge')).toHaveText('draft')

    await page.getByRole('button', { name: 'Publish' }).click()

    // Dialog should appear with the gap heading
    await expect(page.getByRole('heading', { name: 'Publish with coverage gaps?' })).toBeVisible()

    // At least one gap row: "2099-02-03 · <area> · MORNING (0/1)"
    await expect(page.getByRole('listitem').filter({ hasText: '2099-02-03' }).first()).toBeVisible()

    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Publish with coverage gaps?' })).not.toBeVisible()
    await expect(page.getByTestId('block-status-badge')).toHaveText('draft')

    // DB unchanged
    const { data: block } = await db
      .from('roster_blocks')
      .select('status, published_at')
      .eq('id', blockId)
      .single()
    expect(block?.status).toBe('draft')
    expect(block?.published_at).toBeNull()
  } finally {
    await cleanupBlocks(db, [blockId], [areaId])
  }
})

// ---------------------------------------------------------------------------
// Test 3: Publish draft with coverage gaps — force-publish
// ---------------------------------------------------------------------------
test('publish draft with gaps and force-confirm flips status to published', async ({ page }) => {
  const db = createFixtureClient()
  const { blockId, areaId } = await createDraftGapsBlock(db)

  try {
    await page.goto(`/roster/${blockId}`)
    await expect(page.getByTestId('block-status-badge')).toHaveText('draft')

    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByRole('heading', { name: 'Publish with coverage gaps?' })).toBeVisible()

    await page.getByRole('button', { name: 'Publish anyway' }).click()

    // Dialog closes and page reflects published state
    await expect(page.getByRole('heading', { name: 'Publish with coverage gaps?' })).not.toBeVisible()
    await expect(page.getByTestId('block-status-badge')).toHaveText('published')
    await expect(page.getByRole('button', { name: 'Archive', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).not.toBeVisible()
  } finally {
    await cleanupBlocks(db, [blockId], [areaId])
  }
})

// ---------------------------------------------------------------------------
// Test 4: Archive a published block
// ---------------------------------------------------------------------------
test('archive published block — status becomes archived, no Publish/Archive buttons', async ({ page }) => {
  const db = createFixtureClient()
  const blockId = await createPublishedBlock(db)

  try {
    await page.goto(`/roster/${blockId}`)
    await expect(page.getByTestId('block-status-badge')).toHaveText('published')
    await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()

    // Open archive dialog and confirm
    await page.getByRole('button', { name: 'Archive' }).click()
    await expect(page.getByRole('heading', { name: 'Archive this block?' })).toBeVisible()
    await page.getByRole('button', { name: 'Archive block' }).click()

    // Page reflects archived state
    await expect(page.getByTestId('block-status-badge')).toHaveText('archived')
    await expect(page.getByRole('button', { name: 'Archive', exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).not.toBeVisible()

    // Block switcher shows this block with "archived" pill
    await page.getByTestId('block-switcher-trigger').click()
    await expect(
      page.getByRole('listitem').filter({ hasText: 'archived' }).first()
    ).toBeVisible()
  } finally {
    await cleanupBlocks(db, [blockId])
  }
})

// ---------------------------------------------------------------------------
// Test 6: Idempotent archive (API only — no UI)
// ---------------------------------------------------------------------------
test('POST /archive on already-archived block returns 200 with archived status', async ({ request }) => {
  const db = createFixtureClient()
  const archivedId = await createArchivedBlock(db)

  try {
    const res = await request.post(`/api/roster/${archivedId}/archive`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.block.status).toBe('archived')
  } finally {
    await cleanupBlocks(db, [archivedId])
  }
})

test('POST /archive on draft block returns 409', async ({ request }) => {
  const db = createFixtureClient()
  const draftId = await createDraftCoveredBlock(db)

  try {
    const res = await request.post(`/api/roster/${draftId}/archive`)
    expect(res.status()).toBe(409)
  } finally {
    await cleanupBlocks(db, [draftId])
  }
})
