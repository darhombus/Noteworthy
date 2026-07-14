import type { Metadata } from 'next'
import {
  Inter,
  Roboto,
  Merriweather,
  Lora,
  Dancing_Script,
} from 'next/font/google'
import { Toaster } from 'sonner'
import Providers from '@/components/Providers'
import ToastDismissOnOutsideClick from '@/components/ToastDismissOnOutsideClick'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-roboto',
})
const merriweather = Merriweather({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-merriweather',
})
const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-lora',
})
const dancing = Dancing_Script({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-dancing',
})

export const metadata: Metadata = {
  title: 'Noteworthy',
  description: 'Your private space to think, reflect, and grow.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${roboto.variable} ${merriweather.variable} ${lora.variable} ${dancing.variable} ${inter.className}`}
      >
        <Providers>
          {children}
          <Toaster richColors position="top-right" />
          <ToastDismissOnOutsideClick />
        </Providers>
      </body>
    </html>
  )
}
