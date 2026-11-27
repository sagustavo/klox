import { formatDynamicTabTitle, formatIdleTabTitle } from '~/domain/duration';
import { UNASSIGNED_PROJECT_ID } from '~/domain/invariants';
import { useCatalogStore } from '~/stores/catalog';
import { useTimerStore } from '~/stores/timer';

/**
 * Reactive live browser tab title for authenticated /app/** routes (UX-2.1).
 * Updates every second while a timer runs (`H:MM:SS | ...`) and shows the localized page section when idle.
 */
export function useDynamicTabTitle() {
  const route = useRoute();
  const { t } = useI18n();
  const timerStore = useTimerStore();
  const catalogStore = useCatalogStore();

  const idleSectionLabel = computed(() => {
    const normalizedPath = route.path.replace(/^\/pt-br(?=\/|$)/, '') || '/';
    if (normalizedPath === '/app' || normalizedPath === '/app/') return t('nav.tracker');
    if (normalizedPath.startsWith('/app/tasks')) return t('nav.tasks');
    if (normalizedPath.startsWith('/app/projects') || normalizedPath.startsWith('/app/catalog')) {
      return t('nav.projects');
    }
    if (normalizedPath.startsWith('/app/dashboard')) return t('nav.dashboard');
    if (normalizedPath.startsWith('/app/import')) return t('nav.import');
    if (normalizedPath.startsWith('/app/settings')) return t('nav.settings');
    if (normalizedPath.startsWith('/app/profile')) return t('nav.profile');
    if (normalizedPath.startsWith('/app/welcome')) return t('onboarding.wizard.title');
    return t('app.placeholderTitle');
  });

  const dynamicTitle = computed(() => {
    if (timerStore.isRunning && timerStore.activeTimer) {
      const activeProjectId = timerStore.projectId || timerStore.activeTimer.projectId;
      const project = catalogStore.getProjectById(activeProjectId);
      const isUnassigned =
        !project ||
        project.systemKey === 'unassigned' ||
        project.id === UNASSIGNED_PROJECT_ID;
      const activeDescription =
        timerStore.description.trim() || timerStore.activeTimer.description;

      return formatDynamicTabTitle({
        elapsedSeconds: timerStore.currentElapsedSeconds,
        description: activeDescription,
        projectName: project?.name,
        isUnassignedProject: isUnassigned,
        brandName: t('brand.name'),
      });
    }

    return formatIdleTabTitle(idleSectionLabel.value, t('brand.name'));
  });

  useHead({
    title: dynamicTitle,
  });

  return {
    dynamicTitle,
  };
}
