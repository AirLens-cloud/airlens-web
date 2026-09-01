import { parseVideoEmbed } from '../../lib/content/videoEmbed'
import type { BlogVideo } from '../../types/blog'

export interface VideoEmbedProps {
  video: BlogVideo
}

/**
 * Official-embed-only video player — Wave 4. `parseVideoEmbed` is the sole
 * trust boundary between the writer's raw watch URL and this `<iframe>`; a
 * URL it can't confidently classify as YouTube/Vimeo returns `null` here,
 * and this component renders nothing rather than falling back to embedding
 * the raw URL.
 */
export default function VideoEmbed({ video }: VideoEmbedProps) {
  const embed = parseVideoEmbed(video.sourceUrl)
  if (!embed) return null

  return (
    <div className="blogpost-video">
      <iframe
        className="blogpost-video__frame"
        src={embed.embedUrl}
        title="Embedded video"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
