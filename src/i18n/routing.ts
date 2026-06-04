import {defineRouting} from 'next-intl/routing';
import {createNavigation} from 'next-intl/navigation';

export const routing = defineRouting({
  locales: ['he', 'en'],
  defaultLocale: 'he',
  localePrefix: 'as-needed' // Only adds /en if it's english, he is default
});

export const {Link, redirect, usePathname, useRouter} =
  createNavigation(routing);
