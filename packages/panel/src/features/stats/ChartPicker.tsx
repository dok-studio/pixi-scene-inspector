import { LuListChecks as ChartsIcon } from 'react-icons/lu';

import { Button } from '../../components/ui/button.js';
import { useT } from '../../i18n/index.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover.js';
import { Hint } from '../../components/ui/tooltip.js';
import { GROUPS, type Metric } from './metrics.js';

/**
 * Which charts to draw, behind the gear beside the switch.
 *
 * A popover rather than a row of controls in the strip: the list is as long as
 * the scene has node types, which on a real game is a dozen or more, and a
 * chooser that grows with the data cannot live in a bar six units tall.
 *
 * **Hidden keys are what is stored, not shown ones.** A chart the panel has
 * never heard of — a node type this game has and the last one did not — is then
 * visible by default, which is the answer that needs no maintenance. Storing
 * the shown ones would have every new type arrive switched off.
 */

export function ChartPicker({
  metrics,
  hidden,
  onToggle,
  onAll,
}: {
  metrics: readonly Metric[];
  hidden: ReadonlySet<string>;
  onToggle: (key: string, shown: boolean) => void;
  /** Show every chart, or hide every one. */
  onAll: (shown: boolean) => void;
}) {
  const t = useT();
  return (
    <Popover>
      {/* The hint outside the trigger, as the navbar's gear has it: `Hint`
          renders a provider rather than an element, so a trigger asked to be
          its child would have nothing to hang a ref on. */}
      <Hint text={t('stats.pickCharts')}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 rounded-sm hover:bg-foreground/10 dark:hover:bg-foreground/[0.16]"
          >
            <ChartsIcon className="h-3 w-3 dark:stroke-white" />
          </Button>
        </PopoverTrigger>
      </Hint>

      <PopoverContent className="max-h-80 w-56 overflow-auto p-0">
        <div className="border-raised-border flex items-center justify-between border-b px-2 py-1">
          <span className="text-xs font-bold">{t('stats.charts')}</span>
          <span className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[11px]"
              onClick={() => {
                onAll(true);
              }}
            >
              {t('stats.charts.all')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[11px]"
              onClick={() => {
                onAll(false);
              }}
            >
              {t('stats.charts.none')}
            </Button>
          </span>
        </div>

        {GROUPS.map((group) => {
          const inGroup = metrics.filter((metric) => metric.group === group);
          if (inGroup.length === 0) return null;

          return (
            <div key={group}>
              <div className="text-muted-foreground px-2 pb-0.5 pt-1.5 text-[11px] font-bold">
                {group}
              </div>
              {inGroup.map((metric) => (
                <label
                  key={metric.key}
                  className="hover:bg-accent flex cursor-pointer items-center gap-2 px-2 py-0.5 text-xs"
                >
                  <Checkbox
                    checked={!hidden.has(metric.key)}
                    onCheckedChange={(next) => {
                      onToggle(metric.key, next === true);
                    }}
                    className="h-3.5 w-3.5"
                  />
                  <span className="min-w-0 truncate">{metric.title}</span>
                </label>
              ))}
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
