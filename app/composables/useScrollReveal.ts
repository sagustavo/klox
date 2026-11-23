/**
 * Bi-directional scroll entry & exit reveal composable (UX-2.2).
 *
 * Uses native CSS Scroll-Driven Animations (`animation-timeline: view()` + `animation-range: entry`)
 * wherever supported, and falls back to a lightweight feature-detected IntersectionObserver
 * otherwise (never shipping scroll-timeline-polyfill).
 */
export function useScrollReveal(
  rootRef: Ref<HTMLElement | null>,
  paused: MaybeRefOrGetter<boolean> = false
) {
  if (import.meta.server) return;

  let observer: IntersectionObserver | null = null;
  let mql: MediaQueryList | null = null;
  const prefersReducedMotion = ref(false);

  function getTargets(): HTMLElement[] {
    if (!rootRef.value) return [];
    return Array.from(rootRef.value.querySelectorAll<HTMLElement>('[data-scroll-reveal]'));
  }

  function clearFallbackAttributes() {
    observer?.disconnect();
    observer = null;
    for (const el of getTargets()) {
      delete el.dataset.revealMode;
      delete el.dataset.revealState;
    }
  }

  function setupFallbackObserver() {
    clearFallbackAttributes();
    if (!rootRef.value || toValue(paused) || prefersReducedMotion.value) return;

    const supportsNativeSDA =
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('(animation-timeline: view()) and (animation-range: entry)');

    // Native CSS Scroll-Driven Animations handle entry/exit on the compositor thread.
    if (supportsNativeSDA) return;

    const targets = getTargets();
    if (targets.length === 0 || typeof IntersectionObserver === 'undefined') return;

    const viewportH = window.innerHeight || 800;
    for (const el of targets) {
      el.dataset.revealMode = 'io';
      const rect = el.getBoundingClientRect();
      if (rect.top > viewportH * 0.92) {
        el.dataset.revealState = 'below';
      } else if (rect.bottom < 0) {
        el.dataset.revealState = 'above';
      } else {
        el.dataset.revealState = 'visible';
      }
    }

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            el.dataset.revealState = 'visible';
          } else if (entry.boundingClientRect.top > 0) {
            el.dataset.revealState = 'below';
          } else {
            el.dataset.revealState = 'above';
          }
        }
      },
      {
        threshold: [0, 0.12],
        rootMargin: '0px 0px -6% 0px',
      }
    );

    for (const el of targets) {
      observer.observe(el);
    }
  }

  function handleReducedMotionChange(event: MediaQueryListEvent) {
    prefersReducedMotion.value = event.matches;
  }

  watch([() => toValue(paused), prefersReducedMotion], () => {
    if (toValue(paused) || prefersReducedMotion.value) {
      clearFallbackAttributes();
    } else {
      setupFallbackObserver();
    }
  });

  onMounted(() => {
    if (window.matchMedia) {
      mql = window.matchMedia('(prefers-reduced-motion: no-preference)');
      prefersReducedMotion.value = !mql.matches;
      mql.addEventListener('change', (ev) => {
        prefersReducedMotion.value = !ev.matches;
      });
    }
    setupFallbackObserver();
  });

  onBeforeUnmount(() => {
    clearFallbackAttributes();
    mql?.removeEventListener('change', handleReducedMotionChange);
  });
}
