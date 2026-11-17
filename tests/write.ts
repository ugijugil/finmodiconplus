import { writeFileSync } from 'node:fs';
import { exportXlsxBuffer } from '../src/exportXlsx';
import { exampleSimulation } from '../src/defaults';
import { DEFAULT_RATE_CARD } from '../src/rateCard';
(async () => {
  const buf = await exportXlsxBuffer(exampleSimulation(), DEFAULT_RATE_CARD);
  writeFileSync(process.argv[2], Buffer.from(buf as ArrayBuffer));
})();
