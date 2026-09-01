import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import AirLensMark from '../components/AirLensMark'
import { NAV_GROUPS, getActiveGroupKey, type NavGroup, type NavItem } from './nav'

export type GlobalNavVariant = 'site' | 'overlay'

interface GlobalNavProps {
  /** 'overlay' = /globe's transparent-on-dark variant; both render the same markup. */
  variant: GlobalNavVariant
  /** Reports the mobile panel's open/closed state up to SiteChrome so it can
   *  make the page content underneath `inert` while the panel covers it. */
  onMobileOpenChange?: (open: boolean) => void
}

/**
 * GlobalNav — the site-wide primary navigation (PR-N1). APG disclosure
 * navigation pattern per group (button + aria-expanded, not an ARIA menubar
 * — this is a list of links, not a menu of commands). Desktop shows each
 * group's disclosure as a dropdown; the same markup becomes a full-screen
 * accordion panel on narrow viewports via CSS (`chrome.css`) driven by the
 * `data-mobile-open` attribute — there is only one nav list in the DOM, so
 * assistive tech never announces two of everything.
 *
 * Plain `<a href>` throughout (D3 — no client-side router in this repo, see
 * `./router.ts`), so navigating away is a full page load and there is no
 * need to reset open/mobile state on route change.
 */
export default function GlobalNav({ variant, onMobileOpenChange }: GlobalNavProps) {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  const activeKey = getActiveGroupKey(pathname)

  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navRef = useRef<HTMLElement | null>(null)
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const mobileToggleRef = useRef<HTMLButtonElement | null>(null)

  // Click outside the nav closes an open group (desktop dropdown behavior).
  useEffect(() => {
    if (!openGroup) return
    function handlePointerDown(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenGroup(null)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [openGroup])

  // Escape closes the mobile panel from anywhere while it's open. Inlined
  // (rather than calling the closeMobile() below) so the effect's only
  // dependency is `mobileOpen` — the setters and ref are stable, so
  // exhaustive-deps has nothing to flag.
  useEffect(() => {
    if (!mobileOpen) return
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMobileOpen(false)
      setOpenGroup(null)
      mobileToggleRef.current?.focus()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen])

  useEffect(() => {
    onMobileOpenChange?.(mobileOpen)
  }, [mobileOpen, onMobileOpenChange])

  function toggleGroup(key: string) {
    setOpenGroup((current) => (current === key ? null : key))
  }

  function closeGroupAndReturnFocus(key: string) {
    setOpenGroup((current) => (current === key ? null : current))
    triggerRefs.current[key]?.focus()
  }

  // No stopPropagation() here (review round 1): the document-level Escape
  // listener above only attaches while `mobileOpen` is true, so on desktop
  // this change is unobservable. On mobile, letting the event keep bubbling
  // past this handler means a single Escape press closes both layers in one
  // keystroke — the group closes first via this handler, then the still-
  // bubbling event reaches the document listener and closes the mobile
  // panel too, landing focus on the mobile toggle button since it runs last.
  function handleGroupKeyDown(event: KeyboardEvent<HTMLLIElement>, key: string) {
    if (event.key === 'Escape' && openGroup === key) {
      closeGroupAndReturnFocus(key)
    }
  }

  return (
    <header className={`chrome-nav chrome-nav--${variant}`}>
      <a className="chrome-nav__skip" href="#main">
        Skip to content
      </a>
      <div className="chrome-nav__bar">
        <a className="chrome-nav__logo" href="/" aria-label="AirLens home">
          <AirLensMark size={28} />
          <span className="chrome-nav__wordmark">AirLens</span>
        </a>

        <nav
          id="chrome-nav-primary"
          className="chrome-nav__primary"
          aria-label="Primary"
          ref={navRef}
          data-mobile-open={mobileOpen}
        >
          <ul className="chrome-nav__groups">
            {NAV_GROUPS.map((group) => (
              <NavGroupDisclosure
                key={group.key}
                group={group}
                pathname={pathname}
                active={activeKey === group.key}
                open={openGroup === group.key}
                onToggle={() => toggleGroup(group.key)}
                onKeyDown={(event) => handleGroupKeyDown(event, group.key)}
                triggerRef={(el) => {
                  triggerRefs.current[group.key] = el
                }}
              />
            ))}
          </ul>
        </nav>

        <button
          type="button"
          className="chrome-nav__mobile-toggle"
          aria-expanded={mobileOpen}
          aria-controls="chrome-nav-primary"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          ref={mobileToggleRef}
          onClick={() => {
            setMobileOpen((v) => !v)
            setOpenGroup(null)
          }}
        >
          <span className="chrome-nav__hamburger" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

interface NavGroupDisclosureProps {
  group: NavGroup
  pathname: string
  active: boolean
  open: boolean
  onToggle: () => void
  onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => void
  triggerRef: (el: HTMLButtonElement | null) => void
}

function NavGroupDisclosure({
  group,
  pathname,
  active,
  open,
  onToggle,
  onKeyDown,
  triggerRef,
}: NavGroupDisclosureProps) {
  // Mockup decision (§02, "Map은 드롭다운 없는 직링크"): a group with no
  // sub-items has nothing to disclose — its Overview entry and the group's
  // own href are identical, so a dropdown would cost a second click to reach
  // the one destination the trigger already points at. Renders as a plain
  // link at the same list position instead of a button + dropdown.
  if (group.items.length === 0) {
    return (
      <li className="chrome-nav__group">
        <a
          className="chrome-nav__trigger"
          href={group.href}
          aria-current={active ? 'true' : undefined}
        >
          {group.label}
        </a>
      </li>
    )
  }

  const dropdownId = `chrome-nav-dropdown-${group.key}`
  // "Overview" is always first — the trigger button itself only toggles the
  // dropdown (D2), so the group's own landing page needs an explicit entry.
  const allItems: NavItem[] = [{ label: 'Overview', href: group.href }, ...group.items]

  return (
    <li className="chrome-nav__group" onKeyDown={onKeyDown}>
      <button
        type="button"
        className="chrome-nav__trigger"
        aria-expanded={open}
        aria-controls={dropdownId}
        aria-current={active ? 'true' : undefined}
        ref={triggerRef}
        onClick={onToggle}
      >
        {group.label}
        <span className="chrome-nav__chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul className="chrome-nav__dropdown" id={dropdownId}>
          {allItems.map((item) => (
            <li key={item.href} className="chrome-nav__dropdown-item">
              <a
                href={item.href}
                aria-current={item.href === pathname ? 'page' : undefined}
              >
                {item.label}
                {item.beta && <span className="chrome-nav__beta">Beta</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
