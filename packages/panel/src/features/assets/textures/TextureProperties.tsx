import type { NodeId, TextureFrame, TextureInfo } from '@scene-inspector/protocol';
import { useMemo, useState } from 'react';

import { SaveCollapsibleSection } from '../../../components/collapsible/collapsible-section.js';
import { PropertyEntry } from '../../../components/properties/propertyEntry.js';
import type { MessageKey } from '../../../i18n/index.js';
import { useT } from '../../../i18n/index.js';
import { TextProperty } from '../../../components/properties/text-property.js';
import { Segmented } from '../../../components/ui/segmented.js';
import { Hint } from '../../../components/ui/tooltip.js';
import { formatNumber } from '../../../lib/formatNumber.js';
import { useLocalStorage } from '../../../lib/localStorage.js';
import { cn } from '../../../lib/utils.js';
import type { Client } from '../../../transport/client.js';
import { useResource } from '../../../transport/useResource.js';
import { textureName } from './arrange.js';
import { megabytes } from './bytes.js';
import { FrameList } from './FrameList.js';
import { UsersList } from './UsersList.js';

/**
 * The selected texture: a large preview and its metadata, ported from the
 * previous project's right-hand pane.
 *
 * The preview here is a **second** request, at a larger size — the click is
 * what asks for it, and the grid's thumbnail is left as it is. That is the
 * split §3.6 asks for: a full-size view is a command, not a side effect of
 * listing.
 */

/** Fills the 256px frame on a HiDPI screen; the page never upscales past it. */
const FIT_MAX = 512;

/** The frame the preview is drawn in — `h-64 w-64`, said as a number. */
const PREVIEW_BOX = 256;

/**
 * A safety net, and only that.
 *
 * A preview *can* change under a texture — a `Text` redrawn into the same
 * texture is the ordinary case — but the list says when, so the request is
 * keyed on that rather than waiting for a tick. What is left for the interval
 * is whatever the page manages to change without saying so.
 */
const PREVIEW_INTERVAL_MS = 30_000;

type Background = 'checker' | 'dark' | 'light';

/** The labels are glyphs, so only the hints have anything to translate. */
const BACKGROUND_OPTIONS: readonly { value: Background; label: string; titleKey: MessageKey }[] = [
  { value: 'checker', label: '▨', titleKey: 'assets.background.checker' },
  { value: 'dark', label: '■', titleKey: 'assets.background.black' },
  { value: 'light', label: '□', titleKey: 'assets.background.white' },
];

const BACKGROUND_CLASS: Record<Background, string> = {
  checker: 'checkerboard',
  dark: 'bg-black',
  light: 'bg-white',
};

/**
 * What a row says when there is nothing to say.
 *
 * One word for all of it, rather than a blank: a field left empty reads as a
 * panel that failed to fill it in, and several of these are genuinely unknown
 * on v6/v7 — that line has no per-texture antialias and no garbage collector
 * to be told about one.
 */
const UNKNOWN = 'unknown';

const blank = (value: string): string => (value === '' ? UNKNOWN : value);

/** `null` is a third answer here, and it is not "no". */
const yesNo = (value: boolean | null): string =>
  value === null ? UNKNOWN : value ? 'yes' : 'no';

/**
 * File sizes are read against what a build budget is written in, and that is
 * kilobytes — the same unit the previous project's tile used. Megabytes are for
 * what a texture costs on the GPU, which is a different order of magnitude.
 */
const kilobytes = (bytes: number | null): string =>
  bytes === null ? UNKNOWN : `${formatNumber(bytes / 1024, 1)} KB`;

/**
 * How large the preview is actually drawn.
 *
 * Computed rather than measured off the image, because two other things need
 * the same answer: the outline over a frame of a sheet, which is a rectangle in
 * the texture's own texels and has to be scaled by exactly this, and the line
 * that says how much of the texture is on screen. Reading it back from a loaded
 * image would give those two an answer that arrives a frame late and is absent
 * whenever the image is not there.
 *
 * Never an upscale, which is the rule the page keeps as well: a 16×16 icon is
 * drawn at 16×16 rather than blown up to fill the frame.
 */
