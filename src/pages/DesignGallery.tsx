/**
 * DesignGallery — renders every ported design-system asset (Waves A/B/C) in
 * sections, with a light/dark theme toggle. Mounted at `/design`
 * (App.tsx branches on `window.location.pathname` — no router dependency).
 *
 * Sample data throughout is clearly synthetic (never claims to be a live
 * reading) — Glass-box doctrine: a gallery demo must not read as live
 * telemetry (flagged by globe-specialist during the port).
 */
import { useEffect, useState, type ReactNode } from 'react'
import WfButton from '../components/wireframe/WfButton'
import WfSegmented from '../components/wireframe/WfSegmented'
import WfTabs from '../components/wireframe/WfTabs'
import AqiDot, { type AqiTier } from '../components/wireframe/AqiDot'
import DqssBadge, { type DqssGrade } from '../components/wireframe/DqssBadge'
import SkyStrip from '../components/wireframe/SkyStrip'
import LiveBadge from '../components/wireframe/LiveBadge'
import WfTag from '../components/wireframe/WfTag'
import WfStamp from '../components/wireframe/WfStamp'
import WfNote from '../components/wireframe/WfNote'
import WfRule from '../components/wireframe/WfRule'
import WfDispatchOrnament from '../components/wireframe/WfDispatchOrnament'
import WfPlaceholder from '../components/wireframe/WfPlaceholder'
import WfSkeleton from '../components/wireframe/WfSkeleton'
import WfDataState from '../components/wireframe/WfDataState'
import { dataState } from '../types/dataState'
import ScopeChipGroup from '../components/wireframe/ScopeChipGroup'
import WfBreadcrumb from '../components/wireframe/WfBreadcrumb'
import WfPagination from '../components/wireframe/WfPagination'
import WfConfirmDialog from '../components/wireframe/WfConfirmDialog'
import WfCoachmark from '../components/wireframe/WfCoachmark'
import BilingualLabel from '../components/wireframe/BilingualLabel'
import WfGlassCard from '../components/wireframe/WfGlassCard'
import WfCodeBlock from '../components/wireframe/composites/WfCodeBlock'
import WfTimelineScrubber from '../components/wireframe/composites/WfTimelineScrubber'
import WfChartFrame from '../components/wireframe/composites/WfChartFrame'
import AirLensMark from '../components/AirLensMark'
import GlobeFallback from '../components/globe/GlobeFallback'
import GlobeObsHud from '../components/globe/observatory/GlobeObsHud'
import AtmosphericModeRail from '../components/globe/observatory/AtmosphericModeRail'
import AtmosphericEvidenceCard from '../components/globe/observatory/AtmosphericEvidenceCard'
import DawnReport from '../components/home/observatory/DawnReport'
import InkInstrument from '../components/home/observatory/InkInstrument'
import NotificationPanel from '../components/notifications/NotificationPanel'
import ChatFAB from '../components/chat/ChatFAB'
import ChatPanel from '../components/chat/ChatPanel'
import ChatMessageBubble from '../components/chat/ChatMessageBubble'
import AtmosphericBackground from '../components/AtmosphericBackground'
import type { AppNotification } from '../types/notification'

const AQI_TIERS: AqiTier[] = ['good', 'moderate', 'usg', 'unhealthy', 'very-unhealthy', 'hazardous', 'unknown']
const DQSS_GRADES: DqssGrade[] = ['A', 'B', 'C', 'D', 'F', 'unknown']

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="gallery-section">
      <h2 className="h-section">{title}</h2>
      {note ? <p className="t-caption gallery-note">{note}</p> : null}
      <div className="gallery-body">{children}</div>
    </section>
  )
}

// Sample timestamps for demo purposes only — computed once at module load
// (not during render, per react-hooks/purity) rather than as live clock reads.
const SAMPLE_NOW = Date.now()

const SAMPLE_NOTIFICATIONS: AppNotification[] = [
  { id: '1', type: 'alert', title: 'PM2.5 spike detected', body: 'Sample data — 78 µg/m³ in the demo grid cell.', timestamp: new Date(SAMPLE_NOW - 5 * 60_000).toISOString(), read: false },
  { id: '2', type: 'info', title: 'Weekly digest ready', body: 'Sample notification body text.', timestamp: new Date(SAMPLE_NOW - 3 * 3_600_000).toISOString(), read: true },
  { id: '3', type: 'update', title: 'Forecast model updated', body: 'Sample notification body text.', timestamp: new Date(SAMPLE_NOW - 26 * 3_600_000).toISOString(), read: true },
]

