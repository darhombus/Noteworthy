'use client'

import { useEffect, useRef } from 'react'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { ImageNode } from '@/components/editor/ImageNode'
import { VideoNode } from '@/components/editor/VideoNode'
import {
  TextStyle,
  FontFamily,
  FontSize,
  Color,
} from '@tiptap/extension-text-style'
import { EMPTY_TIPTAP_DOC, isTiptapDoc, type TiptapDoc } from '@/lib/types/tiptap'

interface UseTiptapEditorArgs {
  /** Initial document — read once on mount. Later updates are ignored on
   *  purpose so the editor stays uncontrolled and doesn't reset the cursor. */
  initialContent: TiptapDoc
  /** Fires on every transaction with the doc returned by `editor.getJSON()`.
   *  The parent must NOT transform this value — pass it straight to autosave. */
  onChange: (doc: TiptapDoc) => void
}

/**
 * Shared Tiptap editor configuration for Noteworthy.
 *
 * Extracted into a hook so callers can render the toolbar and editor content
 * in separate DOM positions (e.g. to pin the toolbar above a scroll container)
 * while still sharing a single editor instance.
 */
export function useTiptapEditor({ initialContent, onChange }: UseTiptapEditorArgs) {
  // Keep the latest onChange in a ref so the useEditor options can stay stable
  // and the editor is only ever created once.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  return useEditor({
    extensions: [
      // Disable the inline `code` mark — the toolbar no longer exposes it and
      // the design cleanup removed "code text editing" as requested.
      StarterKit.configure({
        code: false,
        // StarterKit v3 ships Link with openOnClick: true by default — we
        // explicitly pass target/rel so external links open in a new tab
        // and stay safe.
        link: {
          openOnClick: true,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: {
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      // TextStyle is the base mark for FontFamily / FontSize / Color.
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TaskList,
      TaskItem.configure({ nested: true }),
      ImageNode.configure({ inline: false, allowBase64: false }),
      VideoNode,
    ],
    // Fall back to the canonical empty doc (which now contains a single
    // empty paragraph) when initialContent is structurally invalid OR when
    // it's a valid-but-empty doc — see EMPTY_TIPTAP_DOC docstring for why.
    content:
      isTiptapDoc(initialContent) && initialContent.content.length > 0
        ? initialContent
        : EMPTY_TIPTAP_DOC,
    // Required for Next.js SSR: defer initial render until client mount so
    // server and client HTML match.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'ProseMirror focus:outline-none text-[11pt] leading-[1.75] text-[var(--text-primary)] min-h-[400px]',
        // Base font family — overridden per-span when the user picks a font
        // from the toolbar dropdown (FontFamily extension).
        style: "font-family: Georgia, 'Times New Roman', serif;",
      },
    },
    onUpdate: ({ editor }) => {
      // CRITICAL: pass editor JSON through verbatim — NO walkers, NO replacers,
      // NO key filtering (see memory/feedback_no_custom_serializers.md).
      //
      // The single JSON.parse(JSON.stringify(...)) clone here is NOT a
      // sanitiser — it's a prototype fix. ProseMirror creates each node's
      // `attrs` object with a null prototype (`Object.create(null)`), and
      // Next.js 16 / React 19 Server Actions silently drop non-plain nested
      // objects during Flight serialisation. That's what was stripping
      // `attrs.level` and `attrs.textAlign` across the wire. Stringify-parse
      // rebuilds everything with `Object.prototype`, preserving every key and
      // value untouched. See tiptap#4805.
      const doc = JSON.parse(JSON.stringify(editor.getJSON())) as TiptapDoc
      onChangeRef.current(doc)
    },
  })
}
