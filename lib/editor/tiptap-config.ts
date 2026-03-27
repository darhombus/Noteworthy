import { type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Color from '@tiptap/extension-color'
import { TextStyle, FontSize } from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CharacterCount from '@tiptap/extension-character-count'

export const defaultExtensions = [
  StarterKit,
  Underline,
  TextStyle,
  FontSize,
  Color,
  FontFamily,
  TextAlign.configure({
    types: ['heading', 'paragraph'],
    alignments: ['left', 'center', 'right'],
  }),
  Highlight.configure({
    multicolor: true,
  }),
  Link.configure({
    openOnClick: false,
    autolink: true,
  }),
  Placeholder.configure({
    placeholder: 'Start writing…',
  }),
  TaskList,
  TaskItem.configure({
    nested: true,
  }),
  CharacterCount,
]

export type { JSONContent }
