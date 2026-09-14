import { NODE_VISIBLE } from '@scene-inspector/protocol';
import type {
  Json,
  NodeId,
  PropertyDescriptor,
  SceneNode,
  SectionSchema,
} from '@scene-inspector/protocol';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaCheck as LoggedIcon } from 'react-icons/fa6';
import { LuTerminal as ConsoleIcon } from 'react-icons/lu';

import { CollapsibleSection } from '../../../components/collapsible/collapsible-section.js';
import { Button } from '../../../components/ui/button.js';
import { Hint } from '../../../components/ui/tooltip.js';
import { PropertyEntry } from '../../../components/properties/propertyEntry.js';
import { FallbackProperty, propertyMap } from '../../../components/properties/propertyMap.js';
import { propertyData } from '../../../components/properties/propertyTypes.js';
import { cn, formatCamelCase } from '../../../lib/utils.js';
import type { Condition } from './properties/filter.js';
import { visibleFields } from './properties/filter.js';
import { MultiStyleTextSection } from './properties/MultiStyleTextSection.js';
import { ObjectSnippetSection } from './properties/ObjectSnippetSection.js';
import { fieldSnippet, snippetName } from './properties/objectSnippet.js';
import { TabStrip } from '../../../components/ui/tab-strip.js';
import type { MessageKey } from '../../../i18n/index.js';
import { useT } from '../../../i18n/index.js';
import { SpineSection } from './properties/spine/SpineSection.js';
import { SpriteSection } from './properties/SpriteSection.js';
import { StyleSnippetSection } from './properties/StyleSnippetSection.js';
import { TextSection } from './properties/TextSection.js';
import type { Client } from '../../../transport/client.js';
import { useResource } from '../../../transport/useResource.js';
import { useRevisioned } from '../../../transport/useRevisioned.js';

/**
 * The properties of the selected node, ported from the previous project — the
 * same foldable sections, the same labelled rows, the same editors, now split
 * into tabs by what the schema says each section belongs to.
 *
 * Underneath it is the split the protocol makes (docs/architecture.md §3.4):
 * the **schema** is static, keyed by type, fetched once; the **values** are
 * polled, and only for the keys currently on screen. A folded section
 * contributes no keys and is therefore never read — not filtered out
 * afterwards, never asked for. A tab that is not open contributes none either,
 * which is what keeps thirty style keys off the wire while the transform is
 * being looked at.
 */

/** Where every section that names no tab of its own is drawn. */
const DEFAULT_TAB = 'Properties';

/**
 * The one tab of this strip that is a word rather than a class.
 *
 * `Text` and `Spine` are names out of PixiJS and are left as the schema
 * declares them, so they are simply absent here and fall through (§3.14).
 */
const TAB_LABEL_KEYS: Record<string, MessageKey> = {
  [DEFAULT_TAB]: 'tab.properties',
};

/**
 * The section of **rows** whose names copy the field they label when
 * double-clicked. The Text tab offers the same gesture, on the fields of its
 * style, and decides that for itself (`TextSection.tsx`).
 *
 * General rather than every section here, and that is the point of naming it: a
 * node's own placement is what gets carried back into a game, and it all lives
 * in this one section. Info's rows are not fields of anything anyone writes — a
 * type, a list of classes the framework put there — and Interaction's two are
 * flags rather than the look of a node.
 */
const COPYABLE_SECTION = 'general';

/** Faster than the tree: this is what a hand on a slider is watching. */
const VALUES_INTERVAL_MS = 250;

/** The schema cannot change for a type, so this is a safety net, not a poll. */
const SCHEMA_INTERVAL_MS = 30_000;

/**
 * Which Text fields depend on which switch.
 *
 * This lives in the panel, not in the schema: saying it in the protocol would
 * mean inventing an expression language for it, and the architecture asks for
 * the condition to live in the component instead (§3.4).
 *
 * Both versions' names are listed, because both are declared — v6/v7 spell the
 * shadow settings flat, v8 nests them.
 */
