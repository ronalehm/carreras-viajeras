"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function scrollToHero() {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  // The global `scroll-behavior: smooth` would animate the reset; while the shell's content is
  // still arriving the page can end up far from the hero.
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  root.style.scrollBehavior = previous;
}

/**
 * Every landing page opens at its own hero. The race and contact pages are static shells whose
 * content is mounted in the browser, so the browser can keep the scroll position of the previous
 * page (near its footer) instead of starting at the top: the reset runs when that content mounts
 * and once more on the next frame. A URL hash (e.g. /#paquete) keeps its own target.
 */
export function ScrollToHero() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.hash) return;
    scrollToHero();
    const frame = requestAnimationFrame(scrollToHero);
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
