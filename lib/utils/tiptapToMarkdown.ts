import type { TiptapNode, TiptapMark, TiptapDoc } from '@/lib/types/tiptap'

function applyMarks(text: string, marks: TiptapMark[] | undefined): string {
  if (!marks || marks.length === 0) return text
  let result = text
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `**${result}**`
        break
      case 'italic':
        result = `_${result}_`
        break
      case 'strike':
        result = `~~${result}~~`
        break
      case 'link': {
        const href = (mark.attrs?.href as string | undefined) ?? ''
        result = `[${result}](${href})`
        break
      }
      // underline: no Markdown equivalent — keep plain text
    }
  }
  return result
}

function renderInline(nodes: TiptapNode[] | undefined): string {
  if (!nodes) return ''
  return nodes
    .map((n) => {
      if (n.type === 'text') return applyMarks(n.text ?? '', n.marks)
      if (n.type === 'hardBreak') return '  \n'
      if (n.content) return renderInline(n.content)
      return ''
    })
    .join('')
}

/**
 * Extract the first paragraph's inline text from a listItem / taskItem,
 * then recursively render any remaining children (e.g. nested lists)
 * at indent + 1.
 */
function renderListItemBody(item: TiptapNode, indent: number): string {
  if (!item.content || item.content.length === 0) return ''
  const lines: string[] = []
  let tookFirstPara = false
  for (const child of item.content) {
    if (!tookFirstPara && child.type === 'paragraph') {
      lines.push(renderInline(child.content))
      tookFirstPara = true
    } else {
      // Nested list or other block — indent one level deeper
      const nested = renderNodes(child.content ?? [], indent + 1)
      if (nested) lines.push(nested)
    }
  }
  return lines.join('\n')
}

function renderNodes(nodes: TiptapNode[], indent = 0): string {
  const pad = '  '.repeat(indent)
  const parts: string[] = []

  for (const node of nodes) {
    switch (node.type) {
      case 'heading': {
        const level = Math.max(1, Math.min(6, (node.attrs?.level as number | undefined) ?? 1))
        parts.push(`${pad}${'#'.repeat(level)} ${renderInline(node.content)}`)
        break
      }

      case 'paragraph': {
        parts.push(`${pad}${renderInline(node.content)}`)
        parts.push('')
        break
      }

      case 'bulletList': {
        for (const item of node.content ?? []) {
          const body = renderListItemBody(item, indent)
          const [first, ...rest] = body.split('\n')
          parts.push(`${pad}- ${first ?? ''}`)
          if (rest.length > 0) parts.push(rest.join('\n'))
        }
        break
      }

      case 'orderedList': {
        let n = 1
        for (const item of node.content ?? []) {
          const body = renderListItemBody(item, indent)
          const [first, ...rest] = body.split('\n')
          parts.push(`${pad}${n}. ${first ?? ''}`)
          if (rest.length > 0) parts.push(rest.join('\n'))
          n++
        }
        break
      }

      case 'taskList': {
        for (const item of node.content ?? []) {
          const checked = item.attrs?.checked === true ? 'x' : ' '
          const body = renderListItemBody(item, indent)
          const [first, ...rest] = body.split('\n')
          parts.push(`${pad}- [${checked}] ${first ?? ''}`)
          if (rest.length > 0) parts.push(rest.join('\n'))
        }
        break
      }

      case 'image': {
        const src = (node.attrs?.src as string | undefined) ?? ''
        const alt = (node.attrs?.alt as string | undefined) ?? ''
        parts.push(`${pad}![${alt}](${src})`)
        break
      }

      case 'video': {
        const src = (node.attrs?.src as string | undefined) ?? ''
        const thumbnailSrc = (node.attrs?.thumbnailSrc as string | undefined) ?? ''
        if (src) {
          // Render as a clickable thumbnail when available, plain link otherwise
          const inner = thumbnailSrc ? `![](${thumbnailSrc})` : 'Video'
          parts.push(`${pad}[${inner}](${src})`)
        }
        break
      }

      case 'horizontalRule': {
        parts.push(`${pad}---`)
        break
      }

      case 'blockquote': {
        const inner = renderNodes(node.content ?? [], 0)
        for (const line of inner.split('\n')) {
          parts.push(`> ${line}`)
        }
        break
      }

      case 'codeBlock': {
        const lang = (node.attrs?.language as string | undefined) ?? ''
        const code = renderInline(node.content)
        parts.push(`\`\`\`${lang}`)
        parts.push(code)
        parts.push('```')
        break
      }

      default: {
        if (node.content) {
          const inner = renderNodes(node.content, indent)
          if (inner) parts.push(inner)
        } else if (node.text) {
          parts.push(node.text)
        }
        break
      }
    }
  }

  return parts.join('\n')
}

export function tiptapToMarkdown(doc: TiptapDoc): string {
  return renderNodes(doc.content).replace(/\n{3,}/g, '\n\n').trim()
}