const SHADOW = { anyOf: ['style.dropShadow'] };

/**
 * The same for the stroke, whose switch is not PixiJS's at all: there is no flag
 * for a stroke, so whether there is one is concluded from its width and answered
 * under a synthetic key (`properties/stroke.ts`).
 *
 * The width is conditioned along with the colour and the join, and deliberately:
 * with the switch off the group is its heading and nothing else, exactly as the
 * shadow's is. A width is how the stroke is switched, not a setting beside it.
 */
const STROKED = { anyOf: ['style.strokeEnabled'] };

/**
 * The wrap box serves two switches: it is what wrapping wraps at, and what a
 * game's own `flexFont` shrinks the text to fit. Either makes it worth showing.
 */
const WRAP_BOX = { anyOf: ['style.wordWrap', 'style.flexFont'] };

const TEXT_CONDITIONS: Record<string, Condition> = {
  'style.wordWrapWidth': WRAP_BOX,
  'style.wordWrapHeight': WRAP_BOX,
  'style.stroke': STROKED,
  'style.strokeThickness': STROKED,
  'style.lineJoin': STROKED,
  'style.stroke.color': STROKED,
  'style.stroke.width': STROKED,
  'style.stroke.join': STROKED,
  'style.dropShadowColor': SHADOW,
  'style.dropShadowAlpha': SHADOW,
  'style.dropShadowBlur': SHADOW,
  'style.dropShadowAngle': SHADOW,
  'style.dropShadowDistance': SHADOW,
  'style.dropShadow.color': SHADOW,
  'style.dropShadow.alpha': SHADOW,
  'style.dropShadow.blur': SHADOW,
  'style.dropShadow.angle': SHADOW,
  'style.dropShadow.distance': SHADOW,
};

/**
 * The tabs of a schema, in the order their sections first mention them.
 *
 * The order therefore comes from the schema rather than from a list here: the
 * sections every node has come first, and a type's own sections follow.
 */
function tabsOf(sections: readonly SectionSchema[]): string[] {
  const names: string[] = [];

  for (const section of sections) {
    const tab = section.tab ?? DEFAULT_TAB;
    if (!names.includes(tab)) names.push(tab);
  }

  return names;
}

/** Consecutive fields sharing a `group` are drawn under one subheading. */
interface Group {
  name: string | undefined;
  fields: PropertyDescriptor[];
}

function groupFields(fields: readonly PropertyDescriptor[]): Group[] {
  const groups: Group[] = [];

  for (const field of fields) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.name === field.group) last.fields.push(field);
    else groups.push({ name: field.group, fields: [field] });
  }

  return groups;
}

function Row({
  descriptor,
  value,
  copyable,
  onChange,
  isLast,
}: {
  descriptor: PropertyDescriptor;
  value: Json | undefined;
  /** Whether a double click on this row's name copies the field as source. */
  copyable: boolean;
  onChange: (key: string, value: Json) => void;
  isLast: boolean;
}) {
  const Component = propertyMap[descriptor.editor] ?? FallbackProperty;

  // The trailing comma is the row's, not the printer's: a field copied on its
  // own is going into an object beside other fields, and the one it is pasted
  // after is almost never the last.
  const printed = copyable ? fieldSnippet(descriptor, value) : null;

  return (
    <PropertyEntry
      title={descriptor.label === '' ? formatCamelCase(descriptor.key) : descriptor.label}
      input={<Component {...propertyData(descriptor, value, onChange)} />}
      copy={printed === null ? undefined : `${printed},`}
      isLast={isLast}
    />
  );
}

