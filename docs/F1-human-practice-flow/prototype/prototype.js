(function () {
  const validScreens = ['home', 'score-pre', 'score-focus', 'result', 'fundamentals', 'plan']
  const regularApp = document.getElementById('regular-app')
  const panels = Array.from(document.querySelectorAll('[data-screen]'))
  const navLinks = Array.from(document.querySelectorAll('[data-nav]'))
  const sheetBackdrop = document.getElementById('sheet-backdrop')
  const sheetBody = document.getElementById('sheet-body')
  const sheetTitle = document.getElementById('sheet-title')
  const sheetKicker = document.getElementById('sheet-kicker')
  const toast = document.getElementById('prototype-toast')
  const pauseOverlay = document.getElementById('pause-overlay')
  let toastTimer = null

  const navForScreen = {
    home: 'home',
    plan: 'plan',
    'score-pre': 'score',
    'score-focus': 'score',
    fundamentals: 'fundamentals',
    result: 'plan'
  }

  const modalCopy = {
    'practice-settings': ['练习设置', '应用到本轮'],
    'advanced-tools': ['高级工具', '曲谱练习工具'],
    'result-detail': ['详细数据', '本轮练习数据'],
    'fundamental-settings': ['练习设置', '音阶练习设置'],
    'adjust-plan': ['今日训练', '调整今天安排']
  }

  function getScreenFromHash() {
    const value = window.location.hash.replace(/^#/, '')
    return validScreens.includes(value) ? value : 'home'
  }

  function renderScreen() {
    const screen = getScreenFromHash()
    panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.screen === screen))
    regularApp.style.display = screen === 'score-focus' ? 'none' : 'grid'
    navLinks.forEach((link) => link.classList.toggle('active', link.dataset.nav === navForScreen[screen]))
    document.title = `钢琴基本功训练器 · ${screen}`
    closeSheet()
    if (screen !== 'score-focus') pauseOverlay.classList.remove('open')
  }

  function go(screen) {
    if (!validScreens.includes(screen)) return
    if (window.location.hash === `#${screen}`) renderScreen()
    else window.location.hash = screen
  }

  function showToast(message) {
    window.clearTimeout(toastTimer)
    toast.textContent = message
    toast.classList.add('show')
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1800)
  }

  function openSheet(name) {
    const template = document.getElementById(`template-${name}`)
    if (!template) return
    const copy = modalCopy[name] || ['设置', '设置']
    sheetKicker.textContent = copy[0]
    sheetTitle.textContent = copy[1]
    sheetBody.replaceChildren(template.content.cloneNode(true))
    sheetBackdrop.hidden = false
    sheetBackdrop.querySelector('.sheet-close').focus()
  }

  function closeSheet() {
    sheetBackdrop.hidden = true
    sheetBody.replaceChildren()
  }

  document.addEventListener('click', (event) => {
    const goTarget = event.target.closest('[data-go]')
    if (goTarget) {
      event.preventDefault()
      go(goTarget.dataset.go)
      return
    }

    const modalTarget = event.target.closest('[data-modal]')
    if (modalTarget) {
      openSheet(modalTarget.dataset.modal)
      return
    }

    const toastTarget = event.target.closest('[data-toast]')
    if (toastTarget) {
      event.preventDefault()
      showToast(toastTarget.dataset.toast)
    }
  })

  sheetBackdrop.addEventListener('click', (event) => {
    if (event.target === sheetBackdrop || event.target.closest('.sheet-close')) closeSheet()
    if (event.target.closest('.sheet-apply')) {
      closeSheet()
      showToast('已应用到本轮练习')
    }
  })

  document.getElementById('pause-button').addEventListener('click', () => pauseOverlay.classList.add('open'))
  document.getElementById('resume-button').addEventListener('click', () => pauseOverlay.classList.remove('open'))

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !sheetBackdrop.hidden) closeSheet()
    if (event.code === 'Space' && getScreenFromHash() === 'score-focus') {
      event.preventDefault()
      pauseOverlay.classList.toggle('open')
    }
  })

  window.addEventListener('hashchange', renderScreen)
  renderScreen()
})()
