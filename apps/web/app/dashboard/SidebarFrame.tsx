'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './dashboard.module.css';

/**
 * Puts the sidebar beside the content on desktop, and behind a top bar with a
 * Menu button on tablets and phones, where it slides in as a drawer. The
 * drawer closes on the backdrop, Escape, or choosing a link.
 */
export function SidebarFrame({ children }: { children: React.ReactNode }) {
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
          aria-label={open ? 'Zavřít menu' : 'Otevřít menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={styles.menuIcon} aria-hidden />
          Menu
        </button>
      </header>

      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden />}

      <aside
        id="sidebar"
        ref={asideRef}
        className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}
        aria-label="Postranní panel"
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
          Zavřít
        </button>
        {children}
      </aside>
    </>
  );
}
