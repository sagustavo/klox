<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { useTimerStore } from '~/stores/timer';

const route = useRoute();
const localePath = useLocalePath();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const timerStore = useTimerStore();
const { sidebarState } = useSidebarState();
const { matchesCommand } = useShortcuts();

useDynamicTabTitle();

function isModalOpen(): boolean {
  return Boolean(document.querySelector('[role="alertdialog"], [role="dialog"]'));
}

async function handleWorkspaceShortcuts(event: KeyboardEvent) {
  if (!authStore.user || isModalOpen()) return;

  if (matchesCommand(event, 'timer.new')) {
    event.preventDefault();
    await timerStore.startInstantTimer({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
    });
    const normalizedPath = route.path.replace(/^\/pt-br(?=\/|$)/, '') || '/';
    if (normalizedPath !== '/app' && normalizedPath !== '/app/') {
      await navigateTo(localePath('/app'));
    }
    return;
  }

  if (matchesCommand(event, 'timer.stop')) {
    if (timerStore.isRunning) {
      event.preventDefault();
      await timerStore.stopTimer({
        uid: authStore.user.uid,
        isDemo: authStore.isDemoMode,
      });
    }
    return;
  }

  if (matchesCommand(event, 'timer.resumeLast')) {
    event.preventDefault();
    await timerStore.resumeLastActivity({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
    });
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleWorkspaceShortcuts);
  if (!authStore.user) return;
  await Promise.all([
    catalogStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    timerStore.hydrate(authStore.user.uid, authStore.isDemoMode),
  ]);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWorkspaceShortcuts);
});
</script>

<template>
  <div class="min-h-screen flex flex-col md:flex-row bg-bg-primary text-text-primary">
    <LayoutAppSidebar />

    <div
      class="flex-1 min-w-0 flex flex-col transition-[padding] duration-200"
      :class="sidebarState === 'hidden' ? 'md:pl-12' : ''"
    >
      <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
        <slot />
      </main>
    </div>

    <!-- Global [?] Keyboard Shortcuts & Command Sheet -->
    <OnboardingHelpCommandSheet />
  </div>
</template>