function fitted(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= 0) return { width: 0, height: 0 };

  const scale = Math.min(1, PREVIEW_BOX / longest);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Where the texture was loaded from, when that is somewhere a tab can go.
 *
 * A texture drawn into a canvas was never loaded from anywhere, and a `url`
 * that is itself a `data:` is not an address either — the list reports those as
 * their media type alone (§3.6), which is a description and not a location.
 * Both answer `null`, and the preview then offers nothing to double-click:
 * the affordance is only there where there is something behind it.
 */
function addressOf(texture: TextureInfo): string | null {
  if (texture.url === null || texture.url.startsWith('data:')) return null;
  return texture.url;
}

/**
 * One line of metadata.
 *
 * `h-auto shrink-0` overrides the `h-full` the shared `PropertyEntry` carries.
 * That height is harmless in the block flow the Scene tab draws its rows in,
 * but here the rows are flex items, and an item asking for the container's
 * whole height gets a flex basis to match. Seven of those overflowed the pane
 * and were then shrunk in proportion, so the gap between rows grew with the
 * pane instead of staying put.
 *
 * No rule between rows, and they sit all but touching. Nothing here is edited —
 * eighteen readings of one texture are a block of text, and both the hairlines
 * and the air around them were spacing apart something that reads better as one
 * thing.
 *
 * Thirteen characters of name rather than the shared eleven, which broke
 * `Power of two` over two lines. The room comes off the value, and none of
 * these readings is long enough to miss it.
 *
 * The field is shortened from the caller rather than in `TextProperty`: an
 * editor on the Scene tab is a target for a pointer and keeps the height that
 * makes it one, while these are read and never clicked.
 */
function Row({ title, value }: { title: string; value: string }) {
  return (
    <PropertyEntry
      className="h-auto w-full shrink-0 [&_input]:h-5"
      title={title}
      titleClassName="w-[13ch]"
      separated={false}
      input={
        <TextProperty
          value={value}
          prop={title}
          readOnly
          entry={{ type: 'text', onChange: () => undefined }}
        />
      }
    />
  );
}

/**
 * The pane, and the strip along the top of it.
 *
 * That strip used to be empty — a spacer, there so the pane lined up with the
 * grid's toolbar beside it. It is the natural place for the two things that are
 * about the *view* rather than about the texture: what the texture is called,
 * and what the preview is drawn against.
 *
 * The preview is held **out of the scroll**, between two rules of its own: it
 * is the thing everything below is about, and a frame outlined on a picture
 * that has been scrolled off the top is an answer nobody sees. What scrolls is
 * the reading matter under it.
 *
 * That scroll box is a **column**, not a run of blocks, so that the two lists
 * at the foot of it can take the room nobody else wants: on a sheet with fifty
 * frames and everything else folded away, half the pane used to sit empty under
 * a list scrolling nine rows at a time.
 */
function Frame({
  header,
  preview,
  children,
}: {
  header?: React.ReactNode;
  preview?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative left-0 top-0 w-full overflow-hidden">
      <div className="flex h-full flex-col">
        <div className="border-border flex h-8 max-h-8 items-center gap-2 border-b px-2">
          {header}
        </div>
        {preview !== undefined && (
          <div className="border-border shrink-0 border-b p-2">{preview}</div>
        )}
        <div className="flex flex-1 flex-col overflow-auto p-2">{children}</div>
      </div>
    </div>
  );
}