export default function DesignGallery() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // tokens.css dark chain is keyed on `:root[data-theme]` — an attribute on
  // this component's own div never matches it, so the toggle must write to
  // <html> and restore the pre-mount value on unmount.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.getAttribute('data-theme')
    root.setAttribute('data-theme', theme)
    return () => {
      if (previous === null) root.removeAttribute('data-theme')
      else root.setAttribute('data-theme', previous)
    }
  }, [theme])
  const [segment, setSegment] = useState('a')
  const [tab, setTab] = useState('x')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [coachmarkOpen, setCoachmarkOpen] = useState(false)
  const [scrubStep, setScrubStep] = useState('now')
  const [notifOpen, setNotifOpen] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [page, setPage] = useState(1)

  return (
    <div data-theme={theme} className="design-gallery">
      <header className="gallery-header">
        <h1 className="h-hero">AirLens Design Gallery</h1>
        <p className="t-caption">
          Every asset ported from AirLens-platform (Waves A/B/C). All data below is
          synthetic sample data — this page is a component demo, not a live surface.
        </p>
        <WfSegmented
          items={[{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]}
          activeKey={theme}
          onChange={(k) => setTheme(k as 'light' | 'dark')}
          ariaLabel="Theme"
        />
      </header>

      <Section title="Typography">
        <p className="h-hero">h-hero</p>
        <p className="h-section">h-section</p>
        <p className="t-lede">t-lede — Crimson Pro regular, self-hosted (Wave 4 Block 2).</p>
        <p className="t-quote">"t-quote — Crimson Pro italic."</p>
        <p className="t-caveat">t-caveat — Crimson Pro italic, left border kept from the source signature.</p>
        <p className="t-data">t-data 128.4</p>
        <p className="t-caption">t-caption — secondary copy.</p>
        <p className="t-micro">t-micro — labels/eyebrows</p>
      </Section>

      <Section title="AirLensMark">
        <AirLensMark size={48} />
      </Section>

      <Section title="AqiDot (K4 6-tier)" note="Repainted per decision #4 — never rendered without a text label alongside it.">
        <div className="gallery-row">
          {AQI_TIERS.map((tier) => (
            <span key={tier} className="gallery-swatch">
              <AqiDot tier={tier} ariaLabel={tier} /> {tier}
            </span>
          ))}
        </div>
      </Section>

      <Section title="DqssBadge">
        <div className="gallery-row">
          {DQSS_GRADES.map((g) => (
            <DqssBadge key={g} dqss={g} p10={12.4} p90={38.1} unit="µg/m³" variant="verbose" />
          ))}
        </div>
      </Section>

      <Section title="SkyStrip / LiveBadge">
        <SkyStrip city="SEOUL · KR (sample)" pm25={42} tier="moderate" dqss="B" p10={36} p90={51} n={12} status="live" more={{ to: '#', label: 'More →' }} />
        <div className="gallery-row" style={{ marginTop: 12 }}>
          <LiveBadge timestampMs={SAMPLE_NOW - 60_000} cadenceMs={5 * 60_000} />
          <LiveBadge timestampMs={SAMPLE_NOW - 3 * 3_600_000} cadenceMs={5 * 60_000} />
        </div>
      </Section>

      <Section title="Buttons">
        <div className="gallery-row">
          <WfButton variant="primary">Primary</WfButton>
          <WfButton variant="ghost">Ghost</WfButton>
          <WfButton variant="outline">Outline</WfButton>
          <WfButton variant="ink" family="square">Ink (square)</WfButton>
          <WfButton variant="danger" family="square">Danger (square)</WfButton>
          <WfButton variant="primary" disabled>Disabled</WfButton>
        </div>
      </Section>

      <Section title="Segmented / Tabs">
        <WfSegmented
          items={[{ key: 'a', label: 'Overview' }, { key: 'b', label: 'Detail' }, { key: 'c', label: 'History' }]}
          activeKey={segment}
          onChange={setSegment}
          ariaLabel="Sample segmented control"
        />
        <div style={{ height: 12 }} />
        <WfTabs
          items={[{ key: 'x', label: 'Tab X' }, { key: 'y', label: 'Tab Y' }, { key: 'z', label: 'Tab Z' }]}
          activeKey={tab}
          onChange={setTab}
          ariaLabel="Sample tabs"
        />
      </Section>

      <Section title="Tags / Stamps / Notes / Rules / Ornament">
        <div className="gallery-row">
          <WfTag>Sample tag</WfTag>
          <WfStamp label="Policy" />
          <WfStamp label="Primary" variant="primary" />
          <WfStamp label="Unverified" variant="unverified" />
          <WfNote source="AirLens sample" date="2026-08-26" />
          <WfDispatchOrnament no={7} />
        </div>
        <WfRule />
        <WfRule variant="dashed" />
      </Section>

      <Section title="Placeholder / Skeleton / Data states">
        <div className="gallery-row">
          <WfPlaceholder height={80} label="No image" />
          <WfSkeleton width={120} height={80} variant="block" />
          <WfSkeleton width={120} variant="line" />
          <WfSkeleton width={40} height={40} variant="circle" />
        </div>
        <WfDataState state={dataState('partial', { affectedFields: ['pm25', 'dqss'], source: 'sample-feed' })} />
        <WfDataState state={dataState('unavailable', { source: 'sample-feed' })} onRetry={() => {}} />
      </Section>

      <Section title="ScopeChipGroup">
        <ScopeChipGroup
          ariaLabel="Sample consent scopes"
          items={[
            { variant: 'p', active: true, label: 'Personal', description: 'Personal-scope sample' },
            { variant: 'r', active: false, label: 'Regional', description: 'Regional-scope sample' },
            { variant: 't', active: true, label: 'Temporal', description: 'Temporal-scope sample' },
            { variant: 'pub', active: false, label: 'Public', description: 'Public-scope sample' },
          ]}
        />
      </Section>

      <Section title="Breadcrumb / Pagination">
        <WfBreadcrumb items={[{ key: 'home', label: 'Home', href: '#' }, { key: 'section', label: 'Section', href: '#' }, { key: 'here', label: 'Current page' }]} />
        <div style={{ height: 12 }} />
        <WfPagination mode="prev-next" page={page} pageCount={5} onPageChange={setPage} prevLabel="Prev" nextLabel="Next" statusLabel={`Page ${page} of 5`} />
      </Section>

      <Section title="Confirm dialog / Coachmark">
        <div className="gallery-row">
          <WfButton variant="outline" onClick={() => setDialogOpen(true)}>Open confirm dialog</WfButton>
          <span data-coachmark="gallery-coachmark-anchor" style={{ display: 'inline-block' }}>
            <WfButton variant="outline" onClick={() => setCoachmarkOpen(true)}>
              Open coachmark
            </WfButton>
          </span>
        </div>
        <WfConfirmDialog
          open={dialogOpen}
          title="Sample confirmation"
          description="This is a sample confirm dialog — no destructive action actually happens."
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          onConfirm={() => setDialogOpen(false)}
          onCancel={() => setDialogOpen(false)}
        />
        <WfCoachmark
          anchor="gallery-coachmark-anchor"
          open={coachmarkOpen}
          title="Sample coachmark"
          description="Non-modal, anchored onboarding hint."
          stepLabel="1 / 1"
          actions={<WfButton variant="primary" onClick={() => setCoachmarkOpen(false)}>Got it</WfButton>}
          onDismiss={() => setCoachmarkOpen(false)}
        />
      </Section>

      <Section title="BilingualLabel">
        <BilingualLabel ko="샘플 라벨" en="Sample label" />
      </Section>

      <Section title="WfGlassCard (AQI-tint, decision #3)" note="Ink pairing is measured — see surfaces.css header comment for the WCAG AA table.">
        <div className="gallery-row gallery-row--wrap">
          <WfGlassCard aqi="good" className="gallery-glass-demo">Good tint</WfGlassCard>
          <WfGlassCard aqi="moderate" className="gallery-glass-demo">Moderate tint</WfGlassCard>
          <WfGlassCard aqi="unhealthy" className="gallery-glass-demo">Unhealthy tint</WfGlassCard>
          <WfGlassCard aqi="hazard" className="gallery-glass-demo">Hazard tint</WfGlassCard>
          <WfGlassCard variant="night" className="gallery-glass-demo">Night (fixed)</WfGlassCard>
        </div>
      </Section>

      <Section title="WfCodeBlock">
        <WfCodeBlock language="bash">npm run build && npm run lint && npm run test -- --run</WfCodeBlock>
      </Section>

      <Section title="WfTimelineScrubber (tablist mode)">
        <WfTimelineScrubber value={scrubStep} onChange={setScrubStep} />
      </Section>

      <Section title="WfChartFrame (Glass-box)">
        <div className="gallery-row gallery-row--wrap">
          <WfChartFrame title="Sample series" p10={12.4} p50={24.1} p90={38.9} dqss="B" unit="µg/m³">
            <WfPlaceholder height={60} label="chart body slot (caller-supplied SVG)" />
          </WfChartFrame>
          <WfChartFrame title="No data this pass" p10={null} p90={null} dqss="unknown" n={0} emptyReason="no_measurement" />
        </div>
      </Section>

      <Section title="GlobeFallback">
        <GlobeFallback />
      </Section>

      <div className="obs-surface gallery-obs-block">
        <Section title="Globe Observatory HUD">
          <GlobeObsHud
            status="ready"
            label="PM2.5"
            unit="µg/m³"
            range={[8.2, 64.1]}
            nature="observed"
            motion="static"
            source="sample-feed"
            validTime={SAMPLE_NOW}
            mode="live"
          />
        </Section>

        <Section title="AtmosphericModeRail">
          <AtmosphericModeRail
            items={[
              { id: 'live', number: '01', label: 'Live', detail: 'Current observations', glyph: '●', active: true },
              { id: 'forecast', number: '02', label: 'Forecast', detail: '+48H GEFS', glyph: '▲', active: false },
              { id: 'transport', number: '03', label: 'Transport', detail: 'Wind × concentration', glyph: '→', active: false },
              { id: 'events', number: '04', label: 'Events', detail: 'Fire detections', glyph: '✦', active: false },
              { id: 'field', number: '05', label: 'Field', detail: 'Rendered field range', glyph: '▦', active: false, disabled: true },
            ]}
            onSelect={() => {}}
          />
        </Section>

        <Section title="AtmosphericEvidenceCard">
          <AtmosphericEvidenceCard
            status="ready"
            statusLabel="READY"
            label="PM2.5"
            unit="µg/m³"
            indexLabel="NOW"
            focus={{ label: 'Sample station', value: 24.1, unit: 'µg/m³', p10: 12.4, p90: 38.9, kind: 'observed', dqss: 82 }}
            band={{ low: 22, center: 48, high: 74 }}
            dqssGrade="B"
            mode="live"
            source="sample-feed"
            referenceTimeLabel="Aug 26, 04:00 UTC"
            validTimeLabel="Aug 26, 05:00 UTC"
            provenance={['observed', 'quality-controlled']}
            coverage="Sample coverage area"
          />
        </Section>

        <Section title="DawnReport / InkInstrument">
          <DawnReport
            gridCells={64800}
            peak={{ ug: 118, label: '37.5N, 127.0E' }}
            firesTotal={3}
            forecast={{ city: 'Seoul (sample)', p50: 41.2, p10: 28.4, p90: 55.9, dqss: 'B' }}
          />
          <div className="gallery-row" style={{ marginTop: 12 }}>
            <InkInstrument kind="spark" />
            <InkInstrument kind="network" />
            <InkInstrument kind="arc" />
          </div>
        </Section>
      </div>

      <Section title="NotificationPanel">
        <div className="gallery-row">
          <WfButton variant="outline" onClick={() => setNotifOpen((v) => !v)}>Toggle panel</WfButton>
        </div>
        <NotificationPanel
          isOpen={notifOpen}
          notifications={SAMPLE_NOTIFICATIONS}
          unreadCount={SAMPLE_NOTIFICATIONS.filter((n) => !n.read).length}
          onMarkAllRead={() => {}}
          onClearAll={() => {}}
          onClose={() => setNotifOpen(false)}
        />
      </Section>

      <Section title="ChatFAB + ChatPanel" note="Real panel structure (Wave 4 Block 3) — input is always disabled, no chat backend is wired up.">
        <div className="gallery-fab-demo">
          <ChatFAB isOpen={chatOpen} onToggle={() => setChatOpen((v) => !v)}>
            <ChatPanel onClose={() => setChatOpen(false)} />
          </ChatFAB>
        </div>
      </Section>

      <Section title="ChatMessageBubble / CitationCard" note="Synthetic sample conversation — this page is a component demo, never a live surface (no backend produces this content).">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
          <ChatMessageBubble
            message={{ role: 'user', content: 'Why is Seoul moderate today?', timestamp: 0 }}
          />
          <ChatMessageBubble
            message={{
              role: 'assistant',
              timestamp: 1,
              content:
                'Overnight stagnation trapped local emissions; PM2.5 is at 31 µg/m³ (sample data).',
              citations: [
                { source_title: 'Seoul grid cell · sample source', source_url: 'https://example.com/a', relevance: 0.92 },
                { source_title: 'Wind forecast · sample source', source_url: null, relevance: null },
              ],
            }}
          />
        </div>
      </Section>

      <Section title="AtmosphericBackground" note="K4 4-color palette (decision — good/moderate/usg/unhealthy) in place of the source's full PM2.5 gradient scale.">
        <div className="gallery-bg-demo">
          <AtmosphericBackground />
        </div>
      </Section>
    </div>
  )
}
