import { useAuthStore } from '~/stores/auth';
import { hasFirebaseConfig } from '~/utils/firebaseClient';

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return;

  const authStore = useAuthStore();
  const forceDemo = to.query.demo === '1' || !hasFirebaseConfig();

  await authStore.init(forceDemo);

  if (!authStore.isAuthenticated) {
    const localePath = useLocalePath();
    return navigateTo(localePath('/login'));
  }
});