function Section({
  section,
  values,
  presence,
  client,
  nodeId,
  nodeName,
  nodeVisible,
  bare,
  onChange,
  onCollapse,
}: {
  section: SectionSchema;
  client: Client;
  nodeId: number;
  /**
   * Whether the node draws, as the tree reports it.
   *
   * Only the Spine section wants it, and only for one thing: showing a test
   * Spine means hiding this one, and putting it back has to put it back the way
   * it was. Reading it here rather than there is what makes that possible — by
   * the time the section could ask, the panel would have already changed it.
   */
  nodeVisible: boolean;
  /** What the snippet writes the object under — the node's name, or its type. */
  nodeName: string;
  /**
   * Drawn without a header of its own, because the tab above it already is one.
   * A section named after its tab would otherwise say the same word twice and
   * offer to fold away everything the tab was opened for.
   */
  bare: boolean;
  /** What the editors show. Between two selections these are still the previous node's. */
  values: Record<string, Json> | null;
  /**
   * What decides that a field does not exist here: this node's own reading when
   * there is one, and otherwise the last reading of a node of the same type,
   * which answers the same question for every field that depends on the
   * PixiJS version rather than on the node.
   */
  presence: Record<string, Json>;
  onChange: (key: string, value: Json) => void;
  onCollapse: (id: string, collapsed: boolean) => void;
}) {
  const shown = useMemo(() => visibleFields(section.fields, presence), [section, presence]);
  const groups = useMemo(() => groupFields(shown), [shown]);

  // The rows survive a change of selection — that is the point of not
  // remounting the panel — but the editors inside them must not: a half-typed
  // draft belongs to the node it was typed on. Keying each row by the node
  // gives every editor a clean start without the section itself disappearing.
  const rowKey = (key: string): string => `${String(nodeId)}:${key}`;

  // Spine and MultiStyleText declare no descriptors at all: their data is per
  // node rather than per type, so it travels through commands of its own and the
  // section exists to give the panel somewhere to draw it. Everything else with
  // nothing left to show is not worth a header.
  const drawsWithoutFields = section.fields.length === 0 && section.layout.startsWith('custom:');
  if (groups.length === 0 && !drawsWithoutFields) return null;

  // The two sections that draw their own header, because they are the ones that
  // decide whether they exist. Only a patched text has a style worth copying,
  // and on PixiJS 8 only some texts carry tags — both are properties of the node
  // rather than of its type, so nothing here can know before the page answers.
  //
  // Keyed on the node like the sections below: another node's tags are a
  // different set entirely, and the held revision behind the poll must not carry
  // across to it.
  if (section.layout === 'custom:multiStyleText') {
    return (
      <MultiStyleTextSection
        key={String(nodeId)}
        client={client}
        id={nodeId}
        title={section.title}
      />
    );
  }

  if (section.layout === 'custom:textStyleSnippet') {
    return (
      <StyleSnippetSection
        key={String(nodeId)}
        client={client}
        id={nodeId}
        title={section.title}
      />
    );
  }

  // The third section to draw its own header, and for the same reason as the
  // two above: the button that copies the whole object lives in it. Folding is
  // still reported, so a folded snippet stops being asked for.
  if (section.layout === 'custom:objectSnippet') {
    return (
      <ObjectSnippetSection
        title={section.title}
        name={nodeName}
        fields={shown}
        values={values}
        onCollapse={(collapsed) => {
          onCollapse(section.id, collapsed);
        }}
      />
    );
  }

  const body = section.layout === 'custom:spine' ? (
    // Keyed on the node for the same reason as the section below: a skeleton
    // carries its own tracks, its own animation list and the user's choice of
    // skin, and none of that means anything on the next node.
    <SpineSection key={String(nodeId)} client={client} id={nodeId} visible={nodeVisible} />
  ) : section.layout === 'custom:sprite' ? (
    <SpriteSection
      client={client}
      nodeId={nodeId}
      fields={shown}
      values={values}
      onChange={onChange}
    />
  ) : section.layout === 'custom:text' ? (
    <TextSection
      section={section}
      values={values}
      presence={presence}
      conditions={TEXT_CONDITIONS}
      onChange={onChange}
      nodeId={nodeId}
    />
  ) : (
    <div className="px-1 py-1 [&>*:first-child]:pt-0">
      {groups.map((group, groupIndex) => {
        const isLastGroup = groupIndex === groups.length - 1;

        const rows = group.fields.map((descriptor, index) => (
          <Row
            key={rowKey(descriptor.key)}
            descriptor={descriptor}
            value={values?.[descriptor.key]}
            copyable={section.id === COPYABLE_SECTION}
            onChange={onChange}
            isLast={index === group.fields.length - 1 && (group.name !== undefined || isLastGroup)}
          />
        ));

        if (group.name === undefined) return rows;

        return (
          <div key={group.name}>
            <div className="border-border text-muted-foreground border-b px-3 py-0.5 text-xs font-medium">
              {group.name}
            </div>
            <div className="py-1 pl-6 pr-1 [&>*:first-child]:pt-0">{rows}</div>
          </div>
        );
      })}
    </div>
  );

  // Nothing folds a bare section away, so its keys are always in the request —
  // which is right: they are what its tab was opened to look at.
  if (bare) return body;

  return (
    <CollapsibleSection
      title={section.title}
      className="border-x"
      onCollapse={(collapsed) => {
        onCollapse(section.id, collapsed);
      }}
    >
      {body}
    </CollapsibleSection>
  );
}

