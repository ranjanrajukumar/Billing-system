import { Company, FeatureFlag } from '../models/index.js';
import { CORE_MODULE_KEYS, MODULES, resolveModules } from '../config/modules.js';

/**
 * The company's operating configuration — business mode, enabled modules and
 * the stock policy — read once and cached briefly.
 *
 * Nearly every request needs to know whether a module is on, so this cannot be
 * a database round trip each time; and nothing here changes without going
 * through `invalidateConfig()`, so a short cache cannot serve a stale answer
 * for long.
 */

const CACHE_MS = 30_000;
let cache = { at: 0, value: null };

export function invalidateConfig() {
  cache = { at: 0, value: null };
}

export async function getConfig() {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;

  const [company, flagRows] = await Promise.all([
    Company.findOne(),
    FeatureFlag.findAll({ where: { detstatus: false } }).catch(() => []),
  ]);

  const flags = Object.fromEntries(flagRows.map((row) => [row.moduleKey, row.enabled]));
  const mode = company?.businessMode || 'Basic';
  const modules = resolveModules({ mode, flags });

  const value = {
    mode,
    modules,
    flags,
    allowNegativeStock: Boolean(company?.allowNegativeStock),
    multiBranch: Boolean(company?.multiBranchEnabled),
    companyState: company?.state || null,
    currency: company?.currency || 'INR',
  };

  cache = { at: Date.now(), value };
  return value;
}

export async function isModuleEnabled(key) {
  const { modules } = await getConfig();
  return modules.has(key);
}

/**
 * Route guard: refuses a request whose module is switched off.
 *
 * A disabled module must be unreachable through the API and not merely hidden
 * from the sidebar — otherwise "disabled" is a UI suggestion rather than a
 * setting, and a stale browser tab or a direct call walks straight past it.
 */
export function requireModule(key) {
  return async (_req, res, next) => {
    try {
      if (await isModuleEnabled(key)) return next();
      return res.status(403).json({
        message: `The ${MODULES.find((m) => m.key === key)?.label || key} module is not enabled for this company.`,
        module: key,
      });
    } catch (error) {
      return next(error);
    }
  };
}

/** The module list with its current state, for the settings screen. */
export async function moduleStatus() {
  const { mode, modules, flags } = await getConfig();
  return MODULES.map((module) => ({
    key: module.key,
    label: module.label,
    mode: module.mode,
    core: Boolean(module.core),
    // Advanced modules simply do not exist in Basic mode.
    available: module.mode === 'Basic' || mode === 'Advanced',
    enabled: modules.has(module.key),
    locked: CORE_MODULE_KEYS.includes(module.key),
    flag: flags[module.key],
  }));
}
