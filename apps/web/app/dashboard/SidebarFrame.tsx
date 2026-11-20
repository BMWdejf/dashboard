'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './dashboard.module.css';

/**
 * Puts the sidebar beside the content on desktop, and behind a top bar with a
 * Menu button on tablets and phones, where it slides in as a drawer. The
 * drawer closes on the backdrop, Escape, or choosing a link.
 */
export interface SidebarLabels {
  menu: string;
  openMenu: string;
  closeMenu: string;
  close: string;
  sidebar: string;
}

export function SidebarFrame({
  children,
  labels,
  className,
}: {
  children: React.ReactNode;
  labels: SidebarLabels;
  /** Extra class for the <aside> (a sidebar variant). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    asideRef.current?.querySelector<HTMLElement>('input')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <header className={styles.topbar}>
        <span className={styles.brand}>
          <span className={styles.logo} aria-hidden />
          Dashboard
        </span>
        <button
          ref={buttonRef}
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls="sidebar"
          aria-label={open ? labels.closeMenu : labels.openMenu}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={styles.menuIcon} aria-hidden />
          {labels.menu}
        </button>
      </header>

      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden />}

      <aside
        id="sidebar"
        ref={asideRef}
        className={`${styles.sidebar} ${className ?? ''} ${open ? styles.sidebarOpen : ''}`}
        aria-label={labels.sidebar}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) setOpen(false);
        }}
      >
        <button
          type="button"
          className={styles.drawerClose}
          onClick={() => {
            setOpen(false);
            buttonRef.current?.focus();
          }}
        >
          {labels.close}
        </button>
        {children}
      </aside>
    </>
  );
}
