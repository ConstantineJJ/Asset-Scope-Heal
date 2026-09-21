import { runSyntheticTopologyTests } from '../src/analysis/SyntheticTopologyTests';
import { runDiagnosticCoreTests } from '../src/analysis/DiagnosticCoreTests';
import { runSurgicalHealTests } from '../src/heal/SurgicalHealTests';

const results = [...runSyntheticTopologyTests(), ...runDiagnosticCoreTests(), ...runSurgicalHealTests()];
for (const result of results) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}${result.passed ? '' : `: ${result.actual} (expected ${result.expected})`}`);
}
console.log(`${results.filter(result => result.passed).length}/${results.length} PASSED`);
if (results.some(result => !result.passed)) process.exitCode = 1;
