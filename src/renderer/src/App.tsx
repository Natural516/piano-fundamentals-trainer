import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HomePage } from './components/HomePage'
import { ChordPracticePage } from './components/ChordPracticePage'
import { CoordinationPracticePage } from './components/CoordinationPracticePage'
import { FreePracticePage } from './components/FreePracticePage'
import { JudgementTestPage } from './components/JudgementTestPage'
import { MidiTestPage } from './components/MidiTestPage'
import { PlaceholderPage } from './components/PlaceholderPage'
import { PracticeHistoryPage } from './components/PracticeHistoryPage'
import { PracticeExitConfirmModal } from './components/PracticeExitConfirmModal'
import { RightInfoPanel } from './components/RightInfoPanel'
import { RhythmPracticePage } from './components/RhythmPracticePage'
import { ScalePracticePage } from './components/ScalePracticePage'
import { SettingsPage } from './components/SettingsPage'
import { Sidebar } from './components/Sidebar'
import { SightReadingPage } from './components/SightReadingPage'
import { TrainingPlanPage } from './components/TrainingPlanPage'
import { pageTitles } from './data'
import { useMidi } from './hooks/useMidi'
import { usePianoAudio } from './hooks/usePianoAudio'
import { usePracticeHistory } from './hooks/usePracticeHistory'
import type { PageId } from './types'
import {
  createPageHistoryState,
  getPageFromHash,
  getPageUrl,
  readPageHistoryState,
  type PageHistoryState
} from './utils/pageRouting'
import type { LinkedPracticeModule } from './utils/trainingPlanTypes'

const trainingModulePages: Record<LinkedPracticeModule, PageId> = {
  'sight-reading': 'sight-reading',
  rhythm: 'rhythm',
  scale: 'scales',
  chord: 'chords',
  coordination: 'coordination'
}

interface PendingPageNavigation {
  kind: 'page'
  page: PageId
}

interface PendingHistoryNavigation {
  kind: 'history'
  page: PageId
  delta: number
}

type PendingNavigation = PendingPageNavigation | PendingHistoryNavigation

function getInitialPage(): PageId {
  return getPageFromHash(window.location.hash)
}

