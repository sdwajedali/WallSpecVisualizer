import { ColorEditor } from './components/ColorEditor'
import { PainterGuide } from './components/PainterGuide'
import { RoomPreview } from './components/RoomPreview'
import { WallBuilder } from './components/WallBuilder'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1700px] flex-col gap-6">
        <header className="rounded-[2rem] border border-slate-200 bg-white px-6 py-4 shadow-soft">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">WallSpec Visualizer</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Advanced Painter&apos;s Visualization Tool</h1>
            </div>
            <p className="text-xs text-slate-500 sm:max-w-xs sm:text-right">
              Choose paint patterns, configure walls, and build a detailed painter&apos;s specification sheet.
            </p>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
          <div className="min-w-0">
            <RoomPreview />
          </div>
          <div className="space-y-4 min-w-0">
            <WallBuilder />
            <ColorEditor />
            <PainterGuide />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
