/**
 * Noteworthy custom Image node.
 *
 * Extends Tiptap's built-in Image extension with a `mediaId` attribute that
 * stores the UUID of the corresponding `media` row.  This attribute is what
 * allows the server-side reconcile-on-save logic to determine which uploaded
 * files are still referenced in the document and which ones should be
 * soft-deleted.
 *
 * The attr round-trips through JSONB storage via data-media-id on the <img>
 * element, so it is preserved when the editor serialises / deserialises HTML
 * (e.g. clipboard, read-only preview renders).
 */
import Image from '@tiptap/extension-image'

export const ImageNode = Image.extend({
  addAttributes() {
    return {
      // Inherit src, alt, title from the base extension.
      ...this.parent?.(),

      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-media-id') ?? null,
        renderHTML: (attrs) =>
          attrs.mediaId ? { 'data-media-id': String(attrs.mediaId) } : {},
      },
    }
  },
})
