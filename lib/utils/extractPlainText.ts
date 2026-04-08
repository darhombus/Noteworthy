/**
 * Minimal structural type for a ProseMirror/Tiptap-style JSON document tree.
 * Defined locally so this util has no editor-library dependency.
 */
export interface RichTextNode {
  type?: string
  text?: string
  content?: RichTextNode[]
  [key: string]: unknown
}

/**
 * Recursively walk a rich-text JSON document tree and concatenate all text
 * node content. Used for entry card previews and word count.
 */
export function extractPlainText(content: RichTextNode): string {
  const parts: string[] = []

  function walk(node: RichTextNode): void {
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text)
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child)
      }
    }
    // Insert a space after block-level nodes so adjacent sentences don't
    // run together (e.g. "End of sentence.Next sentence").
    const blockTypes = new Set([
      'paragraph',
      'heading',
      'blockquote',
      'codeBlock',
      'listItem',
      'taskItem',
      'horizontalRule',
    ])
    if (node.type && blockTypes.has(node.type)) {
      parts.push(' ')
    }
  }

  walk(content)
  return parts.join('').replace(/\s+/g, ' ').trim()
}
