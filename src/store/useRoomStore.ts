import { create } from 'zustand'
import { Color, hexToPaintName } from '../lib/colorUtils'

export type WallPattern = 'solid' | 'twoTone' | 'stripe'
export type ActiveElement = 'wall' | 'ceiling' | 'trim'

export interface WallConfig {
  id: string
  photo: File | null
  photoPreviewUrl: string | null
  extractedPalette: Color[]
  pattern: WallPattern
  solidColor: Color | null
  upperColor: Color | null
  lowerColor: Color | null
  splitPercentage: number
  topColor: Color | null
  middleColor: Color | null
  bottomColor: Color | null
  stripePercentage: number
}

export interface RoomStore {
  roomType: string
  wallCount: number
  walls: WallConfig[]
  activeWallId: string | null
  activeElement: ActiveElement
  ceilingColor: Color | null
  trimColor: Color | null
  version: number // Add version counter for forcing re-renders on nested changes
  setRoomType: (roomType: string) => void
  setWallCount: (count: number) => void
  setActiveWallId: (id: string | null) => void
  setActiveElement: (type: ActiveElement) => void
  updateWallPhoto: (wallId: string, file: File, previewUrl: string) => void
  setWallPalette: (wallId: string, palette: Color[]) => void
  setWallPattern: (wallId: string, pattern: WallPattern) => void
  setWallColorField: (wallId: string, field: keyof Omit<WallConfig, 'id' | 'photo' | 'photoPreviewUrl' | 'extractedPalette' | 'pattern' | 'splitPercentage' | 'stripePercentage'>, color: Color) => void
  setSplitPercentage: (wallId: string, value: number) => void
  setStripePercentage: (wallId: string, value: number) => void
  setCeilingColor: (color: Color) => void
  setTrimColor: (color: Color) => void
}

const defaultColor: Color = {
  hex: '#CBD5E1',
  name: 'Soft Cloud',
  hsl: { h: 210, s: 0.16, l: 0.82 }
}

const createWall = (index: number): WallConfig => ({
  id: `wall-${index}`,
  photo: null,
  photoPreviewUrl: null,
  extractedPalette: [],
  pattern: 'solid',
  solidColor: defaultColor,
  upperColor: defaultColor,
  lowerColor: defaultColor,
  splitPercentage: 60,
  topColor: defaultColor,
  middleColor: defaultColor,
  bottomColor: defaultColor,
  stripePercentage: 15
})

const generateWalls = (count: number) => Array.from({ length: count }, (_, index) => createWall(index + 1))

export const useRoomStore = create<RoomStore>((set, get) => ({
  roomType: 'Living Room',
  wallCount: 4,
  walls: generateWalls(4),
  activeWallId: 'wall-1',
  activeElement: 'wall',
  ceilingColor: defaultColor,
  trimColor: defaultColor,
  version: 0, // Initial version counter
  setRoomType: (roomType) => set({ roomType }),
  setWallCount: (count) => {
    const walls = get().walls
    const newWalls = count > walls.length ? [...walls, ...generateWalls(count - walls.length).map((wall, index) => ({ ...wall, id: `wall-${walls.length + index + 1}` }))] : walls.slice(0, count)
    const activeId = newWalls.some((wall) => wall.id === get().activeWallId) ? get().activeWallId : newWalls[0]?.id ?? null
    set({ wallCount: count, walls: newWalls, activeWallId: activeId })
  },
  setActiveWallId: (id) => set({ activeWallId: id, activeElement: 'wall' }),
  setActiveElement: (type) => set({ activeElement: type, activeWallId: type === 'wall' ? get().activeWallId : null }),
  updateWallPhoto: (wallId, file, previewUrl) =>
    set((state) => ({
      walls: state.walls.map((wall) =>
        wall.id === wallId
          ? {
              ...wall,
              photo: file,
              photoPreviewUrl: previewUrl
            }
          : wall
      ),
      version: state.version + 1
    })),
  setWallPalette: (wallId, palette) =>
    set((state) => ({
      walls: state.walls.map((wall) =>
        wall.id === wallId
          ? {
              ...wall,
              extractedPalette: palette,
              solidColor: palette[0] ?? wall.solidColor,
              upperColor: palette[0] ?? wall.upperColor,
              lowerColor: palette[1] ?? palette[0] ?? wall.lowerColor,
              topColor: palette[0] ?? wall.topColor,
              middleColor: palette[1] ?? palette[1] ?? wall.middleColor,
              bottomColor: palette[2] ?? palette[0] ?? wall.bottomColor
            }
          : wall
      ),
      version: state.version + 1
    })),
  setWallPattern: (wallId, pattern) =>
    set((state) => ({
      walls: state.walls.map((wall) =>
        wall.id === wallId
          ? {
              ...wall,
              pattern,
              ...(pattern === 'twoTone' && {
                upperColor: wall.solidColor,
                lowerColor: wall.solidColor
              }),
              ...(pattern === 'stripe' && {
                topColor: wall.solidColor,
                middleColor: wall.solidColor,
                bottomColor: wall.solidColor
              })
            }
          : wall
      ),
      version: state.version + 1
    })),
  setWallColorField: (wallId, field, color) =>
    set((state) => ({
      walls: state.walls.map((wall) =>
        wall.id === wallId
          ? {
              ...wall,
              [field]: color
            }
          : wall
      ),
      version: state.version + 1
    })),
  setSplitPercentage: (wallId, value) =>
    set((state) => ({
      walls: state.walls.map((wall) => (wall.id === wallId ? { ...wall, splitPercentage: value } : wall)),
      version: state.version + 1
    })),
  setStripePercentage: (wallId, value) =>
    set((state) => ({
      walls: state.walls.map((wall) => (wall.id === wallId ? { ...wall, stripePercentage: value } : wall)),
      version: state.version + 1
    })),
  setCeilingColor: (color) => set({ ceilingColor: color, version: get().version + 1 }),
  setTrimColor: (color) => set({ trimColor: color, version: get().version + 1 }),
}))
