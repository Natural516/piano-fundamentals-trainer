import { useMemo, useState } from 'react'
import { HomePage } from './components/HomePage'
import { ChordPracticePage } from './components/ChordPracticePage'
import { CoordinationPracticePage } from './components/CoordinationPracticePage'
import { JudgementTestPage } from './components/JudgementTestPage'
import { MidiTestPage } from './components/MidiTestPage'
import { PlaceholderPage } from './components/PlaceholderPage'
import { PracticeHistoryPage } from './components/PracticeHistoryPage'
import { RightInfoPanel } from './components/RightInfoPanel'
import { RhythmPracticePage } from './components/RhythmPracticePage'
import { ScalePracticePage } from './components/ScalePracticePage'
import { Sidebar } from './components/Sidebar'
import { SightReadingPage } from './components/SightReadingPage'
import { pageTitles } from './data'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useMidi } from './hooks/useMidi'
import { usePracticeHistory } from './hooks/usePracticeHistory'
import type { PageId } from './types'

function App(): JSX.Element {
  const [currentPage, setCurrentPage] = useState<PageId>('home')
  const midi = useMidi()
  const audioEngine = useAudioEngine(midi.latestEvent)
  const practiceHistory = usePracticeHistory()

  const currentTitle = useMemo(() => pageTitles[currentPage], [currentPage])
  const isHomePage = currentPage === 'home'

  return (
    <div className={`app-shell ${isHomePage ? 'is-home' : 'is-page'}`}>
      <Sidebar currentPage={currentPage} midiStatus={midi.sidebarStatus} audioEngine={audioEngine} onNavigate={setCurrentPage} />
      <main className={`workspace ${isHomePage ? 'workspace-home' : 'workspace-page'}`}>
        {isHomePage ? (
          <HomePage onNavigate={setCurrentPage} todayStats={practiceHistory.todayStats} />
        ) : currentPage === 'records' ? (
          <PracticeHistoryPage onBackHome={() => setCurrentPage('home')} />
        ) : currentPage === 'midi-test' ? (
          <MidiTestPage midi={midi} audioEngine={audioEngine} onBackHome={() => setCurrentPage('home')} />
        ) : currentPage === 'sight-reading' ? (
          <SightReadingPage
            activeNotes={midi.activeNotes}
            latestMidiEvent={midi.latestEvent}
            onBackHome={() => setCurrentPage('home')}
          />
        ) : currentPage === 'rhythm' ? (
          <RhythmPracticePage latestMidiEvent={midi.latestEvent} onBackHome={() => setCurrentPage('home')} />
        ) : currentPage === 'scales' ? (
          <ScalePracticePage
            activeNotes={midi.activeNotes}
            latestMidiEvent={midi.latestEvent}
            onBackHome={() => setCurrentPage('home')}
          />
        ) : currentPage === 'chords' ? (
          <ChordPracticePage
            activeNotes={midi.activeNotes}
            latestMidiEvent={midi.latestEvent}
            onBackHome={() => setCurrentPage('home')}
          />
        ) : currentPage === 'coordination' ? (
          <CoordinationPracticePage
            activeNotes={midi.activeNotes}
            latestMidiEvent={midi.latestEvent}
            onBackHome={() => setCurrentPage('home')}
          />
        ) : currentPage === 'metronome' ? (
          <JudgementTestPage latestMidiEvent={midi.latestEvent} onBackHome={() => setCurrentPage('home')} />
        ) : (
          <PlaceholderPage title={currentTitle} onBackHome={() => setCurrentPage('home')} />
        )}
      </main>
      {isHomePage ? (
        <RightInfoPanel
          recentRecords={practiceHistory.recentRecords}
          todayStats={practiceHistory.todayStats}
        />
      ) : null}
    </div>
  )
}

export default App
