import axios from 'axios';

const GITHUB_REPO = 'tronghv77/zoom_recording_downloader';
const RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  downloadUrl: string;
}

function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [lMaj, lMin = 0, lPatch = 0] = parse(latest);
  const [cMaj, cMin = 0, cPatch = 0] = parse(current);

  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPatch > cPatch;
}

export async function getUpdateInfo(currentVersion: string): Promise<UpdateInfo> {
  try {
    const response = await axios.get(RELEASES_URL, {
      headers: { 'User-Agent': 'ZoomAgent' },
      timeout: 5000,
    });

    const latestTag = response.data.tag_name || '';
    const latestVersion = latestTag.replace(/^v/, '');
    const exeAsset = response.data.assets?.find((a: any) => a.name.endsWith('.exe'));
    const downloadUrl = exeAsset?.browser_download_url || response.data.html_url || '';

    return {
      hasUpdate: isNewerVersion(latestVersion, currentVersion),
      latestVersion,
      currentVersion,
      downloadUrl,
    };
  } catch {
    return {
      hasUpdate: false,
      latestVersion: currentVersion,
      currentVersion,
      downloadUrl: '',
    };
  }
}

export async function checkForUpdate(currentVersion: string): Promise<void> {
  const info = await getUpdateInfo(currentVersion);
  if (info.hasUpdate) {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log(`  ║  Co phien ban moi: v${info.latestVersion}`.padEnd(49) + '║');
    console.log(`  ║  Phien ban hien tai: v${info.currentVersion}`.padEnd(49) + '║');
    console.log('  ║                                              ║');
    console.log(`  ║  Tai ve: ${info.downloadUrl}`.padEnd(49) + '║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
  }
}
