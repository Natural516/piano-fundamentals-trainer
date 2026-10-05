const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { chromium } = require('@playwright/test')

const root = path.resolve(__dirname, '..')
const baseUrl = process.env.HOME_UI_QA_URL || 'http://127.0.0.1:4185'
const output = process.argv[2]
const contractsOnly = process.argv.includes('--contracts-only')
if (!output) throw new Error('Provide the per-task report directory; start prototype:android on port 4185 first')
fs.mkdirSync(output, { recursive: true })
const source = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const home = source.slice(source.indexOf('function HomeScreen'), source.indexOf('function PracticeHubScreen'))
const homeCode = ts.transpileModule(`${home}\nexports.Home = HomeScreen`, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename
}).outputText, filename)
const { I18nextProvider, useTranslation } = require('react-i18next')
const { createLocalizationInstance } = require('../prototype/android-tablet-v1/src/localization/localizationService.ts')
const { presentHomeRecentPractice } = require('../prototype/android-tablet-v1/src/localization/homePresentation.ts')

// The loading case renders the actual Home component with its real readiness prop.
// Only surrounding dependencies/data are fixtures; no substitute UI or product hook is shipped.
function loadingMarkup() {
  const exports = {}
  new Function('require', 'exports', 'useMidiUi', 'useAppNavigation', 'presentLocalizedMidiStatus', 'useEffect', 'projectMixedPracticeHistory', 'ProductFrame', 'Icon', 'navigate', 'NotationPaper', 'spellMidiPitch', 'useTranslation', 'presentHomeRecentPractice', homeCode)(
    require, exports, () => ({ runtime: { historySnapshot: { status: 'ready', records: [] }, refreshHistory() {} } }),
    () => ({ openAuxiliary() {} }), () => ({ label: 'MIDI 未连接', detail: '请选择设备', tone: 'idle' }), React.useEffect,
    () => [], ({ children }) => React.createElement('main', null, children), () => React.createElement('svg'), () => {},
    () => React.createElement('div', { className: 'notation-paper' }), () => ({}), useTranslation, presentHomeRecentPractice
  )
  return renderToStaticMarkup(React.createElement(I18nextProvider, { i18n: createLocalizationInstance('zh-CN') }, React.createElement(exports.Home, {
    chordHistory: { status: 'ready', records: [] }, chordPersistence: { refresh() {} }, intervalSettingsReady: false,
    settings: { staffMode: 'grand', keySignature: 'C' }, theme: { capabilities: { homeVisual: { kind: 'standard' } } }
  })))
}

