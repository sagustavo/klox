<script setup lang="ts">
import {
  BarChart3,
  CheckSquare,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  FileSpreadsheet,
  FolderKanban,
  HelpCircle,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  X,
} from 'lucide-vue-next';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui';
import { useAuthStore } from '~/stores/auth';
import { useOnboardingStore } from '~/stores/onboarding';
import { useProfileStore } from '~/stores/profile';
import { useTimerStore } from '~/stores/timer';

const { t } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const authStore = useAuthStore();
const onboardingStore = useOnboardingStore();
const profileStore = useProfileStore();
const timerStore = useTimerStore();
const { sidebarState, syncFromStorage, setSidebarState, cycleSidebar, reopenSidebar } =
  useSidebarState();
const { isRecording, getKeycaps, matchesCommand } = useShortcuts();

const mobileDrawerOpen = ref(false);

interface NavItem {
  key: string;
  to: string;
  label: string;
  icon: Component;
  exact?: boolean;
  dataTour?: string;
}

const navItems = computed<NavItem[]>(() => [
  {
    key: 'tracker',
    to: localePath('/app'),
    label: t('nav.tracker'),
    icon: Clock,
    exact: true,
  },
  {
    key: 'tasks',
    to: localePath('/app/tasks'),
    label: t('nav.tasks'),
    icon: CheckSquare,
    dataTour: 'nav-tasks',
  },
  {
    key: 'projects',
    to: localePath('/app/projects'),
    label: t('nav.projects'),
    icon: FolderKanban,
    dataTour: 'nav-projects',
  },
  {
    key: 'dashboard',
    to: localePath('/app/dashboard'),
    label: t('nav.dashboard'),
    icon: BarChart3,
    dataTour: 'nav-dashboard',
  },
  {
    key: 'import',
    to: localePath('/app/import'),
    label: t('nav.import'),
    icon: FileSpreadsheet,
    dataTour: 'nav-import',
  },
  {
    key: 'settings',
    to: localePath('/app/settings'),
    label: t('nav.settings'),
    icon: Settings,
    dataTour: 'nav-settings',
  },
]);

const accountDisplayName = computed(
  () =>
    profileStore.profile?.displayName ||
    authStore.user?.displayName ||
    authStore.user?.email ||
    t('brand.name')
);

const accountSecondary = computed(() => {
  if (profileStore.profile?.username) {
    return `@${profileStore.profile.username}`;
  }
  return authStore.user?.email || '';
});

const accountAvatarUrl = computed(
  () => profileStore.effectiveAvatarUrl || authStore.user?.photoURL || null
);

const accountEmail = computed(
  () => profileStore.profile?.email || authStore.user?.email || null
);

const activeLinkClass =
  '!text-text-primary bg-bg-hover border-border-hairline border-l-2 border-l-signal';

watch(
  () => route.fullPath,
  () => {
    mobileDrawerOpen.value = false;
  }
);

function openHelpFromDrawer() {
  mobileDrawerOpen.value = false;
  nextTick(() => {
    onboardingStore.isHelpSheetOpen = true;
  });
}

async function handleSignOut() {
  mobileDrawerOpen.value = false;
  await authStore.signOutUser();
  await navigateTo(localePath('/'));
}

function handleGlobalSidebarShortcut(event: KeyboardEvent) {
  if (isRecording.value) return;
  if (!matchesCommand(event, 'ui.toggleSidebar')) {
    return;
  }
  if (document.querySelector('[role="alertdialog"]')) {
    return;
  }

  const isDesktop = window.matchMedia('(min-width: 768px)').matches;
  if (isDesktop) {
    if (document.querySelector('[role="dialog"]')) {
      return;
    }
    event.preventDefault();
    cycleSidebar();
    return;
  }

  if (onboardingStore.isHelpSheetOpen) {
    return;
  }
  event.preventDefault();
  mobileDrawerOpen.value = !mobileDrawerOpen.value;
}

