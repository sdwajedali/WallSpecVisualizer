import { ColorEditor } from './components/ColorEditor'
import { PainterGuide } from './components/PainterGuide'
import { RoomPreview } from './components/RoomPreview'
import { WallBuilder } from './components/WallBuilder'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1700px] flex-col gap-6">
        <header className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-soft">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">WallSpec Visualizer</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Advanced Painter&apos;s Visualization Tool</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Upload wall photos, choose expert paint patterns, and build a detailed painter&apos;s specification sheet for contractors.
              </p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
          <div className="xl:col-span-2">
            <WallBuilder />
          </div>
          <div className="min-w-0">
            <RoomPreview />
          </div>
          <div className="space-y-6 min-w-0">
            <ColorEditor />
            <PainterGuide />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
