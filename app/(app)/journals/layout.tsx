import { SurfaceProvider } from '@/lib/surface'

export default function JournalsLayout({ children }: { children: React.ReactNode }) {
  return <SurfaceProvider value="public">{children}</SurfaceProvider>
}
