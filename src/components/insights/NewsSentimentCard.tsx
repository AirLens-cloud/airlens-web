/**
 * NewsSentimentCard — band 6b. The honest placeholder for the policy-sentiment
 * lane, which is collecting but not published.
 *
 * The monorepo's `PolicySentimentTrend` read a Supabase table of scored news
 * articles. Supabase is retired and the sentiment feed has no published
 * artifact on the live dataset, so there is nothing to render. This card exists
 * because the alternative — quietly dropping the slot — leaves the reader
 * unable to tell "we are not measuring this" from "we measured nothing".
 *
 * It renders no chart, no number, and no example data. When the feed publishes,
 * this component is what gets replaced.
 */
export interface NewsSentimentCardProps {
  countryName: string
}

export default function NewsSentimentCard({ countryName }: NewsSentimentCardProps) {
  return (
    <article className="ins-card ins-card--pending">
      <div className="ins-card-head">
        <span className="m">POLICY SENTIMENT</span>
        <span className="m ins-card-status">NOT PUBLISHED</span>
      </div>

      <p className="ins-card-lede">
        No sentiment series is published for {countryName}.
      </p>

      <p className="ins-card-note">
        The news pipeline scores coverage of air-quality policy as it collects
        it, but that lane has no published artifact on the live dataset yet.
        Rather than draw a shape from partial data, this panel stays empty until
        there is a series to stand behind.
      </p>

      <p className="ins-caveat">
        Sentiment is a measure of how policy is written about, never of whether
        it worked. The causal question is answered by the synthetic control
        above, and the two will not be merged into one score.
      </p>
    </article>
  )
}
