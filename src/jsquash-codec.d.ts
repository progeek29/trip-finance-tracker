/** Local typings for jsquash deep codec imports (Vite bundles the ST glue; WASM comes from /codec). */
declare module '@jsquash/avif/codec/enc/avif_enc.js' {
  const factory: unknown;
  export default factory;
}
declare module '@jsquash/avif/utils.js' {
  export function initEmscriptenModule(a: unknown, b?: unknown, c?: Record<string, unknown>): Promise<unknown>;
}
declare module '@jsquash/avif/meta.js' {
  export const defaultOptions: Record<string, unknown>;
}
declare module '@jsquash/jpeg/codec/enc/mozjpeg_enc.js' {
  const factory: unknown;
  export default factory;
}
declare module '@jsquash/jpeg/utils.js' {
  export function initEmscriptenModule(a: unknown, b?: unknown, c?: Record<string, unknown>): Promise<unknown>;
}
declare module '@jsquash/jpeg/meta.js' {
  export const defaultOptions: Record<string, unknown>;
}
