import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

export interface SavedConfig {
  deviceName: string;
  downloadPath: string;
  serverUrl: string;
  secret: string;
}

const DEFAULT_SERVER = 'wss://zoomrecordingdownloader-production.up.railway.app/ws';
const DEFAULT_SECRET = 'HoVanTrong@3773';

function getConfigPath(): string {
  // When packaged with pkg, use directory of the exe
  // In dev mode, use current working directory
  const isPkg = (process as any).pkg !== undefined;
  const baseDir = isPkg ? path.dirname(process.execPath) : process.cwd();
  return path.join(baseDir, 'zoom-agent.config.json');
}

export function loadConfig(): SavedConfig | null {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return data as SavedConfig;
    }
  } catch {
    // Config corrupt or unreadable
  }
  return null;
}

export function saveConfig(config: SavedConfig): void {
  const configPath = getConfigPath();
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`[Config] Saved to: ${configPath}`);
  } catch {
    // Fallback to %APPDATA%
    const appDataDir = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'ZoomAgent');
    fs.mkdirSync(appDataDir, { recursive: true });
    const fallbackPath = path.join(appDataDir, 'zoom-agent.config.json');
    fs.writeFileSync(fallbackPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`[Config] Saved to: ${fallbackPath}`);
  }
}

function ask(rl: readline.Interface, question: string, defaultVal: string): Promise<string> {
  return new Promise(resolve => {
    const prompt = defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `;
    rl.question(prompt, answer => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

export async function promptSetup(existing?: Partial<SavedConfig>): Promise<SavedConfig> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║       Zoom Agent - Cau Hinh Thiet Bi        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  const deviceName = await ask(rl, '  Ten thiet bi', existing?.deviceName || os.hostname());
  const downloadPath = await ask(rl, '  Thu muc tai ve', existing?.downloadPath || path.resolve('./downloads'));
  const serverUrl = await ask(rl, '  Server URL', existing?.serverUrl || DEFAULT_SERVER);
  const secret = await ask(rl, '  Secret key', existing?.secret || DEFAULT_SECRET);

  rl.close();

  const config: SavedConfig = { deviceName, downloadPath, serverUrl, secret };
  saveConfig(config);

  console.log('');
  console.log('  Da luu cau hinh thanh cong!');
  console.log('');

  return config;
}

export function getConfigFilePath(): string {
  return getConfigPath();
}

export { DEFAULT_SERVER, DEFAULT_SECRET };
