const esbuild = require('esbuild');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const outFile = path.resolve(__dirname, '..', 'dist', 'agent', 'ZoomAgent.js');
const outDir = path.dirname(outFile);
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));

// Ensure output directory
fs.mkdirSync(outDir, { recursive: true });

console.log(`[1/2] Bundling agent v${pkg.version} with esbuild...`);

esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '..', 'src', 'agent', 'AgentClient.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: outFile,
  minify: false,
  sourcemap: false,
  // Inject version from package.json
  define: {
    'process.env.AGENT_VERSION': JSON.stringify(pkg.version),
  },
  // Mark native modules as external (none needed for agent)
  external: ['bufferutil', 'utf-8-validate'],
});

console.log(`   → ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);

// Check if --exe flag is passed
if (process.argv.includes('--exe')) {
  console.log('[2/2] Packaging into standalone .exe with pkg...');
  try {
    execSync(
      `npx @yao-pkg/pkg "${outFile}" --targets node18-win-x64 --output "${path.resolve(outDir, 'ZoomAgent.exe')}" --compress GZip`,
      { stdio: 'inherit', cwd: path.resolve(__dirname, '..') }
    );
    const exeSize = fs.statSync(path.resolve(outDir, 'ZoomAgent.exe')).size;
    console.log(`   → ZoomAgent.exe (${(exeSize / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    console.error('Failed to create .exe. Make sure @yao-pkg/pkg is installed.');
    process.exit(1);
  }
} else {
  console.log('[2/2] Skipping .exe (use --exe to create standalone executable)');
  console.log('');
  console.log('Done! Run with:');
  console.log('  node dist/agent/ZoomAgent.js --server wss://your-server/ws --name "My PC" --path "D:\\Downloads"');
}
