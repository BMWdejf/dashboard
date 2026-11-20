'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import dash from './dashboard.module.css';
import styles from './section-sidebar.module.css';

export interface NavItem {
  /** No href = the page doesn't exist yet ("soon"). */
  href?: string;
  label: string;
  /** Sub-items, shown when this section is the current one. */
  children?: NavItem[];
}

export interface NavLabels {
  searchLabel: string;
  searchPlaceholder: string;
  main: string;
  soon: string;
  soonTitle: string;
  nothingFound: string;
}

interface Props {
  /** Links above the divider. */
  items: NavItem[];
  /** Links below the divider (Settings). */
  footerItems: NavItem[];
  /** Current path; a section is active for its own path and everything below it. */
  active: string;
  labels: NavLabels;
}

export function isActive(href: string, active: string): boolean {
  return href === '/' ? active === '/' : active === href || active.startsWith(`${href}/`);
}

/**
 * Sidebar navigation from design/figma/Products.json: the current section is
 * opened as an accordion with its sub-items ("Dashboard Section Accordion
 * Active"), then the other links, a divider, settings, and the quick search
 * under the menu, which filters the links.
 */
export function SectionNav({ items, footerItems, active: activeSection, labels }: Props) {
  // The real path marks the current sub-item (a layout only knows its section).
  const active = usePathname() ?? activeSection;
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const hit = (i: NavItem) => i.label.toLowerCase().includes(q);

  /** Section with only the sub-items that match the search (or all of them). */
  const filter = (list: NavItem[]) =>
    list.flatMap((item): NavItem[] => {
      if (!q) return [item];
      const children = item.children?.filter(hit) ?? [];
      return hit(item) || children.length ? [{ ...item, children: hit(item) ? item.children : children }] : [];
    });

  const shown = filter(items);
  const shownFooter = filter(footerItems);

  const soonTag = <span className={styles.soonTag}>{labels.soon}</span>;

  const render = (item: NavItem) => {
    const open = item.href !== undefined && isActive(item.href, active) && !!item.children?.length;
    // While searching, sections with matching sub-items open too.
    const expanded = open || (!!q && !!item.children?.length);

    if (expanded && item.href) {
      return (
        <div key={item.label} className={styles.group}>
          <Link
            href={item.href}
            className={styles.groupHead}
            aria-current={open ? 'true' : undefined}
            data-open={open || undefined}
          >
            <span className={styles.groupIcon} aria-hidden />
            <span>{item.label}</span>
            <span className={styles.chevronDown} aria-hidden />
          </Link>
          <ul className={styles.subList}>
            {item.children!.map((sub) => (
              <li key={sub.label}>
                {sub.href ? (
                  <Link
                    href={sub.href}
                    className={styles.subItem}
                    aria-current={sub.href === active ? 'page' : undefined}
                  >
                    {sub.label}
                  </Link>
                ) : (
                  <span className={`${styles.subItem} ${styles.soon}`} aria-disabled title={labels.soonTitle}>
                    {sub.label}
                    {soonTag}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      );
    }

    return item.href ? (
      <Link
        key={item.label}
        href={item.href}
        className={styles.navLink}
        aria-current={isActive(item.href, active) ? 'page' : undefined}
      >
        <span>{item.label}</span>
        {item.children?.length ? <span className={styles.chevronRight} aria-hidden /> : null}
      </Link>
    ) : (
      <span key={item.label} className={`${styles.navLink} ${styles.soon}`} aria-disabled title={labels.soonTitle}>
        <span>{item.label}</span>
        {soonTag}
      </span>
    );
  };

  return (
    <>
      <nav className={styles.menu} aria-label={labels.main}>
        {shown.map(render)}
        {shownFooter.length > 0 && <hr className={styles.divider} />}
        {shownFooter.map(render)}
        {shown.length === 0 && shownFooter.length === 0 && <p className={styles.empty}>{labels.nothingFound}</p>}
      </nav>

      <label className={styles.quickSearch}>
        <span className={dash.visuallyHidden}>{labels.searchLabel}</span>
        <span className={dash.searchIcon} aria-hidden />
        <input
          type="search"
          placeholder={labels.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
    </>
  );
}