const viewports = [
  { width: 1385, height: 866, name: 'reference' },
  { width: 1024, height: 768, name: 'narrow' },
  { width: 1280, height: 600, name: 'low' }
]
const themes = ['light', 'dark', 'bocchi-1.0-fallback', 'bocchi-1.1']
const records = []
async function run() {
  let browser
  let completed = 0
  try {
    assert.match(home, /disabled=\{!intervalSettingsReady\}/)
    assert.match(home, /navigate\('interval-practice'\)/)
    assert.doesNotMatch(home, /navigate\('interval-active'\)|answerTimeLimitSeconds|每题固定|STAFF_MODE_LABELS/)
    assert.match(home, /keySignature=\{settings.keySignature\}/)
    assert.match(source, /case 'home': return <HomeScreen[^\n]*intervalSettingsReady=\{intervalSettingsReady\}/)
    completed++
    console.log('PASS Home routing, readiness wiring and preview settings contracts')
    if (contractsOnly) {
      const markup = loadingMarkup()
      const section = markup.match(/<div class="home-practice-actions">([\s\S]*?)<\/div>/)[1]
      const actions = [...section.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0])
      assert.equal(actions.length, 3)
      assert.match(actions[2], /disabled=""/)
      assert.match(actions[2], /音程练习/)
      assert.doesNotMatch(actions[0] + actions[1], /disabled=""/)
      assert.doesNotMatch(home, /homeSettingsSummary|home-training-summary/)
      completed++
      console.log('PASS actual localized Home component loading prop keeps disabled Interval entry and three peer CTAs')
      console.log('2/2 Home non-browser contracts PASS')
      console.log('HOME BROWSER VALIDATION BLOCKED; HOME MULTI-VIEWPORT VALIDATION BLOCKED; 12 browser matrix cases NOT RUN')
      return
    }
    browser = await chromium.launch({ headless: true })
    const loadingPage = await browser.newPage()
    await loadingPage.setContent(loadingMarkup())
    const loadingButton = loadingPage.getByRole('button', { name: '音程练习', exact: true })
    assert.equal(await loadingButton.isEnabled(), false)
    assert.equal(await loadingPage.locator('.home-practice-actions > button').count(), 3)
    await loadingPage.getByRole('button', { name: '和弦练习', exact: true }).focus()
    await loadingPage.keyboard.press('Tab')
    assert.notEqual(await loadingPage.evaluate(() => document.activeElement.textContent.trim()), '音程练习')
    await loadingPage.close(); completed++
    console.log('PASS actual Home component loading prop renders disabled, non-focusable Interval entry')

    for (const viewport of viewports) for (const theme of themes) {
      const page = await browser.newPage({ viewport })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      if (theme === 'bocchi-1.0-fallback') {
        await page.route('**/__theme_source__/bocchi/manifest.json', async route => {
          const response = await route.fetch(); const manifest = await response.json()
          manifest.version = '1.0.0'; manifest.minAppVersion = '1.5.3'
          await route.fulfill({ json: manifest })
        })
        await page.route('**/__theme_source__/bocchi/theme.json', async route => {
          const response = await route.fetch(); const definition = await response.json()
          delete definition.capabilities.intervalPracticeVisual
          await route.fulfill({ json: definition })
        })
      }
      await page.goto(`${baseUrl}/?theme=${['light', 'dark'].includes(theme) ? theme : 'natural516.bocchi'}#home`, { waitUntil: 'networkidle' })
      await page.locator('.home-practice-actions').waitFor()
      await page.evaluate(() => document.fonts.ready)
      const actions = page.locator('.home-practice-actions')
      assert.equal(await actions.locator('button').count(), 3)
      assert.deepEqual((await actions.locator('button').allTextContents()).map(t => t.trim()), ['识谱练习', '和弦练习', '音程练习'])
      assert.equal(await page.locator('.home-hero__copy > p').count(), 0, 'no settings-summary DOM or empty placeholder')
      assert.equal(await page.locator('.home-hero__copy > h1').count(), 1, 'original hero heading remains')
      const themed = theme.startsWith('bocchi')
      assert.equal(await page.locator('.themed-home-hero__art').count(), Number(themed))
      if (themed) assert.equal(await page.locator('.tablet-app').getAttribute('data-runtime-theme-version'), theme === 'bocchi-1.1' ? '1.1.0' : '1.0.0')
      const geometry = await page.evaluate(() => {
        const box = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
        const buttons = [...document.querySelectorAll('.home-practice-actions > button')]
        return {
          viewport: { width: innerWidth, height: innerHeight },
          overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
          hero: box(document.querySelector('.home-hero')), heading: box(document.querySelector('.home-hero__copy h1')),
          actions: box(document.querySelector('.home-practice-actions')),
          buttons: buttons.map(button => ({ ...box(button), className: button.className, hit: document.elementFromPoint(box(button).left + box(button).width / 2, box(button).top + box(button).height / 2)?.closest('button') === button })),
          brokenImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).length,
          themeSource: document.documentElement.dataset.themeSource
        }
      })
      const stem = `${theme}-${viewport.width}x${viewport.height}`
      await page.screenshot({ path: path.join(output, `${stem}-home.png`), animations: 'disabled' })
      records.push({ theme, viewport, geometry, screenshot: `${stem}-home.png`, result: 'RUNNING' })
      assert.equal(geometry.overflow, false, `${stem}: document overflow`)
      assert.equal(geometry.brokenImages, 0)
      assert.ok(geometry.hero.bottom <= viewport.height - 50, `${stem}: hero collides with navigation`)
      for (const button of geometry.buttons) {
        assert.ok(button.left >= geometry.hero.left && button.right <= geometry.hero.right, `${stem}: horizontal clipping`)
        assert.ok(button.top >= geometry.heading.bottom - 1 && button.bottom <= geometry.hero.bottom, `${stem}: heading/hero clipping`)
        assert.ok(button.width >= 100 && button.height >= 40 && button.hit, `${stem}: touch target not usable`)
        assert.equal(button.className, geometry.buttons[0].className, 'equal-level entry presentation')
      }
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        const a = geometry.buttons[i], b = geometry.buttons[j]
        assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `${stem}: buttons overlap`)
      }
      assert.ok(geometry.actions.top - geometry.heading.bottom < 48, `${stem}: dead summary whitespace`)
      const sight = actions.getByRole('button', { name: '识谱练习', exact: true })
      await sight.focus(); await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), '和弦练习')
      await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), '音程练习')
      const interval = actions.getByRole('button', { name: '音程练习', exact: true })
      assert.equal(await interval.isEnabled(), true)
      await interval.press('Enter'); await page.locator('.interval-ready-layout').waitFor()
      assert.equal(new URL(page.url()).hash, '#interval-practice')
      assert.equal(await page.locator('.interval-focus-frame').count(), 0)
      await page.goto(`${baseUrl}/?theme=${['light', 'dark'].includes(theme) ? theme : 'natural516.bocchi'}#home`, { waitUntil: 'networkidle' })
      await page.locator('.home-practice-actions').getByRole('button', { name: '识谱练习', exact: true }).click()
      assert.equal(new URL(page.url()).hash, '#sight-ready')
      await page.goto(`${baseUrl}/?theme=${['light', 'dark'].includes(theme) ? theme : 'natural516.bocchi'}#home`, { waitUntil: 'networkidle' })
      await page.locator('.home-practice-actions').getByRole('button', { name: '和弦练习', exact: true }).click()
      assert.equal(new URL(page.url()).hash, '#chord-mode-select')
      assert.deepEqual(errors, [])
      records.at(-1).result = 'PASS'; completed++; await page.close()
      console.log(`PASS ${stem}: geometry, hierarchy, assets, keyboard focus and all three routes`)
    }
    console.log(`${completed}/14 Home contract and layout cases PASS; 0 skipped`)
  } catch (error) {
    console.error(error.stack); process.exitCode = 1
  } finally {
    fs.writeFileSync(path.join(output, 'home-generalization-results.json'), JSON.stringify({ completed, expected: 14, mode: contractsOnly ? 'contracts-only' : 'full-browser', browserMatrix: contractsOnly ? 'BLOCKED_NOT_RUN' : 'ATTEMPTED', browserCasesNotRun: contractsOnly ? 12 : undefined, records }, null, 2))
    await browser?.close()
  }
}
void run()