let desktopMediaQuery: MediaQueryList | null = null;
function handleMediaChange(event: MediaQueryListEvent) {
  if (event.matches && mobileDrawerOpen.value) {
    mobileDrawerOpen.value = false;
  }
}

onMounted(() => {
  syncFromStorage();
  window.addEventListener('keydown', handleGlobalSidebarShortcut);
  desktopMediaQuery = window.matchMedia('(min-width: 768px)');
  desktopMediaQuery.addEventListener('change', handleMediaChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalSidebarShortcut);
  desktopMediaQuery?.removeEventListener('change', handleMediaChange);
});
</script>

<template>
  <!-- Mobile Compact Single-Row Top Bar (< 768px) -->
  <header
    class="sticky top-0 z-30 h-12 w-full max-w-full overflow-x-hidden border-b border-border-hairline bg-bg-elevated/90 backdrop-blur-md md:hidden"
  >
    <div class="grid h-full grid-cols-[44px_1fr_44px] items-center px-1.5">
      <button
        type="button"
        class="btn-press inline-flex h-10 w-10 items-center justify-center justify-self-start text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        :aria-label="$t('nav.openMenu')"
        :aria-expanded="mobileDrawerOpen"
        aria-controls="klox-mobile-drawer"
        @click="mobileDrawerOpen = true"
      >
        <Menu class="h-5 w-5" aria-hidden="true" />
      </button>

      <NuxtLink
        :to="localePath('/app')"
        class="justify-self-center inline-flex items-center justify-center px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
      >
        <BrandKloxLogo variant="reticle" size="sm" />
      </NuxtLink>

      <button
        type="button"
        class="btn-press inline-flex h-10 w-10 items-center justify-center justify-self-end text-signal transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        :aria-label="$t('nav.help')"
        @click="onboardingStore.isHelpSheetOpen = true"
      >
        <HelpCircle class="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  </header>

  <!-- Mobile Slide-Over Modal Navigation Drawer (reka-ui Dialog) -->
  <DialogRoot :open="mobileDrawerOpen" @update:open="mobileDrawerOpen = $event">
    <DialogPortal>
      <DialogOverlay
        class="orbital-dialog-overlay fixed inset-0 z-50 bg-black/75 backdrop-blur-sm overscroll-contain md:hidden"
      />
      <DialogContent
        id="klox-mobile-drawer"
        class="orbital-drawer-content fixed inset-y-0 left-0 z-50 flex h-[100svh] w-[min(280px,80dvw)] flex-col border-r border-border-hairline bg-bg-elevated shadow-2xl overscroll-contain focus:outline-none md:hidden"
      >
        <DialogTitle class="sr-only">{{ $t('nav.drawerTitle') }}</DialogTitle>
        <DialogDescription class="sr-only">{{ $t('nav.drawerDesc') }}</DialogDescription>

        <div class="flex h-12 shrink-0 items-center justify-between border-b border-border-hairline px-4">
          <NuxtLink
            :to="localePath('/app')"
            class="inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            @click="mobileDrawerOpen = false"
          >
            <BrandKloxLogo variant="reticle" size="sm" />
          </NuxtLink>

          <DialogClose as-child>
            <button
              type="button"
              class="btn-press inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              :aria-label="$t('nav.closeMenu')"
            >
              <X class="h-4 w-4" aria-hidden="true" />
            </button>
          </DialogClose>
        </div>

        <div v-if="authStore.isDemoMode" class="border-b border-border-hairline px-4 py-2.5">
          <span
            class="tabular-telemetry inline-flex border border-signal/40 bg-signal-soft px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider text-signal"
          >
            {{ $t('app.demoBanner') }}
          </span>
        </div>

        <nav :aria-label="$t('nav.workspaceAria')" class="flex-1 overflow-y-auto px-2.5 py-3 space-y-1">
          <NuxtLink
            v-for="item in navItems"
            :key="item.key"
            :to="item.to"
            class="flex h-11 items-center gap-3 border border-transparent px-3 text-ui font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            :exact-active-class="item.exact ? activeLinkClass : undefined"
            :active-class="item.exact ? undefined : activeLinkClass"
            @click="mobileDrawerOpen = false"
          >
            <component
              :is="item.icon"
              class="h-4 w-4 shrink-0"
              :class="item.key === 'tracker' ? 'text-signal' : ''"
              aria-hidden="true"
            />
            <span class="truncate">{{ item.label }}</span>
            <span
              v-if="item.key === 'tracker' && timerStore.isRunning"
              class="ml-auto h-2 w-2 shrink-0 bg-signal motion-safe:animate-pulse"
              aria-hidden="true"
            />
          </NuxtLink>
        </nav>

        <div class="shrink-0 border-t border-border-hairline p-3 space-y-2.5">
          <button
            type="button"
            class="btn-press flex h-10 w-full items-center justify-between gap-2 border border-border-hairline bg-bg-primary px-3 text-ui font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            @click="openHelpFromDrawer"
          >
            <span class="inline-flex items-center gap-2.5">
              <HelpCircle class="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
              <span>{{ $t('nav.help') }}</span>
            </span>
            <BrandKeycapBadge :keys="getKeycaps('ui.toggleHelp')" size="sm" />
          </button>

          <div
            v-if="authStore.user"
            class="flex items-center justify-between gap-2 border-t border-border-hairline pt-2.5"
          >
            <NuxtLink
              :to="localePath('/app/profile')"
              :aria-label="$t('nav.profile')"
              :active-class="activeLinkClass"
              class="flex min-w-0 flex-1 items-center gap-2.5 border border-transparent px-1.5 py-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              @click="mobileDrawerOpen = false"
            >
              <UiUserAvatar
                size="sm"
                :src="accountAvatarUrl"
                :name="accountDisplayName"
                :email="accountEmail"
              />
              <span class="min-w-0">
                <span class="block truncate text-ui font-medium text-text-primary">
                  {{ accountDisplayName }}
                </span>
                <span v-if="accountSecondary" class="tabular-telemetry block truncate text-[11px] text-text-muted">
                  {{ accountSecondary }}
                </span>
              </span>
            </NuxtLink>

            <button
              type="button"
              class="btn-press inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted transition-colors hover:border-destructive/50 hover:bg-bg-hover hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              :aria-label="$t('nav.signOut')"
              :title="$t('nav.signOut')"
              @click="handleSignOut"
            >
              <LogOut class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <!-- Desktop 3-State Collapsible Orbital Sidebar (>= 768px) -->
  <TooltipProvider :delay-duration="180">
    <aside
      :aria-label="$t('nav.workspaceAria')"
      :aria-hidden="sidebarState === 'hidden' ? 'true' : undefined"
      :inert="sidebarState === 'hidden'"
      class="orbital-sidebar-transition sticky top-0 z-20 hidden h-[100svh] shrink-0 overflow-hidden bg-bg-elevated/95 backdrop-blur-md md:flex md:flex-col"
      :class="[
        sidebarState === 'expanded' ? 'w-60 border-r border-border-hairline' : '',
        sidebarState === 'collapsed' ? 'w-16 border-r border-border-hairline' : '',
        sidebarState === 'hidden' ? 'w-0 border-r-0 pointer-events-none' : '',
      ]"
    >
      <!-- Top Brand & Sidebar State Row -->
      <div
        class="flex h-14 shrink-0 items-center border-b border-border-hairline"
        :class="sidebarState === 'collapsed' ? 'justify-center px-2' : 'justify-between px-3.5'"
      >
        <NuxtLink
          :to="localePath('/app')"
          :aria-label="$t('nav.tracker')"
          class="inline-flex shrink-0 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          <BrandKloxLogo
            :variant="sidebarState === 'collapsed' ? 'compact' : 'reticle'"
            size="sm"
          />
        </NuxtLink>

        <div v-if="sidebarState === 'expanded'" class="flex items-center gap-1 shrink-0">
          <TooltipRoot>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="btn-press inline-flex h-7 w-7 items-center justify-center border border-transparent text-text-muted transition-colors hover:border-border-hairline hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                :aria-label="$t('nav.sidebarCollapse')"
                @click="setSidebarState('collapsed')"
              >
                <ChevronsLeft class="h-4 w-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="bottom"
                :side-offset="6"
                class="orbital-tooltip z-50 flex items-center gap-2 border border-border-hairline bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-xl"
              >
                <span>{{ $t('nav.sidebarCollapse') }}</span>
                <BrandKeycapBadge :keys="getKeycaps('ui.toggleSidebar')" size="sm" />
              </TooltipContent>
            </TooltipPortal>
          </TooltipRoot>

          <TooltipRoot>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="btn-press inline-flex h-7 w-7 items-center justify-center border border-transparent text-text-muted transition-colors hover:border-border-hairline hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                :aria-label="$t('nav.sidebarHide')"
                @click="setSidebarState('hidden')"
              >
                <PanelLeftClose class="h-4 w-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="bottom"
                :side-offset="6"
                class="orbital-tooltip z-50 flex items-center gap-2 border border-border-hairline bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-xl"
              >
                <span>{{ $t('nav.sidebarHide') }}</span>
                <BrandKeycapBadge :keys="getKeycaps('ui.toggleSidebar')" size="sm" />
              </TooltipContent>
            </TooltipPortal>
          </TooltipRoot>
        </div>
      </div>

      <!-- Demo Mode Indicator -->
      <div
        v-if="authStore.isDemoMode"
        class="shrink-0 border-b border-border-hairline py-2"
        :class="sidebarState === 'collapsed' ? 'px-2 text-center' : 'px-3.5'"
      >
        <span
          v-if="sidebarState === 'expanded'"
          class="tabular-telemetry inline-flex border border-signal/40 bg-signal-soft px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider text-signal"
        >
          {{ $t('app.demoBanner') }}
        </span>

        <TooltipRoot v-else>
          <TooltipTrigger as-child>
            <span
              class="tabular-telemetry inline-flex h-6 w-6 items-center justify-center border border-signal/40 bg-signal-soft text-xs font-semibold text-signal"
              :aria-label="$t('app.demoBanner')"
            >
              D
            </span>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              side="right"
              :side-offset="10"
              class="orbital-tooltip z-50 border border-border-hairline bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-signal shadow-xl"
            >
              {{ $t('app.demoBanner') }}
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
      </div>

      <!-- Primary Workspace Navigation -->
      <nav :aria-label="$t('nav.workspaceAria')" class="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <template v-for="item in navItems" :key="item.key">
          <NuxtLink
            v-if="sidebarState === 'expanded'"
            :to="item.to"
            :data-tour="item.dataTour"
            class="flex h-10 items-center gap-3 whitespace-nowrap border border-transparent px-3 text-ui font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            :exact-active-class="item.exact ? activeLinkClass : undefined"
            :active-class="item.exact ? undefined : activeLinkClass"
          >
            <component
              :is="item.icon"
              class="h-4 w-4 shrink-0"
              :class="item.key === 'tracker' ? 'text-signal' : ''"
              aria-hidden="true"
            />
            <span class="truncate">{{ item.label }}</span>
            <span
              v-if="item.key === 'tracker' && timerStore.isRunning"
              class="ml-auto h-2 w-2 shrink-0 bg-signal motion-safe:animate-pulse"
              aria-hidden="true"
            />
          </NuxtLink>

          <TooltipRoot v-else>
            <TooltipTrigger as-child>
              <NuxtLink
                :to="item.to"
                :data-tour="item.dataTour"
                :aria-label="item.label"
                class="relative mx-auto flex h-10 w-10 items-center justify-center border border-transparent text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                :exact-active-class="item.exact ? activeLinkClass : undefined"
                :active-class="item.exact ? undefined : activeLinkClass"
              >
                <component
                  :is="item.icon"
                  class="h-4 w-4 shrink-0"
                  :class="item.key === 'tracker' ? 'text-signal' : ''"
                  aria-hidden="true"
                />
                <span
                  v-if="item.key === 'tracker' && timerStore.isRunning"
                  class="absolute right-1.5 top-1.5 h-1.5 w-1.5 bg-signal motion-safe:animate-pulse"
                  aria-hidden="true"
                />
              </NuxtLink>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                :side-offset="10"
                class="orbital-tooltip z-50 border border-border-hairline bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-xl"
              >
                {{ item.label }}
              </TooltipContent>
            </TooltipPortal>
          </TooltipRoot>
        </template>
      </nav>

      <!-- Sidebar Footer: Rail Controls, Help Sheet & Icon-Only Sign Out -->
      <div class="shrink-0 border-t border-border-hairline p-2 space-y-2">
        <!-- Collapsed-Rail Expand & Hide Controls -->
        <div v-if="sidebarState === 'collapsed'" class="flex flex-col items-center gap-1">
          <TooltipRoot>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="btn-press inline-flex h-9 w-10 items-center justify-center border border-transparent text-text-muted transition-colors hover:border-border-hairline hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                :aria-label="$t('nav.sidebarExpand')"
                @click="setSidebarState('expanded')"
              >
                <ChevronsRight class="h-4 w-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                :side-offset="10"
                class="orbital-tooltip z-50 flex items-center gap-2 border border-border-hairline bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-xl"
              >
                <span>{{ $t('nav.sidebarExpand') }}</span>
                <BrandKeycapBadge :keys="getKeycaps('ui.toggleSidebar')" size="sm" />
              </TooltipContent>
            </TooltipPortal>
          </TooltipRoot>

          <TooltipRoot>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="btn-press inline-flex h-9 w-10 items-center justify-center border border-transparent text-text-muted transition-colors hover:border-border-hairline hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                :aria-label="$t('nav.sidebarHide')"
                @click="setSidebarState('hidden')"
              >
                <PanelLeftClose class="h-4 w-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                :side-offset="10"
                class="orbital-tooltip z-50 flex items-center gap-2 border border-border-hairline bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-xl"
              >
                <span>{{ $t('nav.sidebarHide') }}</span>
                <BrandKeycapBadge :keys="getKeycaps('ui.toggleSidebar')" size="sm" />
              </TooltipContent>
            </TooltipPortal>
          </TooltipRoot>
        </div>

        <!-- Help & Shortcuts Trigger -->
        <button
          v-if="sidebarState === 'expanded'"
          type="button"
          data-tour="nav-help"
          class="btn-press flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap border border-border-hairline bg-bg-primary px-3 text-ui font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          :aria-label="$t('nav.help')"
          @click="onboardingStore.isHelpSheetOpen = true"
        >
          <span class="inline-flex min-w-0 items-center gap-2">
            <HelpCircle class="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
            <span class="truncate">{{ $t('nav.help') }}</span>
          </span>
          <BrandKeycapBadge :keys="getKeycaps('ui.toggleHelp')" size="sm" />
        </button>

        <TooltipRoot v-else>
          <TooltipTrigger as-child>
            <button
              type="button"
              data-tour="nav-help"
              class="btn-press mx-auto flex h-10 w-10 items-center justify-center border border-border-hairline bg-bg-primary text-signal transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              :aria-label="$t('nav.help')"
              @click="onboardingStore.isHelpSheetOpen = true"
            >
              <HelpCircle class="h-4 w-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              side="right"
              :side-offset="10"
              class="orbital-tooltip z-50 flex items-center gap-2 border border-border-hairline bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-xl"
            >
              <span>{{ $t('nav.help') }}</span>
              <BrandKeycapBadge :keys="getKeycaps('ui.toggleHelp')" size="sm" />
            </TooltipContent>
          </TooltipPortal>
        </TooltipRoot>

        <!-- Account Identity & Icon-Only Sign Out -->
        <div
          v-if="sidebarState === 'expanded'"
          class="flex items-center justify-between gap-2 border-t border-border-hairline px-1 pt-2"
        >
          <NuxtLink
            v-if="authStore.user"
            :to="localePath('/app/profile')"
            data-tour="nav-profile"
            :aria-label="$t('nav.profile')"
            :active-class="activeLinkClass"
            class="flex min-w-0 flex-1 items-center gap-2 border border-transparent px-1.5 py-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            <UiUserAvatar
              size="sm"
              :src="accountAvatarUrl"
              :name="accountDisplayName"
              :email="accountEmail"
            />
            <span class="min-w-0">
              <span class="block truncate text-xs font-medium text-text-primary" :title="accountDisplayName">
                {{ accountDisplayName }}
              </span>
              <span
                v-if="accountSecondary"
                class="tabular-telemetry block truncate text-[11px] text-text-muted"
                :title="accountSecondary"
              >
                {{ accountSecondary }}
              </span>
            </span>
          </NuxtLink>

          <TooltipRoot>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="btn-press ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted transition-colors hover:border-destructive/50 hover:bg-bg-hover hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                :aria-label="$t('nav.signOut')"
                @click="handleSignOut"
              >
                <LogOut class="h-4 w-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                :side-offset="10"
                class="orbital-tooltip z-50 border border-border-hairline bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-xl"
              >
                {{ $t('nav.signOut') }}
              </TooltipContent>
            </TooltipPortal>
          </TooltipRoot>
        </div>

        <div v-else class="flex flex-col items-center gap-1.5 border-t border-border-hairline pt-2">
          <TooltipRoot v-if="authStore.user">
            <TooltipTrigger as-child>
              <NuxtLink
                :to="localePath('/app/profile')"
                data-tour="nav-profile"
                :aria-label="$t('nav.profile')"
                :active-class="activeLinkClass"
                class="inline-flex h-10 w-10 items-center justify-center border border-transparent transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                <UiUserAvatar
                  size="sm"
                  :src="accountAvatarUrl"
                  :name="accountDisplayName"
                  :email="accountEmail"
                />
              </NuxtLink>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                :side-offset="10"
                class="orbital-tooltip z-50 border border-border-hairline bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-xl"
              >
                <div>{{ $t('nav.profile') }}</div>
                <div class="text-[11px] text-text-muted">{{ accountDisplayName }}</div>
              </TooltipContent>
            </TooltipPortal>
          </TooltipRoot>

          <TooltipRoot>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="btn-press inline-flex h-10 w-10 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted transition-colors hover:border-destructive/50 hover:bg-bg-hover hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                :aria-label="$t('nav.signOut')"
                @click="handleSignOut"
              >
                <LogOut class="h-4 w-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                :side-offset="10"
                class="orbital-tooltip z-50 border border-border-hairline bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-xl"
              >
                {{ $t('nav.signOut') }}
              </TooltipContent>
            </TooltipPortal>
          </TooltipRoot>
        </div>
      </div>
    </aside>

    <!-- Floating Desktop Reopen Trigger (when Sidebar State === 'hidden') -->
    <TooltipRoot v-if="sidebarState === 'hidden'">
      <TooltipTrigger as-child>
        <button
          type="button"
          class="btn-press fixed left-3 top-3 z-30 hidden h-9 w-9 items-center justify-center border border-border-hairline bg-bg-elevated/90 text-text-muted shadow-lg backdrop-blur-md transition-colors hover:border-signal/60 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal md:inline-flex"
          :aria-label="$t('nav.sidebarShow')"
          @click="reopenSidebar"
        >
          <PanelLeftOpen class="h-4 w-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side="right"
          :side-offset="10"
          class="orbital-tooltip z-50 flex items-center gap-2 border border-border-hairline bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-xl"
        >
          <span>{{ $t('nav.sidebarShow') }}</span>
          <BrandKeycapBadge :keys="getKeycaps('ui.toggleSidebar')" size="sm" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
