import React, { useEffect, useRef } from 'react';
import type { HealOperationReport, HealUndoState } from '../types';
import { healMetricKeys } from '../heal/HealVerification';
import { useI18n } from '../i18n';

interface Props {
  report: HealOperationReport | null;
  historical: boolean;
  busy: boolean;
  error: string | null;
  storageFailed: boolean;
  undoState: HealUndoState;
  onUndo: () => void;
}

export function HealReportPanel({ report, historical, busy, error, storageFailed, undoState, onUndo }: Props) {
  const { t } = useI18n();
  const reportRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!historical) reportRef.current?.scrollIntoView({ block: 'nearest' });
  }, [report?.operationId, report?.status, report?.undoneAt, historical]);
  if (!report) return null;
  const color = report.status === 'REGRESSION' ? 'text-rose-300 border-rose-800'
    : report.status === 'VERIFIED' ? 'text-emerald-300 border-emerald-800' : 'text-amber-300 border-amber-800';
  return (
    <section ref={reportRef} aria-label={t('heal.lastOperation')} className={`bg-[#1c1e24] border rounded p-2.5 space-y-2 ${color}`}>
      <div className="flex justify-between gap-2 items-start">
        <h3 className="text-[11px] font-semibold">{t('heal.lastOperation')}</h3>
        <strong role="status" className="text-[11px] font-mono">{report.status}</strong>
      </div>
      <div className="text-[10px] text-gray-300 break-words">{report.assetName} · {report.meshName}</div>
      <div className="text-[10px] text-gray-400 break-all">{report.appliedAt}</div>
      <p className="text-[11px]">{t(`heal.report.${report.status}`)}</p>
      {historical && <p className="text-[11px] text-amber-300">{t('heal.report.historical')}</p>}
      {report.undoneAt && <p className="text-[11px] text-cyan-300">{t('heal.report.undone')}</p>}
      <p className="text-[10px] text-gray-400">{t('heal.report.scope')}</p>
      <table className="w-full text-[10px] text-gray-300 tabular-nums">
        <caption className="text-left mb-1">{t('heal.report.measured')}</caption>
        <thead><tr>
          <th className="text-left">{t('heal.report.metric')}</th>
          <th>{t('heal.report.before')}</th><th>{t('heal.report.after')}</th><th>{t('heal.report.delta')}</th>
        </tr></thead>
        <tbody>{healMetricKeys.map(key => {
          const after = report.after?.[key];
          const delta = after === undefined ? null : after - report.before[key];
          return <tr key={key} className="border-t border-gray-800">
            <th className="text-left font-normal py-0.5">{t(`heal.metrics.${key}`)}</th>
            <td className="text-center">{report.before[key]}</td>
            <td className="text-center">{after ?? t('heal.report.unavailable')}</td>
            <td className="text-center">{delta === null ? '—' : delta > 0 ? `+${delta}` : delta}</td>
          </tr>;
        })}</tbody>
      </table>
      {report.reasons.map(reason => <p key={reason} className="text-[10px]">{t(`heal.reasons.${reason}`)}</p>)}
      <p className="text-[10px] text-gray-400">{t(`heal.report.pipeline_${report.pipeline}`)}</p>
      {storageFailed && <p role="alert" className="text-[11px] text-amber-300">{t('heal.report.storageFailed')}</p>}
      {error && <p role="alert" className="text-[11px] text-rose-300">{error}</p>}
      {undoState.available && <button onClick={onUndo} disabled={busy}
        className="px-2 py-1 border rounded text-[11px] disabled:opacity-40 cursor-pointer">
        {t('heal.undo')} · {undoState.meshName}
      </button>}
    </section>
  );
}
