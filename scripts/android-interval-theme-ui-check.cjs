const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('@playwright/test')
const { PNG } = require(path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'))
function changedPixels(before, after) {
  const a = PNG.sync.read(before), b = PNG.sync.read(after)
  assert.equal(a.width, b.width); assert.equal(a.height, b.height)
  let changed = 0
  for (let i = 0; i < a.data.length; i += 4) if ([0, 1, 2, 3].some((channel) => a.data[i + channel] !== b.data[i + channel])) changed++
  return changed
}

// Dedicated visual QA; transient fixtures intercepted in the test, never shipped.
const baseUrl = process.env.INTERVAL_THEME_QA_URL || 'http://127.0.0.1:4185'
const output = process.argv[2]
if (!output) throw new Error('Provide the per-task report directory')
fs.mkdirSync(output, { recursive: true })
const records = []
async function run() {
  const browser = await chromium.launch({ headless: true })
  try {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1385, height: 866 }, { width: 1280, height: 800 }, { width: 2944, height: 1840 }]) {
      let baselineGeometry
      for (const fixture of ['light', 'dark', 'old', 'empty', 'no-hub', 'no-active', 'bocchi']) {
        for (const answerHint of [false, true]) {
        const page = await browser.newPage({ viewport })
        const emit = (kind) => page.evaluate((kind) => {
          const node = document.querySelector('.interval-focus-frame')
          let fiber = node[Object.keys(node).find((key) => key.startsWith('__reactFiber$'))]
          while (fiber && !(fiber.memoizedProps?.runtime?.handleMidi && fiber.memoizedProps?.midiRuntime?.midiRouter)) fiber = fiber.return
          if (!fiber) throw new Error('Existing ACTIVE runtime not found')
          const { runtime, midiRuntime } = fiber.memoizedProps
          const question = runtime.snapshot.question
          const correct = [...new Set([question.rootMidi, question.targetMidi])]
          let wrong = question.rootMidi + 1
          while (correct.includes(wrong)) wrong++
          const notes = kind.includes('wrong') ? [wrong, question.rootMidi] : correct
          const type = kind.includes('release') ? 'noteOff' : 'noteOn'
          notes.forEach((midiNumber) => midiRuntime.midiRouter.emit('development', { type, midiNumber, velocity: type === 'noteOn' ? 96 : 0 }))
        }, kind)
        const errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        if (!['light', 'dark', 'bocchi'].includes(fixture)) await page.route('**/__theme_source__/bocchi/theme.json', async (route) => {
          const response = await route.fetch(); const theme = await response.json()
          if (fixture === 'old') delete theme.capabilities.intervalPracticeVisual
          else if (fixture === 'empty') theme.capabilities.intervalPracticeVisual.assets = {}
          else delete theme.capabilities.intervalPracticeVisual.assets[fixture === 'no-hub' ? 'hubCardCollage' : 'activeBorder']
          await route.fulfill({ json: theme })
        })
        const theme = ['light', 'dark'].includes(fixture) ? fixture : 'natural516.bocchi'
        await page.goto(`${baseUrl}/?theme=${theme}#practice`, { waitUntil: 'networkidle' })
        const card = page.locator('.interval-practice-card')
        const hasHub = ['bocchi', 'no-active'].includes(fixture)
        const hasActive = ['bocchi', 'no-hub'].includes(fixture)
        assert.equal(await card.locator('img').count(), Number(hasHub))
        assert.equal(await card.locator('.interval-notebook-card__action').count(), Number(hasHub))
        if (hasHub) {
          assert.equal(await card.locator('em').textContent(), '指定低音构造 · 26 种音程')
          const widths = await card.evaluate((node) => ({ card: node.clientWidth, cta: node.querySelector('.interval-notebook-card__action').clientWidth }))
          assert.ok(widths.cta >= widths.card - 48, 'full bottom CTA')
        }
        assert.doesNotMatch(await card.textContent(), /复现 \/ 构造/)
        const stem = `${fixture}-${viewport.width}x${viewport.height}-hint-${answerHint ? 'on' : 'off'}`
        if (['bocchi', 'light', 'dark'].includes(fixture)) await page.screenshot({ path: path.join(output, `${stem}-hub.png`) })
        await card.click()
        await page.locator('.interval-ready-layout').waitFor()
        assert.equal(await page.getByText('练习方式', { exact: true }).count(), 0)
        if (answerHint) await page.getByRole('button', { name: '答案提示已关闭', exact: true }).click()
        assert.equal(await page.locator('.interval-notebook-border, .interval-notebook-card__art').count(), 0, 'Preparation has no dedicated artwork')
        await page.locator('.review-dock__trigger').click()
        await page.getByRole('button', { name: '开发模拟 MIDI', exact: true }).click()
        await page.getByRole('button', { name: '关闭状态列表', exact: true }).click()
        await page.locator('.interval-start-button').click()
        await page.locator('.interval-focus-stage .notation-paper svg').waitFor()
        await page.waitForTimeout(150)
        assert.equal(await page.locator('.interval-notebook-border').count(), Number(hasActive))
        assert.equal(await page.locator('.interval-notebook-anchor').count(), hasActive ? 4 : 0)
        if (hasActive) {
          const sources = await page.locator('.interval-notebook-anchor img, .interval-notebook-border').evaluateAll((images) => [...new Set(images.map((image) => image.getAttribute('src')))])
          assert.equal(sources.length, 1, 'all five images reuse the single active-border URL')
          assert.match(sources[0], /active-border\.png/)
        }
        assert.equal(await page.locator('.interval-focus-frame .chord-stage-prompt, .interval-progress-footer').count(), 0, 'removed DOM, no hidden cards')
        assert.equal(await page.locator('.interval-focus-header .midi-status').count(), 1)
        assert.match(await page.locator('.interval-focus-prompt strong').textContent(), /^请按出以 [A-G][♯♭]?\d 为低音的.+音程$/)
        assert.match(await page.locator('.interval-focus-prompt__identity small').textContent(), /^已完成 0 \/ 20$/)
        const root = (await page.locator('.interval-focus-prompt strong').textContent()).match(/以 (.+) 为低音/)[1]
        const aria = await page.locator('.music-staff-renderer').getAttribute('aria-label')
        assert.ok(aria.includes(answerHint ? `${root} 与 ` : `低音 ${root}`), 'written root and octave agree with the staff')
        const audit = await page.evaluate(() => {
          const rect = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
          const paper = document.querySelector('.notation-paper')
          const image = document.querySelector('.interval-notebook-border-clip')
          return {
            geometry: { stage: rect('.interval-focus-stage'), paper: rect('.notation-paper'), svg: rect('.notation-paper svg') },
            paperColor: getComputedStyle(paper).backgroundColor,
            imageClip: image ? getComputedStyle(image).clipPath : null,
            imageSize: image ? [image.clientWidth, image.clientHeight] : null,
            frame: rect('.interval-focus-frame'),
            brokenImages: [...document.images].filter((img) => !img.complete || !img.naturalWidth).length,
            emptyImages: [...document.images].filter((img) => !img.getAttribute('src')).length,
            overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
            question: document.querySelector('.interval-focus-prompt').textContent,
            foreground: [...document.querySelectorAll('.interval-notebook-anchor')].map((node) => ({ corner: node.className, src: node.querySelector('img').getAttribute('src'), opacity: getComputedStyle(node.querySelector('img')).opacity }))
          }
        })
        // Notation height is independent of question pitch and theme; SVG width may be pitch-dependent.
        if (fixture === 'light' && !answerHint) baselineGeometry = audit.geometry
        assert.deepEqual(audit.geometry, baselineGeometry, 'theme and hints must not change stage, paper or SVG geometry')
        assert.equal(audit.paperColor, 'rgb(255, 255, 255)')
        assert.equal(audit.brokenImages + audit.emptyImages, 0)
        assert.equal(audit.overflow, false)
        if (hasActive) {
          assert.match(audit.imageClip, /^polygon\(evenodd/)
          const numbers = audit.imageClip.match(/-?\d+(?:\.\d+)?px/g).map(Number.parseFloat)
          const left = numbers[10], top = numbers[11], right = numbers[12], bottom = numbers[15]
          const stage = audit.geometry.stage
          assert.ok(left <= stage.x - audit.frame.x - 7.9 && right >= stage.x - audit.frame.x + stage.width + 7.9)
          assert.ok(top <= stage.y - audit.frame.y - 7.9 && bottom >= stage.y - audit.frame.y + stage.height + 7.9)
          assert.equal(await page.locator('.interval-notebook-foreground-clip').evaluate((node) => getComputedStyle(node).clipPath), audit.imageClip)
          assert.ok(audit.foreground.every((node) => node.opacity === '1'))
          audit.foregroundPixelCounts = {}
          for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
            const clip = await page.locator(`.interval-notebook-anchor.is-${corner}`).boundingBox()
            const visible = await page.screenshot({ clip })
            await page.locator('.interval-notebook-foreground-clip').evaluate((node) => { node.style.visibility = 'hidden' })
            const hidden = await page.screenshot({ clip })
            const count = changedPixels(visible, hidden)
            assert.ok(count > 1000, `${corner} must contribute actual foreground pixels: ${count}`)
            audit.foregroundPixelCounts[corner] = count
            await page.locator('.interval-notebook-foreground-clip').evaluate((node) => { node.style.removeProperty('visibility') })
          }
          // Keep notation geometry, temporarily hide ink in both samples to avoid
          // SVG glyph subpixel-AA changes when Chromium recomposites an image layer.
          await page.locator('.notation-paper svg').evaluate((svg) => { svg.style.visibility = 'hidden' })
          const painted = await page.locator('.interval-focus-stage').screenshot({ animations: 'disabled' })
          await page.locator('.interval-notebook-border-clip, .interval-notebook-foreground-clip').evaluateAll((layers) => { layers.forEach((layer) => { layer.style.visibility = 'hidden' }) })
          const hidden = await page.locator('.interval-focus-stage').screenshot({ animations: 'disabled' })
          if (!painted.equals(hidden)) {
            fs.writeFileSync(path.join(output, `${stem}-paper-border-on.png`), painted)
            fs.writeFileSync(path.join(output, `${stem}-paper-border-off.png`), hidden)
          }
          assert.ok(painted.equals(hidden), `zero artwork pixels inside protected stage: ${stem}`)
          await page.locator('.interval-notebook-border-clip, .interval-notebook-foreground-clip').evaluateAll((layers) => { layers.forEach((layer) => { layer.style.removeProperty('visibility') }) })
          await page.locator('.notation-paper svg').evaluate((svg) => { svg.style.removeProperty('visibility') })
          audit.protectedPaperSurfacePixelExact = true
          audit.foregroundSafety = await page.evaluate(() => {
            const frame = document.querySelector('.interval-focus-frame').getBoundingClientRect()
            const nodes = [...document.querySelectorAll('.interval-focus-prompt__identity, .interval-focus-prompt > strong, .interval-focus-feedback')].map((node) => node.getBoundingClientRect())
            const dock = document.querySelector('.review-dock').getBoundingClientRect()
            return {
              text: { left: Math.min(...nodes.map((r) => r.left)) - frame.left - 10, top: Math.min(...nodes.map((r) => r.top)) - frame.top - 10, right: Math.max(...nodes.map((r) => r.right)) - frame.left + 10, bottom: Math.max(...nodes.map((r) => r.bottom)) - frame.top + 10 },
              dock: { left: dock.left - frame.left - 12, top: dock.top - frame.top - 12, right: dock.right - frame.left + 12, bottom: dock.bottom - frame.top + 12 },
              textClip: getComputedStyle(document.querySelector('.interval-notebook-text-safe')).clipPath,
              dockClip: getComputedStyle(document.querySelector('.interval-notebook-dock-safe')).clipPath
            }
          })
          for (const kind of ['text', 'dock']) {
            const n = audit.foregroundSafety[`${kind}Clip`].match(/-?\d+(?:\.\d+)?px/g).map(Number.parseFloat)
            for (const [i, side] of [[10, 'left'], [11, 'top'], [12, 'right'], [15, 'bottom']]) assert.ok(Math.abs(n[i] - audit.foregroundSafety[kind][side]) < .1, `${kind} safe hole`)
          }
          await page.setViewportSize({ width: viewport.width - 30, height: viewport.height - 20 })
          await page.waitForTimeout(100)
          const resized = await page.evaluate(() => {
            const frame = document.querySelector('.interval-focus-frame').getBoundingClientRect()
            const stage = document.querySelector('.interval-focus-stage').getBoundingClientRect()
            const clip = getComputedStyle(document.querySelector('.interval-notebook-border-clip')).clipPath
            return { clip, left: stage.left - frame.left - 8, top: stage.top - frame.top - 8, right: stage.right - frame.left + 8, bottom: stage.bottom - frame.top + 8 }
          })
          const resizedNumbers = resized.clip.match(/-?\d+(?:\.\d+)?px/g).map(Number.parseFloat)
          assert.ok(Math.abs(resizedNumbers[10] - resized.left) < .1 && Math.abs(resizedNumbers[11] - resized.top) < .1)
          assert.ok(Math.abs(resizedNumbers[12] - resized.right) < .1 && Math.abs(resizedNumbers[15] - resized.bottom) < .1)
          audit.resizeObserverUpdated = true
          await page.setViewportSize(viewport)
          await page.waitForTimeout(100)
        }
        if (['bocchi', 'light', 'dark'].includes(fixture)) await page.screenshot({ path: path.join(output, `${stem}-active.png`) })
        audit.states = []
        async function checkState(state) {
          await page.waitForTimeout(100)
          const stateAudit = await page.evaluate(() => {
            const rect = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
            return { geometry: { stage: rect('.interval-focus-stage'), paper: rect('.notation-paper'), svg: rect('.notation-paper svg') }, overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight, anchors: document.querySelectorAll('.interval-notebook-anchor').length, feedback: document.querySelector('.interval-focus-feedback').textContent }
          })
          assert.equal(stateAudit.overflow, false)
          assert.deepEqual(stateAudit.geometry, audit.geometry)
          assert.equal(stateAudit.anchors, hasActive ? 4 : 0)
          if (hasActive) {
            await page.locator('.notation-paper svg').evaluate((svg) => { svg.style.visibility = 'hidden' })
            const protectedBefore = await page.locator('.interval-focus-stage').screenshot({ animations: 'disabled' })
            await page.locator('.interval-notebook-border-clip, .interval-notebook-foreground-clip').evaluateAll((layers) => { layers.forEach((node) => { node.style.visibility = 'hidden' }) })
            const protectedAfter = await page.locator('.interval-focus-stage').screenshot({ animations: 'disabled' })
            assert.equal(changedPixels(protectedBefore, protectedAfter), 0, `${state} has no decoration pixels in stage`)
            await page.locator('.interval-notebook-border-clip, .interval-notebook-foreground-clip').evaluateAll((layers) => { layers.forEach((node) => { node.style.removeProperty('visibility') }) })
            await page.locator('.notation-paper svg').evaluate((svg) => { svg.style.removeProperty('visibility') })
            stateAudit.protectedStagePixelExact = true
          }
          audit.states.push({ state, ...stateAudit })
          if (fixture === 'bocchi') await page.screenshot({ path: path.join(output, `${stem}-${state}.png`) })
        }
        if (fixture === 'bocchi') {
          await emit('wrong')
          await page.locator('.interval-focus-stage.has-wrong_note').waitFor()
          await checkState('wrong')
          await emit('wrong-release')
          await emit('correct')
          await page.locator('.interval-focus-stage.has-correct').waitFor()
          await checkState('success')
          await emit('correct-release')
          await page.waitForTimeout(850)
        }
        await page.getByRole('button', { name: '暂停', exact: true }).click()
        assert.equal(await page.locator('.interval-pause-overlay').count(), 1)
        assert.equal(await page.locator('.interval-notebook-border').count(), Number(hasActive), 'Pause reuses ACTIVE shell, adds no artwork')
        assert.equal(await page.locator('.interval-notebook-anchor').count(), hasActive ? 4 : 0)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false)
        await checkState('paused')
        if (fixture === 'bocchi') {
          await page.getByRole('button', { name: '继续', exact: true }).click()
          await page.locator('.review-dock__trigger').click()
          await page.getByRole('button', { name: '真实蓝牙 MIDI', exact: true }).click()
          await page.getByRole('button', { name: '关闭状态列表', exact: true }).click()
          await page.locator('.interval-pause-overlay').waitFor()
          await checkState('midi-disconnected')
          assert.match(audit.states.at(-1).feedback, /MIDI 已断开/)
        }
        assert.deepEqual(errors, [])
        records.push({ fixture, viewport, answerHint, hasHub, hasActive, ...audit })
        await page.close()
        console.log(`PASS ${stem} Hub / Preparation / ACTIVE / Pause / fallback / paper exclusion`)
        }
      }
    }
  } finally { await browser.close() }
  fs.writeFileSync(path.join(output, 'interval-theme-ui-results.json'), JSON.stringify({ status: 'PASS', records }, null, 2))
  console.log(`${records.length}/${records.length} visual cases PASS`)
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
