import type { Metadata } from 'next'
import {
  Inter,
  Roboto,
  Open_Sans,
  Lato,
  Montserrat,
  Oswald,
  Raleway,
  Merriweather,
  Lora,
  Playfair_Display,
  EB_Garamond,
  Libre_Baskerville,
  Dancing_Script,
} from 'next/font/google'
import { Toaster } from 'sonner'
import Providers from '@/components/Providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-roboto',
})
const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-open-sans',
})
const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-lato',
})
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-montserrat',
})
const oswald = Oswald({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-oswald',
})
const raleway = Raleway({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-raleway',
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
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-playfair',
})
const garamond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-garamond',
})
const baskerville = Libre_Baskerville({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-baskerville',
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
        className={`${inter.variable} ${roboto.variable} ${openSans.variable} ${lato.variable} ${montserrat.variable} ${oswald.variable} ${raleway.variable} ${merriweather.variable} ${lora.variable} ${playfair.variable} ${garamond.variable} ${baskerville.variable} ${dancing.variable} ${inter.className}`}
      >
        <Providers>
          {children}
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  )
}
