/**
 * The contract between the DevTools panel and the code running in the page.
 *
 * This package deliberately has no dependencies: it is imported by the core
 * and by the panel, so anything added here leaks into both at once.
 */

export type { Json } from './json.js';
export type {
  AxesMode,
  AxesPin,
  DetectionSource,
  GradientFill,
  GradientStop,
  HighlightMode,
  NodeId,
  OutlineStyle,
  OverlayStyle,
  PixiMajor,
  PropertyDescriptor,
  PropertyEditor,
  Rect,
  SectionSchema,
  Revisioned,
  SceneMutation,
  SceneNode,
  SceneTreePayload,
  SessionStatus,
  SpineEvent,
  SpineInfo,
  SpineLive,
  SpineQueued,
  SpineSetupTrack,
  SpineTrack,
  SpineTrackParam,
  StatsFrame,
  StatsRecord,
  StatsTextures,
  TextTagMutation,
  TextTagStyle,
  TextureFrame,
  TextureId,
  TextureInfo,
  TextureUser,
  WrapBoxStyle,
} from './model.js';
export {
  DEFAULT_PICK_DEPTH,
  MAX_PICK_DEPTH,
  NODE_FILTERED,
  NODE_LOCKED,
  NODE_MASKED,
  NODE_VISIBLE,
  OVERLAY_STYLE_DEFAULTS,
} from './model.js';
export type { CommandName, CommandParams, CommandResult, Commands } from './commands.js';
export { COMMAND_NAMES } from './commands.js';
export type {
  ProtocolError,
  ProtocolErrorCode,
  RequestEnvelope,
  ResponseEnvelope,
} from './envelope.js';
export { PROTOCOL_VERSION } from './envelope.js';

/** Name of the global the host lives under inside the inspected page. */
export const HOST_GLOBAL = '__SI__';