function App(): JSX.Element {
  const [currentPage, setCurrentPage] = useState<PageId>(getInitialPage)
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null)
  const currentPageRef = useRef(currentPage)
  const practiceRunningRef = useRef(false)
  const pendingNavigationRef = useRef<PendingNavigation | null>(null)
  const currentHistoryIndexRef = useRef(readPageHistoryState(window.history.state)?.index ?? 0)
  const restoringGuardedEntryRef = useRef(false)
  const confirmedHistoryNavigationRef = useRef<PendingHistoryNavigation | null>(null)
  const bypassNextHistoryGuardRef = useRef(false)
  const midi = useMidi()
  const pianoAudio = usePianoAudio()
  const practiceHistory = usePracticeHistory()

  const currentTitle = useMemo(() => pageTitles[currentPage], [currentPage])
  const isHomePage = currentPage === 'home'

  const updatePendingNavigation = useCallback((navigation: PendingNavigation | null) => {
    pendingNavigationRef.current = navigation
    setPendingNavigation(navigation)
  }, [])

  const applyHistoryEntry = useCallback((entry: PageHistoryState) => {
    currentHistoryIndexRef.current = entry.index
    currentPageRef.current = entry.page
    setCurrentPage(entry.page)
  }, [])

  const pushPage = useCallback((page: PageId) => {
    if (page === currentPageRef.current) return
    const nextIndex = currentHistoryIndexRef.current + 1
    const nextEntry = createPageHistoryState(page, nextIndex)
    window.history.pushState(nextEntry, '', getPageUrl(page))
    applyHistoryEntry(nextEntry)
  }, [applyHistoryEntry])

  const handlePracticeRunningChange = useCallback((running: boolean) => {
    practiceRunningRef.current = running
  }, [])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    const initialPage = getPageFromHash(window.location.hash)
    const initialEntry = createPageHistoryState(initialPage, currentHistoryIndexRef.current)
    window.history.replaceState(initialEntry, '', getPageUrl(initialPage))
    applyHistoryEntry(initialEntry)

    const restoreEntry = (entry: PageHistoryState): void => {
      applyHistoryEntry(entry)

      if (bypassNextHistoryGuardRef.current) {
        bypassNextHistoryGuardRef.current = false
        updatePendingNavigation(null)
      }
    }

    const requestHistoryNavigation = (entry: PageHistoryState): void => {
      const delta = entry.index - currentHistoryIndexRef.current

      if (delta === 0 || entry.page === currentPageRef.current) {
        restoreEntry(entry)
        return
      }

      if (!practiceRunningRef.current || bypassNextHistoryGuardRef.current) {
        restoreEntry(entry)
        return
      }

      const pending = { kind: 'history', page: entry.page, delta } as const
      updatePendingNavigation(pending)
      restoringGuardedEntryRef.current = true
      window.history.go(-delta)
    }

    const handlePopState = (event: PopStateEvent): void => {
      const entry = readPageHistoryState(event.state)
      if (!entry) {
        const fallbackPage = getPageFromHash(window.location.hash)
        const fallbackEntry = createPageHistoryState(fallbackPage, currentHistoryIndexRef.current)
        window.history.replaceState(fallbackEntry, '', getPageUrl(fallbackPage))
        requestHistoryNavigation(fallbackEntry)
        return
      }

      if (restoringGuardedEntryRef.current) {
        restoringGuardedEntryRef.current = false
        applyHistoryEntry(entry)
        const confirmedNavigation = confirmedHistoryNavigationRef.current
        if (confirmedNavigation) {
          confirmedHistoryNavigationRef.current = null
          bypassNextHistoryGuardRef.current = true
          window.history.go(confirmedNavigation.delta)
        }
        return
      }

      requestHistoryNavigation(entry)
    }

    const handleHashChange = (): void => {
      const page = getPageFromHash(window.location.hash)
      const state = readPageHistoryState(window.history.state)
      if (state?.page === page) return

      const entry = createPageHistoryState(page, currentHistoryIndexRef.current + 1)
      window.history.replaceState(entry, '', getPageUrl(page))
      requestHistoryNavigation(entry)
    }

    window.addEventListener('popstate', handlePopState)
    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [applyHistoryEntry, updatePendingNavigation])

  const handleNavigate = useCallback((page: PageId) => {
    if (practiceRunningRef.current && page !== currentPageRef.current) {
      updatePendingNavigation({ kind: 'page', page })
      return
    }

    pushPage(page)
  }, [pushPage, updatePendingNavigation])

  const cancelPracticeExit = (): void => {
    confirmedHistoryNavigationRef.current = null
    updatePendingNavigation(null)
  }

  const confirmPracticeExit = (): void => {
    const navigation = pendingNavigationRef.current
    if (!navigation) return

    practiceRunningRef.current = false

    if (navigation.kind === 'page') {
      updatePendingNavigation(null)
      pushPage(navigation.page)
      return
    }

    if (restoringGuardedEntryRef.current) {
      confirmedHistoryNavigationRef.current = navigation
      return
    }

    bypassNextHistoryGuardRef.current = true
    window.history.go(navigation.delta)
  }

  return (
    <>
      <div className={`app-shell ${isHomePage ? 'is-home' : 'is-page'}`}>
        <Sidebar currentPage={currentPage} midiStatus={midi.sidebarStatus} onNavigate={handleNavigate} />
        <main className={`workspace ${isHomePage ? 'workspace-home' : 'workspace-page'}`}>
          {isHomePage ? (
          <HomePage onNavigate={handleNavigate} />
        ) : currentPage === 'settings' ? (
          <SettingsPage onBackHome={() => handleNavigate('home')} pianoAudio={pianoAudio} />
        ) : currentPage === 'records' ? (
          <PracticeHistoryPage onBackHome={() => handleNavigate('home')} />
        ) : currentPage === 'training-plan' ? (
          <TrainingPlanPage
            practiceRecords={practiceHistory.records}
            onBackHome={() => handleNavigate('home')}
            onNavigateModule={(module) => handleNavigate(trainingModulePages[module])}
          />
        ) : currentPage === 'midi-test' ? (
          <MidiTestPage midi={midi} />
        ) : currentPage === 'sight-reading' ? (
          <SightReadingPage
            activeNotes={midi.activeNotes}
            exitPromptOpen={pendingNavigation !== null}
            onPracticeRunningChange={handlePracticeRunningChange}
          />
        ) : currentPage === 'rhythm' ? (
          <RhythmPracticePage
            activeNotes={midi.activeNotes}
            exitPromptOpen={pendingNavigation !== null}
            onPracticeRunningChange={handlePracticeRunningChange}
          />
        ) : currentPage === 'scales' ? (
          <ScalePracticePage
            activeNotes={midi.activeNotes}
            exitPromptOpen={pendingNavigation !== null}
            onPracticeRunningChange={handlePracticeRunningChange}
          />
        ) : currentPage === 'chords' ? (
          <ChordPracticePage
            activeNotes={midi.activeNotes}
            exitPromptOpen={pendingNavigation !== null}
            onPracticeRunningChange={handlePracticeRunningChange}
          />
        ) : currentPage === 'coordination' ? (
          <CoordinationPracticePage
            activeNotes={midi.activeNotes}
            exitPromptOpen={pendingNavigation !== null}
            onPracticeRunningChange={handlePracticeRunningChange}
          />
        ) : currentPage === 'free-practice' ? (
          <FreePracticePage
            activeNotes={midi.activeNotes}
            exitPromptOpen={pendingNavigation !== null}
            pianoAudio={pianoAudio}
            onPracticeRunningChange={handlePracticeRunningChange}
          />
        ) : currentPage === 'metronome' ? (
          <JudgementTestPage />
        ) : (
          <PlaceholderPage title={currentTitle} onBackHome={() => handleNavigate('home')} />
        )}
        </main>
        {isHomePage ? (
          <RightInfoPanel
            recentRecords={practiceHistory.recentRecords}
            todayStats={practiceHistory.todayStats}
          />
        ) : null}
      </div>

      <PracticeExitConfirmModal
        isOpen={pendingNavigation !== null}
        onCancel={cancelPracticeExit}
        onConfirm={confirmPracticeExit}
      />
    </>
  )
}

export default App
