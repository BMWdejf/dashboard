'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import styles from './products.module.css';

export interface RowActionLabels {
  open: string;
  menu: string;
  detail: string;
  edit: string;
  duplicate: string;
  copyCode: string;
  copyEan: string;
  copied: string;
  delete: string;
  /** Tooltip of edit/duplicate: writing to Flexi isn't enabled yet. */
  writeSoon: string;
  /** Tooltip of delete: deleting is done in Flexi. */
  deleteInFlexi: string;
}

const MENU_WIDTH = 220;

/**
 * The "⋯" button at the end of a product row and its menu (role="menu").
 * The menu is fixed-positioned, so the table's overflow doesn't clip it, and
 * opens upwards near the bottom of the window. Arrow keys move, Escape and
 * a click outside close it.
 */
export function RowActions({
  id,
  name,
  code,
  ean,
  labels,
}: {
  id: string;
  name: string;
  code: string;
  ean: string | null;
  labels: RowActionLabels;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [copied, setCopied] = useState('');
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];

  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) button.current?.focus();
  };

  // Place the menu under (or above) the button, aligned to its right edge.
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    const height = menu.current?.offsetHeight ?? 0;
    const below = r.bottom + 4 + height <= window.innerHeight;
    setPos({
      top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - height),
      left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    });
    items()[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) close(false);
    };
    const onScroll = () => close(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      list[e.key === 'Home' ? 0 : list.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${labels.copied}: ${text}`);
    } catch {
      setCopied('');
    }
    close();
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={styles.rowMenuButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${labels.open}: ${name}`}
        title={labels.open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>⋯</span>
      </button>
      <span className={styles.srStatus} role="status" aria-live="polite">
        {copied}
      </span>

      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={labels.menu}
          className={styles.rowMenu}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: MENU_WIDTH }}
          onKeyDown={onKeyDown}
        >
          <Link role="menuitem" href={`/products/${id}`} className={styles.rowMenuItem} onClick={() => setOpen(false)}>
            {labels.detail}
          </Link>
          <span role="menuitem" aria-disabled="true" className={styles.rowMenuItem} title={labels.writeSoon}>
            {labels.edit}
          </span>
          <span role="menuitem" aria-disabled="true" className={styles.rowMenuItem} title={labels.writeSoon}>
            {labels.duplicate}
          </span>
          <div role="separator" className={styles.rowMenuSep} />
          <button type="button" role="menuitem" className={styles.rowMenuItem} onClick={() => copy(code)}>
            {labels.copyCode}
          </button>
          {ean && (
            <button type="button" role="menuitem" className={styles.rowMenuItem} onClick={() => copy(ean)}>
              {labels.copyEan}
            </button>
          )}
          <div role="separator" className={styles.rowMenuSep} />
          <span
            role="menuitem"
            aria-disabled="true"
            className={`${styles.rowMenuItem} ${styles.rowMenuDanger}`}
            title={labels.deleteInFlexi}
          >
            {labels.delete}
          </span>
        </div>
      )}
    </>
  );
}