/**
 * Kept mounted across selections on purpose.
 *
 * Remounting per node was the honest thing to write and the wrong thing to
 * watch: every selection threw the schema away and rendered nothing until the
 * page answered. In the playground that answer arrives in a microtask, so the
 * empty render never reaches the screen; behind `inspectedWindow.eval` it takes
 * a real round trip and the whole panel visibly blinks empty.
 *
 * So nothing is thrown away here. The schema is remembered per type — it is
 * static per type, which is exactly why the protocol keys it that way — and the
 * values already on screen stay until the new ones arrive. Fields do not
 * disappear; the data in them changes. What must not carry over is a draft in
 * an editor, and that is handled by keying the rows on the node instead.
 */
function NodeProperties({ client, node }: { client: Client; node: SceneNode }) {
  // Lives here rather than at module scope so it cannot outlive the panel, or
  // a page that reloaded into a different PixiJS.
  const schemaByType = useRef(new Map<string, SectionSchema[]>());

  const { data: fetched } = useResource(
    async () => ({
      type: node.type,
      sections: await client.call('scene.propSchema', { type: node.type }),
    }),
    // Without the key the loop would keep asking about the previously selected
    // node's type until the 30s safety net came round.
    { intervalMs: SCHEMA_INTERVAL_MS, key: node.type },
  );

  useEffect(() => {
    if (fetched !== null) schemaByType.current.set(fetched.type, fetched.sections);
  }, [fetched]);

  // The freshest answer wins while it is about this type; otherwise whatever
  // the panel was told about this type before, which is what makes coming back
  // to a known type cost no round trip at all.
  const sections =
    fetched !== null && fetched.type === node.type
      ? fetched.sections
      : (schemaByType.current.get(node.type) ?? null);

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  // The panel opens on the properties every node has, and is not asked to
  // remember anything else: a tab chosen for one node says nothing about the
  // next selection, and a panel that opens somewhere other than where it was
  // left is worse than one that always opens in the same place.
  const t = useT();
  const [tab, setTab] = useState(DEFAULT_TAB);

  const tabs = useMemo(() => tabsOf(sections ?? []), [sections]);

  // The chosen tab can be one this node does not have. Falling back without
  // touching the state is what lets it come back when a node that has it is
  // selected again — clicking through a list of captions does not keep
  // throwing the Text tab away.
  const activeTab = tabs.includes(tab) ? tab : (tabs[0] ?? DEFAULT_TAB);

  const shownSections = useMemo(
    () => (sections ?? []).filter((section) => (section.tab ?? DEFAULT_TAB) === activeTab),
    [sections, activeTab],
  );

  // Deduplicated, because two sections may want the same key: the Object
  // snippet writes out the very fields General draws, and asking for each of
  // them twice would put the duplication on the wire and in the reading.
  const keys = useMemo(
    () => [
      ...new Set(
        shownSections
          .filter((section) => !collapsed.has(section.id))
          .flatMap((section) => section.fields.map((field) => field.key)),
      ),
    ],
    [shownSections, collapsed],
  );

  // Which node the values on hand describe. They outlive the selection on
  // purpose — a field showing the previous node's number for one round trip
  // reads as an update, while an empty field reads as a flash — but a value
  // whose node is no longer selected must not be trusted to say what exists.
  const valuesNode = useRef<NodeId | null>(null);

  /**
   * What the panel has learnt about which fields a node of a given type
   * carries.
   *
   * Presence is a property of the type and of the running PixiJS rather than of
   * the node: `label` is v8's, `id` and `classesList` belong to whatever
   * framework set them. Remembering the last reading per type is what lets the
   * fields of a newly selected node be decided before its own values arrive.
   * Without it every switch showed the fields this PixiJS does not have and
   * then took them away again a round trip later, which is the list jumping.
   *
   * Readings are merged rather than replaced, because a folded section is not
   * read: forgetting what a key answered last time would make it reappear the
   * moment its section is unfolded.
   */
  const readingByType = useRef(new Map<string, Record<string, Json>>());

  const { data: values } = useRevisioned(
    async (rev) => {
      const asked = node.id;
      const result = await client.call('scene.propValues', { id: asked, keys, rev: rev ?? undefined });
      valuesNode.current = asked;
      return result;
    },
    {
      intervalMs: VALUES_INTERVAL_MS,
      enabled: keys.length > 0,
      // The request is about this node and this set of keys; folding a section
      // or changing tab has to take effect now, not on whatever tick comes next.
      key: `${String(node.id)}:${keys.join(',')}`,
    },
  );

  const fresh = valuesNode.current === node.id ? values : null;

  useEffect(() => {
    if (fresh === null) return;
    const previous = readingByType.current.get(node.type);
    readingByType.current.set(node.type, previous === undefined ? fresh : { ...previous, ...fresh });
  }, [fresh, node.type]);

  /**
   * What is known about this node's fields: everything the type has ever
   * answered, with this node's own reading laid over it.
   *
   * Laid over rather than chosen between, because a reading only covers the
   * keys of the tab it was made for. Preferring it outright would mean every
   * return to a tab arrived with nothing known about its fields — and knowing
   * nothing is what makes a list of rows jump.
   */
  const presence = useMemo(
    () => ({ ...readingByType.current.get(node.type), ...fresh }),
    [fresh, node.type],
  );

  /**
   * Whether the reading covers what this tab is about to draw.
   *
   * Until it does, the tab draws nothing. It is the rule that already applies
   * to the first node of a type — a row that appears and is taken away again is
   * worse than one that arrives a round trip late — and a tab is where it bites
   * hardest: Text declares both PixiJS lines' names for the same setting, so an
   * uncovered Text tab would show two of every shadow row and drop half of them
   * a moment later. It costs one round trip, once per tab per type: readings
   * are merged, so coming back is instant.
   */
  const covered = keys.every((key) => key in presence);

  const onCollapse = useCallback((id: string, isCollapsed: boolean) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (isCollapsed) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const onChange = useCallback(
    (key: string, value: Json) => {
      // Deliberately not awaited and not mirrored locally: the next poll is
      // 250ms away and reports what the scene actually holds, which is the
      // honest answer when Pixi clamps or ignores a value.
      client.send('scene.setProp', { id: node.id, key, value });
    },
    [client, node.id],
  );

  return (
    <div className="relative left-0 top-0 w-full overflow-hidden">
      <div className="flex h-full flex-col">
        {/* Drawn even for a single tab: it is the panel's own header, and a
            header that comes and goes with the selection moves everything under
            it by its own height.

            The strip shares its row with the console button, the way the
            settings popover's shares one with its close: the tabs take the
            slack (`flex-1`), so nothing about them changes by being beside
            something. */}
        {/* No rule of its own: the strip keeps the transparent one it draws
            for itself (`tab-strip.tsx`), and a wrapper that added a visible
            border here would put back exactly the line that component is at
            pains not to draw. */}
        <div className="flex items-center">
          <TabStrip
            tabs={tabs.length === 0 ? [DEFAULT_TAB] : tabs}
            active={activeTab}
            onSelect={setTab}
            className="flex-1"
            labelOf={(tab) => {
              const key = TAB_LABEL_KEYS[tab];
              return key === undefined ? tab : t(key);
            }}
          />

          {/* Here rather than in the tree's toolbar, and rather than on a row:
              every control in that toolbar is a way of looking at the *scene*,
              while this one is about the node this pane is already devoted to.
              It also keeps company with the gesture nearest it in meaning — a
              double click on a field's name, which copies that field as source.
              Both hand the node to somewhere you can go on working with it. */}
          {/* Keyed on the node: the tick belongs to the node it was pressed
              for, and one still showing after the selection moved would be
              claiming something about a node nobody has logged. */}
          <LogButton key={node.id} client={client} id={node.id} />
        </div>

        <div className="flex-1 overflow-auto p-2">
          {covered
            ? shownSections.map((section) => (
                <Section
                  key={section.id}
                  section={section}
                  values={values}
                  presence={presence}
                  client={client}
                  nodeId={node.id}
                  nodeName={snippetName(node.name, node.type)}
                  nodeVisible={(node.flags & NODE_VISIBLE) !== 0}
                  bare={section.title === activeTab}
                  onChange={onChange}
                  onCollapse={onCollapse}
                />
              ))
            : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Writes the node to the page's console, and says that it did.
 *
 * The saying is the reason this is a component. What the button produces
 * happens in another tab of DevTools, so a press that changed nothing on
 * screen was indistinguishable from a press that missed: the panel looked the
 * same either way, and the only way to find out was to go and look at the
 * Console.
 *
 * A tick for two seconds, which is what `CopyButton` already does for the
 * other thing that leaves the panel — a pane this narrow has nowhere to put a
 * toast, and two controls confirming themselves in two different ways would be
 * two things to learn. It is tinted as well as swapped, because this one is a
 * ghost button in a tab strip rather than an outlined one in a header, and a
 * glyph changing shape at that size is easy to miss.
 *
 * The command is not awaited: it answers nothing, and a tick that waited for a
 * round trip would lag the press it is confirming. What the panel is
 * confirming is the press — the console is where the result is.
 */
function LogButton({ client, id }: { client: Client; id: NodeId }) {
  const t = useT();
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    if (!logged) return;

    const timer = setTimeout(() => {
      setLogged(false);
    }, LOGGED_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [logged]);

  return (
    <Hint text={t('scene.prop.logNode')}>
      <Button
        variant="ghost"
        size="xs"
        className={cn('mr-1 h-5 w-7 flex-none p-0', logged && 'text-primary')}
        onClick={() => {
          client.send('scene.log', { id });
          setLogged(true);
        }}
      >
        {logged ? <LoggedIcon /> : <ConsoleIcon />}
      </Button>
    </Hint>
  );
}

/** As long as `CopyButton`'s tick stands, for the same reason. */
const LOGGED_MS = 2000;

/**
 * Its own component so the hook has somewhere to live: `SceneProperties`
 * returns before it would reach one.
 */
function NothingSelected() {
  const t = useT();

  return <div className="text-muted-foreground p-3 text-xs">{t('scene.selectNode')}</div>;
}

export function SceneProperties({ client, node }: { client: Client; node: SceneNode | null }) {
  if (node === null) {
    return <NothingSelected />;
  }

  return <NodeProperties client={client} node={node} />;
}
