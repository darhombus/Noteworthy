import { SurfaceProvider } from '@/lib/surface'

export default function HiddenLayout({ children }: { children: React.ReactNode }) {
  return <SurfaceProvider value="hidden">{children}</SurfaceProvider>
}
