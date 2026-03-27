import type { JSONContent } from '@tiptap/core'

/**
 * Recursively walk a Tiptap JSON document tree and concatenate all text node
 * content. Used for entry card previews and word count.
 */
export function extractPlainText(content: JSONContent): string {
  const parts: string[] = []

  function walk(node: JSONContent): void {
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text)
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child)
      }
    }
  }

  walk(content)
  return parts.join('')
}
