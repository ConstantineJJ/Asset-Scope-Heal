import React, { useState } from 'react';
import { CheckCircle2, RefreshCw, TestTube2, X, XCircle } from 'lucide-react';
import {
  runSyntheticTopologyTests,
  type TopologyTestResult,
} from '../analysis/SyntheticTopologyTests';

interface TopologyTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TopologyTestModal: React.FC<TopologyTestModalProps> = ({ isOpen, onClose }) => {
  const [results, setResults] = useState<TopologyTestResult[]>(() => runSyntheticTopologyTests());

  if (!isOpen) return null;

  const handleRerun = () => {
    setResults(runSyntheticTopologyTests());
  };

  const allPassed = results.every((r) => r.passed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-[#1a1c22] border border-[#333742] rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] text-xs text-gray-200">
        {/* Modal Header */}
        <div className="h-12 px-4 border-b border-[#2d313a] flex items-center justify-between bg-[#15171c]">
          <div className="flex items-center space-x-2">
            <TestTube2 className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-sm text-gray-100">
              Topology Algorithm Unit Test Suite
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRerun}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#242730] hover:bg-[#2e323c] text-cyan-400 border border-[#373b46] cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Rerun Tests</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-[#282c35] rounded text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Status Header */}
        <div className="px-4 py-2.5 bg-[#17191e] border-b border-[#262932] flex items-center justify-between">
          <span className="text-gray-300">
            Evaluating mathematical topology guarantees across synthetic edge cases
          </span>
          <span
            className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
              allPassed
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                : 'bg-rose-950/80 text-rose-300 border border-rose-800'
            }`}
          >
            {results.filter((r) => r.passed).length} / {results.length} PASSED
          </span>
        </div>

        {/* Test Matrix */}
        <div className="p-4 overflow-y-auto space-y-2.5 custom-scrollbar flex-1">
          {results.map((test) => (
            <div
              key={test.name}
              className={`p-3 rounded border flex flex-col space-y-1.5 ${
                test.passed
                  ? 'bg-[#181d22] border-emerald-900/50'
                  : 'bg-[#22181a] border-rose-900/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {test.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className="font-semibold text-gray-100">{test.name}</span>
                </div>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                    test.passed ? 'text-emerald-400 bg-emerald-950' : 'text-rose-400 bg-rose-950'
                  }`}
                >
                  {test.passed ? 'PASSED' : 'FAILED'}
                </span>
              </div>

              <p className="text-gray-400 text-[11px] pl-6">{test.description}</p>

              <div className="ml-6 grid grid-cols-2 gap-2 text-[10px] font-mono pt-1 text-gray-300">
                <div className="p-1 rounded bg-[#131518] border border-[#242730]">
                  <span className="text-gray-400 block">Expected:</span>
                  <span>{test.expected}</span>
                </div>
                <div className="p-1 rounded bg-[#131518] border border-[#242730]">
                  <span className="text-gray-400 block">Actual:</span>
                  <span>{test.actual}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 bg-[#15171c] border-t border-[#262932] flex items-center justify-between text-gray-400 text-[11px]">
          <span>Synthetic models run in isolated memory without Three.js renderer mutation.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
