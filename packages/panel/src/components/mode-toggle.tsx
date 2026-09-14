import { FaMoon, FaSun } from 'react-icons/fa6';

import { useT } from '../i18n/index.js';
import { useTheme } from './theme-provider.js';
import { Button } from './ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js';

/** The sun/moon swap in the navbar, ported unchanged. */
export function ModeToggle() {
  const t = useT();
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-sm hover:bg-foreground/10 dark:hover:bg-foreground/[0.16]"
        >
          <FaSun className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 dark:fill-white" />
          <FaMoon className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 dark:fill-white" />
          <span className="sr-only">{t('navbar.theme')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            setTheme('light');
          }}
        >
          {t('navbar.theme.light')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setTheme('dark');
          }}
        >
          {t('navbar.theme.dark')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setTheme('system');
          }}
        >
          {t('navbar.theme.system')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
