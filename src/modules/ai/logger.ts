const enabled = import.meta.env.DEV;

const tag = (label: string) =>
  [`%c[ai]%c ${label}`, "color:#a78bfa;font-weight:600", "color:inherit"];

function log(label: string, ...rest: unknown[]) {
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.log(...tag(label), ...rest);
}

function group(label: string, payload: unknown) {
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.groupCollapsed(...tag(label));
  // eslint-disable-next-line no-console
  console.log(payload);
  // eslint-disable-next-line no-console
  console.groupEnd();
}

function warn(label: string, ...rest: unknown[]) {
  // eslint-disable-next-line no-console
  console.warn(...tag(label), ...rest);
}

function error(label: string, ...rest: unknown[]) {
  // eslint-disable-next-line no-console
  console.error(...tag(label), ...rest);
}

export const logger = { log, group, warn, error };