export function TextureProperties({
  client,
  texture,
  onReveal,
}: {
  client: Client;
  texture: TextureInfo | null;
  /** Follow one of the nodes drawing this texture into the Scene tab. */
  onReveal: (id: NodeId) => void;
}) {
  const t = useT();

  // Resolved here, not in the table above, so the hints follow the language.
  const backgrounds = useMemo(
    () => BACKGROUND_OPTIONS.map((option) => ({ ...option, title: t(option.titleKey) })),
    [t],
  );
  const id = texture?.id ?? null;

  const [background, setBackground] = useLocalStorage<Background>(
    'assets.preview.background',
    'checker',
  );

  /**
   * How large a preview to ask the page for.
   *
   * Never more than the texture is, because the page does not upscale: asking
   * 1024 of a 64px icon returns 64px, and asking for the difference would be
   * asking the page to do nothing slowly.
   */
  const longest = texture === null ? 0 : Math.max(texture.pixelWidth, texture.pixelHeight);
  const max = longest === 0 ? FIT_MAX : Math.min(longest, FIT_MAX);

  const { data } = useResource(
    () =>
      id === null
        ? Promise.resolve({ dataUrl: null })
        : client.call('assets.preview', { id, max }),
    // The key carries how many times the page has replaced this texture's
    // pixels, so a `Text` that changes its string is re-asked at once rather
    // than at whatever the interval below happens to be.
    {
      intervalMs: PREVIEW_INTERVAL_MS,
      enabled: id !== null,
      key: texture === null ? undefined : `${String(id)}:${String(texture.updates)}`,
    },
  );

  /** The frame the pointer is over in the list below, outlined on the preview. */
  const [hovered, setHovered] = useState<TextureFrame | null>(null);

  if (texture === null) {
    return (
      <Frame>
        <p className="text-center">{t('assets.selectTexture')}</p>
      </Frame>
    );
  }

  const preview = data?.dataUrl ?? null;
  const name = textureName(texture);

  const address = addressOf(texture);
  const shown = fitted(texture.pixelWidth, texture.pixelHeight);

  const rows: { title: string; value: string }[] = [
    { title: 'Name', value: name },
    { title: 'Label', value: texture.label === '' ? 'Unnamed' : texture.label },
    {
      title: 'Size',
      value: `${formatNumber(texture.width, 1)} x ${formatNumber(texture.height, 1)}`,
    },
    {
      title: 'Pixel size',
      value: `${formatNumber(texture.pixelWidth, 1)} x ${formatNumber(texture.pixelHeight, 1)}`,
    },
    { title: 'Resolution', value: formatNumber(texture.resolution, 2) },
    { title: 'Format', value: blank(texture.format) },
    { title: 'GPU size', value: megabytes(texture.gpuSize) },
    { title: 'On GPU', value: yesNo(texture.isLoaded) },
    { title: 'Mipmaps', value: yesNo(texture.mipmap) },
    { title: 'Alpha mode', value: blank(texture.alphaMode) },
    { title: 'Dimension', value: blank(texture.dimension) },
    { title: 'Antialias', value: yesNo(texture.antialias) },
    { title: 'Power of two', value: yesNo(texture.isPowerOfTwo) },
    { title: 'Auto GC', value: yesNo(texture.autoGarbageCollect) },
    { title: 'Destroyed', value: yesNo(texture.destroyed) },
    { title: 'Source', value: blank(texture.sourceKind) },
    { title: 'File size', value: kilobytes(texture.fileBytes) },
    { title: 'URL', value: texture.url ?? UNKNOWN },
  ];

  const header = (
    <>
      {/*
        `Hint` rather than `TooltipWrapper`: that one wraps its trigger in a
        button of its own, and the button — not this div — would then be the
        flex item, so the name kept its full width and pushed the controls off
        the end of a narrow pane. This one is `asChild`, so the div below is the
        trigger and keeps the `flex-1 min-w-0 truncate` that makes it give way.
      */}
      <Hint text={texture.label === '' ? t('assets.noName') : texture.label}>
        <div className="min-w-0 flex-1 truncate text-xs">{name}</div>
      </Hint>
      <Segmented
        className="shrink-0"
        variant="quiet"
        value={background}
        options={backgrounds}
        onChange={(value) => {
          setBackground(value as Background);
        }}
      />
    </>
  );

  /*
    Pinned above the scroll by `Frame`, so the outline a hovered frame draws on
    it is always where the eye already is.

    No height on the column, for the reason `Row` gives: it should be as tall as
    what it holds, and taking the pane's height instead handed that height on to
    every row and made the spacing between them a function of how tall the pane
    happened to be.
  */
  const previewBox = (
    <div className="flex w-full flex-col items-center">
        <Hint
          text={address === null ? '' : t('assets.openFile')}
          side="bottom"
          sideOffset={-54}
        >
          <div
            className={cn(
              BACKGROUND_CLASS[background],
              'flex h-64 w-64 shrink-0 items-center justify-center overflow-hidden rounded-sm',
              address !== null && 'cursor-pointer',
            )}
            onDoubleClick={
              address === null
                ? undefined
                : () => {
                    window.open(address, '_blank', 'noopener');
                  }
            }
          >
            {preview === null ? (
              <div className="flex h-full w-full items-center justify-center rounded-sm bg-black/20 text-sm text-white/70">
                No preview
              </div>
            ) : (
              /*
                A box the exact size the picture is drawn at, so the outline below
                can be placed in per cent of it. Laying the outline over the image
                itself would mean knowing what the browser scaled the image to —
                the frames are rectangles in the texture's own texels, and the
                preview is neither the texture's size nor a fixed fraction of it.

                The box is the **source's** shape, and one kind of preview is not
                that shape: what comes back from `readback` is the texture's
                frame — a text's 105×51 of letters inside a 128×64 sheet. Hence
                `object-contain`, which costs nothing in the ordinary case, where
                the picture is the source and already fills the box exactly, and
                keeps a `Text` or a render target from being stretched into a
                shape it never had. Those are also the textures with no frames to
                outline, so nothing is being placed over the letterboxing.
              */
              <div className="relative" style={{ width: shown.width, height: shown.height }}>
                <img src={preview} alt={name} className="block h-full w-full object-contain" />

                {hovered !== null && texture.pixelWidth > 0 && texture.pixelHeight > 0 && (
                  <div
                    className="border-frame-outline pointer-events-none absolute border-2"
                    style={{
                      left: `${String((hovered.x / texture.pixelWidth) * 100)}%`,
                      top: `${String((hovered.y / texture.pixelHeight) * 100)}%`,
                      width: `${String((hovered.width / texture.pixelWidth) * 100)}%`,
                      height: `${String((hovered.height / texture.pixelHeight) * 100)}%`,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </Hint>
    </div>
  );

  return (
    <Frame header={header} preview={previewBox}>
      {/*
        Foldable, and a section rather than a run of rows under the preview.

        Eighteen rows is the whole height of the pane, so `Frames` used to open
        somewhere below the fold, a long scroll away from the two lists it
        belongs beside. Folding this brings them up against the picture they are
        about.

        Open by default, because the metadata is what most people came for, and
        the choice is stored: it is a habit ("I work with frames" / "I read the
        numbers"), not something about one texture.
      */}
      <SaveCollapsibleSection
        storageKey="assets.info"
        title={t('assets.info')}
        defaultCollapsed={false}
      >
        <div className="flex w-full shrink-0 flex-col items-center p-1">
          {rows.map((row) => (
            <Row key={row.title} title={row.title} value={row.value} />
          ))}
        </div>
      </SaveCollapsibleSection>

      {/*
        Keyed on the texture: the frames are the sheet's, and a held revision
        must not carry across to the next one selected.
      */}
      <FrameList key={texture.id} client={client} id={texture.id} onHover={setHovered} />
      <UsersList key={`users:${String(texture.id)}`} client={client} id={texture.id} onReveal={onReveal} />
    </Frame>
  );
}
