import path from 'node:path';
import { loadAndValidateTemplate } from '../services/templateService';

async function main() {
  try {
    const filePath = path.resolve(process.cwd(), 'template.json');
    const tpl = await loadAndValidateTemplate(filePath);
    // Minimal success output
    console.log(`OK: template '${tpl.name}' (version ${tpl.version}) is valid.`);
    process.exit(0);
  } catch (e: any) {
    console.error(e?.message || e);
    process.exit(1);
  }
}

main();

