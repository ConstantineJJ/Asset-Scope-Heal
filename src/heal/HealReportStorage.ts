import type { HealOperationReport } from '../types';
import { healMetricKeys } from './HealVerification';

const STORAGE_KEY = 'asset-doctor.last-heal.v2';
type ReportStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readHealReport(storage?: ReportStorage): HealOperationReport | null {
  try {
    const report = JSON.parse((storage ?? window.localStorage).getItem(STORAGE_KEY) ?? 'null');
    const status = (value: unknown) => ['VERIFIED', 'PARTIAL', 'REGRESSION'].includes(value as string);
    const metrics = (value: any) => value && healMetricKeys.every(key => Number.isInteger(value[key]) && value[key] >= 0);
    if (!report || report.version !== 2 || report.operation !== 'remove-degenerate-triangles' ||
        !['operationId', 'assetName', 'meshUuid', 'meshName', 'appliedAt'].every(key => typeof report[key] === 'string') ||
        !status(report.status) || !status(report.targetStatus) ||
        !['pending', 'complete', 'failed'].includes(report.pipeline) ||
        !Number.isInteger(report.expectedRemoved) || report.expectedRemoved < 1 ||
        !metrics(report.before) || (report.after !== null && !metrics(report.after)) ||
        !Array.isArray(report.reasons) || !report.reasons.every((reason: unknown) => typeof reason === 'string') ||
        (report.undoneAt !== undefined && typeof report.undoneAt !== 'string')) return null;
    // A reload during verification is incomplete evidence, never a successful check.
    if (report.pipeline !== 'complete' && report.status !== 'REGRESSION') report.status = 'PARTIAL';
    return report;
  } catch { return null; }
}

export function saveHealReport(report: HealOperationReport, storage?: ReportStorage): boolean {
  try {
    (storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(report));
    return true;
  } catch { return false; }
}
