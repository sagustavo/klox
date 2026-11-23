<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { useTimerStore } from '~/stores/timer';

const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const timerStore = useTimerStore();
const { sidebarState } = useSidebarState();

useDynamicTabTitle();

onMounted(async () => {
  if (!authStore.user) return;
  await Promise.all([
    catalogStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    timerStore.hydrate(authStore.user.uid, authStore.isDemoMode),
  ]);
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
